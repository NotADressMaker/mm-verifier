import { queryOpenAI, isValidOpenAIModel } from './openai';
import { queryAnthropic, isValidAnthropicModel } from './anthropic';
import { queryGoogle, isValidGoogleModel } from './google';
import { logger } from '../utils/logger';
import {
  computeModelCommitment,
  ModelCommitment,
  ModelCommitmentData,
  InferenceConfig,
} from '../../../shared/transparency';
import { ProviderCallResult, ProviderRequest } from '../../../shared/providers/interface';
import { executeProviderCall } from '../providers/providerControl';
import { recordProviderError, recordProviderSuccess, getSlashedProviders } from '../providers/trust';
import { verifierMetrics } from '../observability/metrics';
import { FACTUAL_WORLD_ANALYSIS_SYSTEM_PROMPT } from './verificationPrompt';

export interface ModelResponse {
  response: string;
  model: string;
  provider: string;
  timestamp: number;
  metadata: any;
  /** Model commitment hashes for accountability */
  model_commitment?: ModelCommitment;
  provider_call?: ProviderCallResult;
  tokens_used?: number;
}

/**
 * Default inference config used when not specified.
 */
export const DEFAULT_INFERENCE_CONFIG: InferenceConfig = {
  temperature: 0.7,
  max_tokens: 4096,
};

/**
 * Compute model commitment for a model run.
 */
export function computeModelRunCommitment(
  provider: string,
  model: string,
  inferenceConfig?: InferenceConfig
): ModelCommitment {
  const data: ModelCommitmentData = {
    provider,
    model,
    inference_config: inferenceConfig ?? DEFAULT_INFERENCE_CONFIG,
  };

  return computeModelCommitment(data);
}

/**
 * Route query to appropriate LLM provider
 */
export async function queryModel(
  prompt: string,
  model: string,
  inferenceConfig?: InferenceConfig
): Promise<ModelResponse> {
  logger.info('Routing query to model', { model });

  try {
    let result: ProviderCallResult;
    let provider: string;

    const request: ProviderRequest = {
      prompt,
      model,
      system_prompt: FACTUAL_WORLD_ANALYSIS_SYSTEM_PROMPT,
      temperature: inferenceConfig?.temperature ?? DEFAULT_INFERENCE_CONFIG.temperature,
      max_tokens: inferenceConfig?.max_tokens ?? DEFAULT_INFERENCE_CONFIG.max_tokens,
    };

    // OpenAI models
    if (isValidOpenAIModel(model) || model.startsWith('gpt-')) {
      provider = 'openai';
      result = await executeProviderCall(provider, model, () => queryOpenAI(request));
    }
    // Anthropic models
    else if (isValidAnthropicModel(model) || model.startsWith('claude-')) {
      provider = 'anthropic';
      result = await executeProviderCall(provider, model, () => queryAnthropic(request));
    }
    // Google models
    else if (isValidGoogleModel(model) || model.startsWith('gemini-')) {
      provider = 'google';
      result = await executeProviderCall(provider, model, () => queryGoogle(request));
    } else {
      throw new Error(`Unknown model: ${model}`);
    }

    if (result.status !== 'ok') {
      recordProviderError(provider, model, result.error_type === 'circuit_open' ? 'hard' : 'soft');
      throw new Error(result.error ?? `Provider ${provider} failed`);
    }

    recordProviderSuccess(provider, model);
    verifierMetrics.metrics.providerLatencyMs
      .labels(provider, model)
      .observe(result.latency_ms);

    // Compute model commitment for accountability
    const commitment = computeModelRunCommitment(
      provider,
      model,
      inferenceConfig
    );
    result.model_commitment_hash = commitment.model_commitment_hash;

    logger.debug('Model commitment computed', {
      model,
      provider,
      commitmentHash: commitment.model_commitment_hash.slice(0, 18) + '...',
    });

    return {
      response: result.normalized_text,
      model: result.model_name,
      provider,
      timestamp: Date.now(),
      metadata: {
        duration: result.latency_ms,
        tokensUsed:
          (result.tokens_in ?? 0) +
          (result.tokens_out ?? 0),
        promptTokens: result.tokens_in,
        completionTokens: result.tokens_out,
        temperature: result.temperature,
        maxTokens: result.max_tokens,
        topP: result.top_p,
        seed: result.seed,
        requestId: result.request_id,
        retries: result.retries,
      },
      model_commitment: commitment,
      provider_call: result,
      tokens_used: (result.tokens_in ?? 0) + (result.tokens_out ?? 0),
    };
  } catch (error: any) {
    logger.error('Model query failed:', { model, error: error.message });
    throw error;
  }
}

/**
 * Minimum fraction of requested models that must succeed for a result to be
 * considered a valid quorum. Mirrors the ⅔ supermajority used in BFT consensus.
 */
const QUORUM_FRACTION = parseFloat(process.env.QUORUM_FRACTION || '0.6667');

/**
 * Query multiple models in parallel, enforcing a BFT-style quorum.
 *
 * Slashed providers are skipped before dispatch. If fewer than ⌈QUORUM_FRACTION
 * × requested⌉ models respond successfully the call fails — a bare majority is
 * not sufficient to produce a trustworthy consensus score.
 */
export async function queryMultipleModels(
  prompt: string,
  models: string[]
): Promise<ModelResponse[]> {
  const slashed = getSlashedProviders();

  const eligibleModels = models.filter((m) => {
    const provider = getModelProvider(m);
    const key = `${provider}:${m}`;
    if (slashed.has(key)) {
      logger.warn('Skipping slashed provider', { model: m, provider });
      return false;
    }
    return true;
  });

  // Quorum is computed against the original requested set so callers cannot
  // artificially lower the bar by passing fewer models.
  const quorumRequired = Math.ceil(models.length * QUORUM_FRACTION);

  logger.info('Querying multiple models', {
    requested: models.length,
    eligible: eligibleModels.length,
    slashed: models.length - eligibleModels.length,
    quorumRequired,
  });

  const startTime = Date.now();

  try {
    const promises = eligibleModels.map((model) => queryModel(prompt, model));
    const results = await Promise.allSettled(promises);

    const successful: ModelResponse[] = [];
    const failed: string[] = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successful.push(result.value);
      } else {
        failed.push(eligibleModels[index]);
        logger.error('Model query failed', {
          model: eligibleModels[index],
          error: result.reason,
        });
      }
    });

    const duration = Date.now() - startTime;

    logger.info('Multi-model query completed', {
      total: models.length,
      eligible: eligibleModels.length,
      successful: successful.length,
      failed: failed.length,
      quorumRequired,
      quorumMet: successful.length >= quorumRequired,
      duration,
    });

    if (successful.length === 0) {
      throw new Error('All model queries failed');
    }

    if (successful.length < quorumRequired) {
      throw new Error(
        `Quorum not met: ${successful.length}/${models.length} models responded ` +
          `(required ≥${quorumRequired})`
      );
    }

    return successful;
  } catch (error: any) {
    logger.error('Multi-model query failed:', error);
    throw error;
  }
}

/**
 * Get provider for a model
 */
export function getModelProvider(model: string): string {
  if (isValidOpenAIModel(model) || model.startsWith('gpt-')) {
    return 'openai';
  }
  if (isValidAnthropicModel(model) || model.startsWith('claude-')) {
    return 'anthropic';
  }
  if (isValidGoogleModel(model) || model.startsWith('gemini-')) {
    return 'google';
  }
  return 'unknown';
}
