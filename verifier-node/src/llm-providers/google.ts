import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../utils/logger';

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
  prompt: string,
  model: string = 'gemini-pro'
): Promise<{
  response: string;
  model: string;
  timestamp: number;
  metadata: any;
}> {
  try {
    if (!genAI) {
      initializeGoogle();
    }

    logger.info('Querying Google', { model, promptLength: prompt.length });

    const startTime = Date.now();

    const generativeModel = genAI.getGenerativeModel({ model });

    const result = await generativeModel.generateContent(prompt);
    const response = result.response.text();

    const duration = Date.now() - startTime;

    logger.info('Google response received', {
      model,
      duration,
      responseLength: response.length,
    });

    return {
      response,
      model,
      timestamp: Date.now(),
      metadata: {
        duration,
        finishReason: result.response.candidates?.[0]?.finishReason,
        safetyRatings: result.response.candidates?.[0]?.safetyRatings,
      },
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
