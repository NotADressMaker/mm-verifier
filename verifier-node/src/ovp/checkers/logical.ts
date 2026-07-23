import { Checker } from './base';
import { Claim, ClaimType, Finding, VerificationContext } from '../core/models';
import { finding } from './helpers';
const TYPES = new Set<ClaimType>(['logical', 'mathematical']);
export class LogicalChecker implements Checker {
  readonly name = 'logical'; readonly version = '0.1.0'; readonly supportedClaimTypes = TYPES;
  async check(claim: Claim, context: VerificationContext): Promise<Finding[]> {
    if (/decidability\s+implies\s+(a\s+)?countable\s+domain/i.test(claim.text)) return [finding(claim, context, this, 'needs_qualification', 'high', 'Decidability is defined relative to an encoding or representation; it does not by itself establish that an arbitrary domain is countable.', 'deterministic_check', { assumptions: ['A specified effective encoding is required.'], suggested_revision: 'State the encoding assumption and distinguish decidability from domain cardinality.' })];
    if (/\bif\b.*\bthen\b/i.test(claim.text) && !/\b(assuming|provided|where|for every|for all)\b/i.test(claim.text)) return [finding(claim, context, this, 'needs_qualification', 'medium', 'The conditional has no stated domain or assumptions.', 'deterministic_check', { suggested_revision: 'State the domain and assumptions under which the implication holds.' })];
    return [];
  }
}
