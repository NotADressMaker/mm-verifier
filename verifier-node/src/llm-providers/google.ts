import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../utils/logger';
import { ProviderCallResult, ProviderRequest } from '../../../shared/providers/interface';
import { hashUtf8 } from '../../../shared/canonicalJson';

let genAI: GoogleGenerativeAI;

/**
 * Initialize Google Generative AI client
 */
export function initializeGoogle() {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY not configured');
  }

  genAI = new GoogleGenerativeAI(apiKey);
  logger.info('Google Generative AI client initialized');
}

/**
 * Query Google model
 */
export async function queryGoogle(
  request: ProviderRequest
): Promise<ProviderCallResult> {
  try {
    if (!genAI) {
      initializeGoogle();
    }

    const model = request.model ?? 'gemini-pro';
    logger.info('Querying Google', { model, promptLength: request.prompt.length });

    const startTime = Date.now();

    const generativeModel = genAI.getGenerativeModel({ model });

    const result = await generativeModel.generateContent(request.prompt);
    const response = result.response.text();

    const duration = Date.now() - startTime;

    logger.info('Google response received', {
      model,
      duration,
      responseLength: response.length,
    });

    return {
      provider_id: 'google',
      model_name: model,
      latency_ms: duration,
      temperature: request.temperature,
      top_p: request.top_p,
      max_tokens: request.max_tokens,
      system_prompt_hash: request.system_prompt ? hashUtf8(request.system_prompt) : undefined,
      request_id: request.request_id,
      provider_request_id: result.response.candidates?.[0]?.index?.toString(),
      raw_response: {
        finish_reason: result.response.candidates?.[0]?.finishReason,
        safety_ratings: result.response.candidates?.[0]?.safetyRatings,
      },
      normalized_text: response.trim(),
      status: 'ok',
    };
  } catch (error: any) {
    logger.error('Google query failed:', error);
    throw new Error(`Google query failed: ${error.message}`);
  }
}

/**
 * Validate Google model name
 */
export function isValidGoogleModel(model: string): boolean {
  const validModels = [
    'gemini-pro',
    'gemini-pro-vision',
    'gemini-ultra',
  ];
  return validModels.includes(model);
}
