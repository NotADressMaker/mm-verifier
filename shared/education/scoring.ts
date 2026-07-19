import { ClaimClassification, EducationClaim } from './types';
import { Verdict, VerdictInputs, verdictFromEvidence } from '../verdicts';

/** Applies the repository-wide evidence verdict policy; see docs/VERDICTS.md. */
export function supportLevelForEvidence(input: VerdictInputs): Verdict {
  return verdictFromEvidence(input);
}

export function aggregateClaims(claims: EducationClaim[]): number {
  const weights: Record<ClaimClassification, number> = { supported: 1, partially_supported: .65, disputed: .3, unsupported: .15, uncertain: .45, not_evaluated: .5 };
  return claims.length ? claims.reduce((sum, claim) => sum + weights[claim.classification] * claim.confidence, 0) / claims.length : .5;
}
