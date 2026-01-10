import { ModelResponse } from '../llm-providers/modelRouter';
import { logger } from '../utils/logger';

/**
 * Calculate consistency score across model responses
 */
export function calculateConsistency(responses: ModelResponse[]): number {
  if (responses.length < 2) return 100;

  logger.debug('Calculating consistency', { responseCount: responses.length });

  // Extract response texts
  const texts = responses.map((r) => r.response);

  // Calculate pairwise similarities
  let totalSimilarity = 0;
  let comparisons = 0;

  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const similarity = calculateSimilarity(texts[i], texts[j]);
      totalSimilarity += similarity;
      comparisons++;
    }
  }

  const avgSimilarity = comparisons > 0 ? totalSimilarity / comparisons : 0;
  const consistencyScore = avgSimilarity * 100;

  logger.debug('Consistency calculated', {
    avgSimilarity,
    consistencyScore,
    comparisons,
  });

  return Math.round(consistencyScore);
}

/**
 * Calculate semantic similarity between two texts
 */
function calculateSimilarity(text1: string, text2: string): number {
  // Normalize texts
  const norm1 = normalizeText(text1);
  const norm2 = normalizeText(text2);

  // Tokenize
  const tokens1 = tokenize(norm1);
  const tokens2 = tokenize(norm2);

  // Calculate Jaccard similarity
  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);

  const intersection = new Set([...set1].filter((x) => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  return intersection.size / union.size;
}

/**
 * Normalize text for comparison
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tokenize text into words
 */
function tokenize(text: string): string[] {
  return text.split(/\s+/).filter((token) => token.length > 0);
}

/**
 * Calculate response length consistency
 */
export function calculateLengthConsistency(responses: ModelResponse[]): number {
  if (responses.length < 2) return 100;

  const lengths = responses.map((r) => r.response.length);
  const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance =
    lengths.reduce((a, b) => a + Math.pow(b - avgLength, 2), 0) / lengths.length;
  const stdDev = Math.sqrt(variance);

  // Lower std dev = higher consistency
  const coefficient = stdDev / avgLength;

  // Convert to 0-100 scale (coefficient < 0.3 is considered consistent)
  return Math.max(0, Math.min(100, 100 - coefficient * 300));
}

/**
 * Check for contradictions between responses
 */
export function detectContradictions(responses: ModelResponse[]): string[] {
  const contradictions: string[] = [];

  // Simple contradiction detection
  for (let i = 0; i < responses.length; i++) {
    for (let j = i + 1; j < responses.length; j++) {
      const r1 = responses[i].response.toLowerCase();
      const r2 = responses[j].response.toLowerCase();

      // Look for opposite conclusions
      if (
        (r1.includes('yes') && r2.includes('no')) ||
        (r1.includes('true') && r2.includes('false')) ||
        (r1.includes('correct') && r2.includes('incorrect'))
      ) {
        contradictions.push(
          `${responses[i].provider}/${responses[i].model} contradicts ${responses[j].provider}/${responses[j].model}`
        );
      }
    }
  }

  return contradictions;
}
