import { ClaimClassification, EducationClaim, SupportLevel } from './types';
/** Configurable MVP defaults; these thresholds are not scientifically calibrated. */
export function supportLevelForScore(score: number): SupportLevel {
  if (score >= .9) return 'strongly_supported'; if (score >= .75) return 'mostly_supported';
  if (score >= .55) return 'mixed_evidence'; if (score >= .3) return 'weakly_supported'; return 'insufficient_evidence';
}
export function aggregateClaims(claims: EducationClaim[]): number {
  const weights: Record<ClaimClassification, number> = { supported: 1, partially_supported: .65, disputed: .3, unsupported: .15, uncertain: .45, not_evaluated: .5 };
  return claims.length ? claims.reduce((sum, claim) => sum + weights[claim.classification] * claim.confidence, 0) / claims.length : .5;
}
