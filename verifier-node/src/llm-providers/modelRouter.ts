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

export interface ModelResponse {
  response: string;
  model: string;
  provider: string;
  timestamp: number;
  metadata: any;
  /** Model commitment hashes for accountability */
  model_commitment?: ModelCommitment;
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
    let result: ModelResponse;
    let provider: string;

    // OpenAI models
    if (isValidOpenAIModel(model) || model.startsWith('gpt-')) {
      const queryResult = await queryOpenAI(prompt, model);
      provider = 'openai';
      result = { ...queryResult, provider };
    }
    // Anthropic models
    else if (isValidAnthropicModel(model) || model.startsWith('claude-')) {
      const queryResult = await queryAnthropic(prompt, model);
      provider = 'anthropic';
      result = { ...queryResult, provider };
    }
    // Google models
    else if (isValidGoogleModel(model) || model.startsWith('gemini-')) {
      const queryResult = await queryGoogle(prompt, model);
      provider = 'google';
      result = { ...queryResult, provider };
    } else {
      throw new Error(`Unknown model: ${model}`);
    }

    // Compute model commitment for accountability
    const commitment = computeModelRunCommitment(
      provider,
      model,
      inferenceConfig
    );
    result.model_commitment = commitment;

    logger.debug('Model commitment computed', {
      model,
      provider,
      commitmentHash: commitment.model_commitment_hash.slice(0, 18) + '...',
    });

    return result;
  } catch (error: any) {
    logger.error('Model query failed:', { model, error: error.message });
    throw error;
  }
}

/**
 * Query multiple models in parallel
 */
export async function queryMultipleModels(
  prompt: string,
  models: string[]
): Promise<ModelResponse[]> {
  logger.info('Querying multiple models', { models, count: models.length });

  const startTime = Date.now();

  try {
    const promises = models.map((model) => queryModel(prompt, model));
    const results = await Promise.allSettled(promises);

    const successful: ModelResponse[] = [];
    const failed: string[] = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successful.push(result.value);
      } else {
        failed.push(models[index]);
        logger.error('Model query failed', {
          model: models[index],
          error: result.reason,
        });
      }
    });

    const duration = Date.now() - startTime;

    logger.info('Multi-model query completed', {
      total: models.length,
      successful: successful.length,
      failed: failed.length,
      duration,
    });

    if (successful.length === 0) {
      throw new Error('All model queries failed');
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
