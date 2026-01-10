import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger';

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
  prompt: string,
  model: string = 'claude-3-opus-20240229'
): Promise<{
  response: string;
  model: string;
  timestamp: number;
  metadata: any;
}> {
  try {
    if (!anthropicClient) {
      initializeAnthropic();
    }

    logger.info('Querying Anthropic', { model, promptLength: prompt.length });

    const startTime = Date.now();

    const message = await anthropicClient.messages.create({
      model,
      max_tokens: 2000,
      temperature: 0.1, // Low temperature for consistency
      messages: [{ role: 'user', content: prompt }],
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
      response,
      model: message.model,
      timestamp: Date.now(),
      metadata: {
        stopReason: message.stop_reason,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        duration,
      },
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
