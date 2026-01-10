import OpenAI from 'openai';
import { logger } from '../utils/logger';

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
  prompt: string,
  model: string = 'gpt-4'
): Promise<{
  response: string;
  model: string;
  timestamp: number;
  metadata: any;
}> {
  try {
    if (!openaiClient) {
      initializeOpenAI();
    }

    logger.info('Querying OpenAI', { model, promptLength: prompt.length });

    const startTime = Date.now();

    const completion = await openaiClient.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1, // Low temperature for consistency
      max_tokens: 2000,
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
      response,
      model: completion.model,
      timestamp: Date.now(),
      metadata: {
        finishReason: completion.choices[0].finish_reason,
        tokensUsed: completion.usage?.total_tokens,
        promptTokens: completion.usage?.prompt_tokens,
        completionTokens: completion.usage?.completion_tokens,
        duration,
      },
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
