import { Checker } from './base';
import { Claim, ClaimType, Finding, VerificationContext } from '../core/models';
import { finding } from './helpers';
const TYPES = new Set<ClaimType>(['empirical', 'historical', 'bibliographic']);
export class UnsupportedClaimChecker implements Checker {
  readonly name = 'unsupported_claim'; readonly version = '0.1.0'; readonly supportedClaimTypes = TYPES;
  async check(claim: Claim, context: VerificationContext): Promise<Finding[]> {
    const sources = context.sources ?? [];
    if (sources.length > 0) return [];
    return [finding(claim, context, this, 'unsupported', 'medium', 'This externally checkable claim was supplied without evidence for this verification run.', 'human_required', { limitations: ['Absence of supplied evidence does not show that the claim is false.'], suggested_revision: 'Add a source or narrow the claim to the available evidence.' })];
  }
}
