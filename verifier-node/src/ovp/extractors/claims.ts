import { classifyClaim } from '../classifiers/claimType';
import { Claim } from '../core/models';
import { identifier } from '../core/hashing';

/** Conservatively splits declarative prose while retaining offsets into the original input. */
export function extractClaims(input: string): Claim[] {
  const candidates = input.matchAll(/[^.!?\n]+[.!?]?/g);
  const claims: Claim[] = [];
  for (const match of candidates) {
    const raw = match[0]; const text = raw.trim(); const offset = (match.index ?? 0) + raw.indexOf(text);
    if (text.length < 8 || /^#{1,6}\s/.test(text) || /\?$/.test(text) || /^(please|let us|consider)\b/i.test(text)) continue;
    const normalized = text.replace(/[.!?]+$/, '').trim();
    if (!/[a-z]/i.test(normalized)) continue;
    claims.push({ claim_id: identifier('c'), text: normalized, source_span: { start: offset, end: offset + text.length }, context: input, claim_type: classifyClaim(normalized), dependencies: [], metadata: {} });
  }
  return claims;
}
