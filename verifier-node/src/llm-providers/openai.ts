import OpenAI from 'openai';
import { logger } from '../utils/logger';
import { ProviderCallResult, ProviderRequest } from '../../../shared/providers/interface';
import { hashUtf8 } from '../../../shared/canonicalJson';

let openaiClient: OpenAI;

/**
 * Initialize OpenAI client
 */
export function initializeOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  openaiClient = new OpenAI({ apiKey });
  logger.info('OpenAI client initialized');
}

/**
 * Query OpenAI model
 */
export async function queryOpenAI(
  request: ProviderRequest
): Promise<ProviderCallResult> {
  try {
    if (!openaiClient) {
      initializeOpenAI();
    }

    const model = request.model ?? 'gpt-4';
    logger.info('Querying OpenAI', { model, promptLength: request.prompt.length });

    const startTime = Date.now();

    const completion = await openaiClient.chat.completions.create({
      model,
      messages: [
        ...(request.system_prompt ? [{ role: 'system', content: request.system_prompt }] : []),
        { role: 'user', content: request.prompt },
      ],
      temperature: request.temperature ?? 0.1,
      max_tokens: request.max_tokens ?? 2000,
      top_p: request.top_p,
      seed: request.seed,
    });

    const duration = Date.now() - startTime;

    const response = completion.choices[0].message.content || '';

    logger.info('OpenAI response received', {
      model,
      duration,
      responseLength: response.length,
      tokensUsed: completion.usage?.total_tokens,
    });

    return {
      provider_id: 'openai',
      model_name: completion.model,
      latency_ms: duration,
      tokens_in: completion.usage?.prompt_tokens,
      tokens_out: completion.usage?.completion_tokens,
      temperature: request.temperature ?? 0.1,
      top_p: request.top_p,
      max_tokens: request.max_tokens ?? 2000,
      seed: request.seed,
      system_prompt_hash: request.system_prompt ? hashUtf8(request.system_prompt) : undefined,
      request_id: request.request_id,
      provider_request_id: completion.id,
      raw_response: {
        id: completion.id,
        model: completion.model,
        finish_reason: completion.choices[0].finish_reason,
      },
      normalized_text: response.trim(),
      status: 'ok',
    };
  } catch (error: any) {
    logger.error('OpenAI query failed:', error);
    throw new Error(`OpenAI query failed: ${error.message}`);
  }
}

/**
 * Validate OpenAI model name
 */
export function isValidOpenAIModel(model: string): boolean {
  const validModels = [
    'gpt-4',
    'gpt-4-turbo',
    'gpt-4-turbo-preview',
    'gpt-3.5-turbo',
    'gpt-3.5-turbo-16k',
  ];
  return validModels.includes(model);
}
