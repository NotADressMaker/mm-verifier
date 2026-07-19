import { checkReferenceConsistency, type ReferenceConsistencyCheck } from '../../../shared/pragmatics';
import type { VerificationBoundary } from '../../../shared/receipt';

export { checkReferenceConsistency };
export type { ReferenceConsistencyCheck };
export function referenceConsistencyBoundaries(checks: ReferenceConsistencyCheck[]): VerificationBoundary[] {
  return checks.filter(check => check.status === 'ambiguous' || check.status === 'conflicting').map(check => ({
    code: check.status === 'conflicting' ? 'REFERENCE_CONFLICTING' : 'REFERENCE_AMBIGUOUS', affected_claim_ids: check.claim_ids,
    explanation: check.explanation, required_next_information: ['Provide a date, affiliation, location, or another distinguishing detail for this reference.'],
  }));
}

/** Indexical evidence cannot be treated as direct support until its time/place/speaker is resolved. */
export function indexicalBoundary(claimId: string, resolution?: string, confidence = 0): VerificationBoundary[] {
  return confidence >= .8 && resolution ? [] : [{ code: 'INDEXICAL_UNRESOLVED', affected_claim_ids: [claimId], explanation: 'The evidence depends on a time, place, or speaker reference that was not resolved confidently.', required_next_information: ['Confirm the applicable time, place, or speaker.'] }];
}
