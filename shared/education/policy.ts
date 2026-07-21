import { AtomicClaim, ClaimAssessmentStatus, ClaimEvidenceRelation, EducationalAssessmentMetrics, EducationVerdictPolicy } from './types';
/** Versioned policy: changing thresholds changes only the assessment label, never the evidence record. */
export const defaultEducationVerdictPolicy: EducationVerdictPolicy = {
  id: 'education-evidence-conditioned', version: '1.0.0',
  evaluate(metrics: EducationalAssessmentMetrics, claim: AtomicClaim, evidence: ClaimEvidenceRelation[]): ClaimAssessmentStatus {
    if (claim.verifiability === 'not_empirically_verifiable') return 'unable_to_verify';
    if (claim.verifiability === 'interpretation_dependent') return 'interpretation_dependent';
    if (!evidence.length || metrics.evidenceCoverage === 0) return 'insufficient_evidence';
    if (metrics.contradictionRatio >= .5) return 'contradicted';
    if (metrics.contradictionRatio > 0 && metrics.supportRatio > 0) return 'mixed_evidence';
    if (metrics.sourceIndependence < .5) return 'unable_to_verify';
    if (metrics.supportRatio >= .8 && metrics.evidenceCoverage >= .5) return 'supported';
    if (metrics.supportRatio >= .5) return 'mostly_supported';
    return 'unresolved';
  },
};
