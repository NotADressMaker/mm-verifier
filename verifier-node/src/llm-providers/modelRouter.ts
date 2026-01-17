import { queryOpenAI, isValidOpenAIModel } from './openai';
import { queryAnthropic, isValidAnthropicModel } from './anthropic';
import { queryGoogle, isValidGoogleModel } from './google';
import { logger } from '../utils/logger';
import { llmCache } from './cache';

export interface ModelResponse {
  response: string;
  model: string;
  provider: string;
  timestamp: number;
  metadata: any;
  cached?: boolean;
}

/**
 * Route query to appropriate LLM provider with caching
 */
export async function queryModel(prompt: string, model: string): Promise<ModelResponse> {
  logger.info('Routing query to model', { model });

  // Check cache first
  const cached = llmCache.get(prompt, model);
  if (cached) {
    logger.info('LLM cache hit', { model, cacheStats: llmCache.getStats() });
    return { ...cached, cached: true };
  }

  try {
    let result: Omit<ModelResponse, 'provider'>;

    // OpenAI models
    if (isValidOpenAIModel(model) || model.startsWith('gpt-')) {
      result = await queryOpenAI(prompt, model);
      const response = { ...result, provider: 'openai', cached: false };
      llmCache.set(prompt, model, response);
      return response;
    }

    // Anthropic models
    if (isValidAnthropicModel(model) || model.startsWith('claude-')) {
      result = await queryAnthropic(prompt, model);
      const response = { ...result, provider: 'anthropic', cached: false };
      llmCache.set(prompt, model, response);
      return response;
    }

    // Google models
    if (isValidGoogleModel(model) || model.startsWith('gemini-')) {
      result = await queryGoogle(prompt, model);
      const response = { ...result, provider: 'google', cached: false };
      llmCache.set(prompt, model, response);
      return response;
    }

    throw new Error(`Unknown model: ${model}`);
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
