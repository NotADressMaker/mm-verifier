import { logger } from '../utils/logger';

/**
 * Extract factual claims from text
 * Simple implementation - could be enhanced with NLP
 */
export function extractClaims(text: string): string[] {
  const claims: string[] = [];

  // Split by sentences
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);

  for (const sentence of sentences) {
    const trimmed = sentence.trim();

    // Filter out questions, commands, and very short sentences
    if (
      trimmed.length > 20 &&
      !trimmed.endsWith('?') &&
      !trimmed.match(/^(please|let|try|consider)/i)
    ) {
      // This is likely a factual claim
      claims.push(trimmed);
    }
  }

  logger.debug('Extracted claims', { count: claims.length });

  return claims;
}

/**
 * Compare claims between two sets
 */
export function compareClaims(claims1: string[], claims2: string[]): number {
  if (claims1.length === 0 || claims2.length === 0) return 0;

  let matches = 0;

  for (const claim1 of claims1) {
    for (const claim2 of claims2) {
      if (claimsSimilar(claim1, claim2)) {
        matches++;
        break;
      }
    }
  }

  return matches / Math.max(claims1.length, claims2.length);
}

/**
 * Check if two claims are similar
 */
function claimsSimilar(claim1: string, claim2: string): boolean {
  const words1 = new Set(claim1.toLowerCase().split(/\s+/));
  const words2 = new Set(claim2.toLowerCase().split(/\s+/));

  const intersection = new Set([...words1].filter((x) => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  const similarity = intersection.size / union.size;

  return similarity > 0.5;
}
