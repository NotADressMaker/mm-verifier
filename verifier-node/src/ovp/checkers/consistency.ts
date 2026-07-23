import { Checker } from './base';
import { Claim, ClaimType, Finding, VerificationContext } from '../core/models';
import { finding } from './helpers';
const TYPES = new Set<ClaimType>(['mathematical', 'logical', 'empirical', 'historical', 'unknown']);
export class ConsistencyChecker implements Checker {
  readonly name = 'consistency'; readonly version = '0.1.0'; readonly supportedClaimTypes = TYPES;
  async check(claim: Claim, context: VerificationContext): Promise<Finding[]> {
    const subject = claim.text.replace(/\b(is|are|was|were)\b.*$/i, '').trim().toLowerCase();
    const polarity = /\b(not|never|no|cannot|isn't|aren't)\b/i.test(claim.text);
    const conflict = context.claims.find((other) => other.claim_id !== claim.claim_id && other.text.replace(/\b(is|are|was|were)\b.*$/i, '').trim().toLowerCase() === subject && /\b(not|never|no|cannot|isn't|aren't)\b/i.test(other.text) !== polarity);
    if (conflict) return [finding(claim, context, this, 'contradicted', 'high', `This input also contains an incompatible claim: “${conflict.text}”.`, 'deterministic_check', { limitations: ['This lexical check cannot decide which claim is correct.'] })];
    if (/\b(this|that|it|they)\b/i.test(claim.text) && !claim.context.slice(0, claim.source_span.start).trim()) return [finding(claim, context, this, 'needs_qualification', 'low', 'The claim begins with an unresolved referent.', 'deterministic_check', { suggested_revision: 'Name the referred object explicitly.' })];
    return [];
  }
}
