import { ClaimType } from '../core/models';

export function classifyClaim(text: string): ClaimType {
  const value = text.toLowerCase();
  if (/\b(doi|isbn|citation|et al\.|published|journal)\b/.test(value)) return 'bibliographic';
  if (/\b(iff|if and only if|implies|therefore|premise|conclusion)\b/.test(value)) return 'logical';
  if (/\b(countable|integer|equation|theorem|proof|\d+\s*[+=<>])/i.test(text)) return 'mathematical';
  if (/\b(will|predict|forecast|by \d{4})\b/.test(value)) return 'predictive';
  if (/\b(should|ought|must|better than)\b/.test(value)) return 'normative';
  if (/\b(means|defined as|definition)\b/.test(value)) return 'definitional';
  if (/\b(suggests|interprets|symbolizes)\b/.test(value)) return 'interpretive';
  if (/\b(was|were|founded|century|historically)\b/.test(value)) return 'historical';
  if (/\b(is|are|has|have|causes|contains|exists|boils|increases|decreases)\b/.test(value)) return 'empirical';
  return 'unknown';
}
