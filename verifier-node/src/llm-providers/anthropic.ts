import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger';
import { ProviderCallResult, ProviderRequest } from '../../../shared/providers/interface';
import { hashUtf8 } from '../../../shared/canonicalJson';

let anthropicClient: Anthropic;

/**
 * Initialize Anthropic client
 */
export function initializeAnthropic() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  anthropicClient = new Anthropic({ apiKey });
  logger.info('Anthropic client initialized');
}

/**
 * Query Anthropic model
 */
export async function queryAnthropic(
  request: ProviderRequest
): Promise<ProviderCallResult> {
  try {
    if (!anthropicClient) {
      initializeAnthropic();
    }

    const model = request.model ?? 'claude-3-opus-20240229';
    logger.info('Querying Anthropic', { model, promptLength: request.prompt.length });

    const startTime = Date.now();

    const message = await anthropicClient.messages.create({
      model,
      max_tokens: request.max_tokens ?? 2000,
      temperature: request.temperature ?? 0.1,
      top_p: request.top_p,
      messages: [
        ...(request.system_prompt
          ? [{ role: 'system', content: request.system_prompt }]
          : []),
        { role: 'user', content: request.prompt },
      ],
    });

    const duration = Date.now() - startTime;

    const response = message.content[0].type === 'text' ? message.content[0].text : '';

    logger.info('Anthropic response received', {
      model,
      duration,
      responseLength: response.length,
      tokensUsed: message.usage.output_tokens + message.usage.input_tokens,
    });

    return {
      provider_id: 'anthropic',
      model_name: message.model,
      latency_ms: duration,
      tokens_in: message.usage.input_tokens,
      tokens_out: message.usage.output_tokens,
      temperature: request.temperature ?? 0.1,
      top_p: request.top_p,
      max_tokens: request.max_tokens ?? 2000,
      system_prompt_hash: request.system_prompt ? hashUtf8(request.system_prompt) : undefined,
      request_id: request.request_id,
      provider_request_id: message.id,
      raw_response: {
        id: message.id,
        model: message.model,
        stop_reason: message.stop_reason,
      },
      normalized_text: response.trim(),
      status: 'ok',
    };
  } catch (error: any) {
    logger.error('Anthropic query failed:', error);
    throw new Error(`Anthropic query failed: ${error.message}`);
  }
}

/**
 * Validate Anthropic model name
 */
export function isValidAnthropicModel(model: string): boolean {
  const validModels = [
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
    'claude-2.1',
    'claude-2.0',
  ];
  return validModels.includes(model);
}
