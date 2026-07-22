import type { VerificationBoundary } from './receipt';
import type { Verdict } from './verdicts';
import { is_evidence_backed, type EvidenceSourceKind } from './possibilitySpace';

export type DeliberationPhase = 'claim_analysis' | 'evidence_review' | 'provider_comparison' | 'critique' | 'revision' | 'verdict_review';
export interface DeliberationStep { id?: string; phase: DeliberationPhase; summary: string; assumptions: string[]; uncertainties: string[]; alternatives_considered: string[]; claim_ids: string[]; evidence_ids: string[]; provider_ids: string[]; model_stated_confidence?: number; created_at: string; }
export type DeliberationCritiqueCategory = 'unsupported' | 'contradicted' | 'ambiguous' | 'overgeneralized' | 'underqualified' | 'missing_context' | 'provider_disagreement' | 'policy_conflict' | 'circular_reasoning' | 'other';
export interface DeliberationCritique { category: DeliberationCritiqueCategory; severity: 'info' | 'warning' | 'error'; target_step_id?: string; target_claim_id?: string; evidence_ids: string[]; resolved: boolean; resolution_summary?: string; }
export interface CandidateJudgment { id?: string; verdict: Verdict; reasoning_summary: string; assumptions: string[]; uncertainties: string[]; evidence_ids: string[]; provider_ids: string[]; model_stated_confidence?: number; parse_status: 'parsed' | 'partial' | 'failed'; }
export interface MetacognitiveAssessment { strategy: 'direct' | 'structured_reasoning' | 'self_consistency' | 'self_refine' | 'multi_model_debate'; steps: DeliberationStep[]; critiques: DeliberationCritique[]; candidates: CandidateJudgment[]; selected_candidate_id?: string; consensus_confidence?: number; unresolved_uncertainties: string[]; limitations: string[]; }
export interface CommunicabilityAssessment { reviewable: boolean; claim_summary_present: boolean; evidence_references_present: boolean; limitations_present: boolean; provider_disagreement_disclosed: boolean; missing_elements: string[]; support_summary: string; }

const confidenceValid = (value: number | undefined) => value === undefined || (Number.isFinite(value) && value >= 0 && value <= 1);
export function validateMetacognitiveAssessment(value: MetacognitiveAssessment): string[] {
  const errors: string[] = [];
  if (!confidenceValid(value.consensus_confidence)) errors.push('consensus_confidence must be within [0,1]');
  value.steps.forEach((step, index) => { if (!confidenceValid(step.model_stated_confidence)) errors.push(`steps[${index}].model_stated_confidence must be within [0,1]`); });
  value.candidates.forEach((candidate, index) => { if (!confidenceValid(candidate.model_stated_confidence)) errors.push(`candidates[${index}].model_stated_confidence must be within [0,1]`); });
  return errors;
}

export function communicabilityAssessment(input: { claim_summary?: string; assessment?: MetacognitiveAssessment; provider_disagreement?: boolean }): CommunicabilityAssessment {
  const assessment = input.assessment;
  const evidence = assessment?.steps.some(step => step.evidence_ids.length > 0) || assessment?.candidates.some(candidate => candidate.evidence_ids.length > 0) || false;
  const limitations = Boolean(assessment?.limitations.length || assessment?.unresolved_uncertainties.length);
  const disagreement = !input.provider_disagreement || Boolean(assessment?.critiques.some(critique => critique.category === 'provider_disagreement'));
  const missing_elements = [!input.claim_summary?.trim() && 'claim summary', !evidence && 'evidence references', !limitations && 'limitations', !disagreement && 'provider disagreement disclosure'].filter(Boolean) as string[];
  return { reviewable: missing_elements.length === 0, claim_summary_present: Boolean(input.claim_summary?.trim()), evidence_references_present: evidence, limitations_present: limitations, provider_disagreement_disclosed: disagreement, missing_elements, support_summary: missing_elements.length ? `Missing ${missing_elements.join(', ')}.` : 'Assessment includes claim, evidence references, limitations, and required disagreement disclosure.' };
}

export function groundingBoundaries(claims: Array<{ id: string; evidence_ids: string[] }>, sources: Record<string, EvidenceSourceKind>): VerificationBoundary[] {
  return claims.filter(claim => !claim.evidence_ids.some(id => is_evidence_backed(sources[id] ?? 'unsupported_model_assertion'))).map(claim => ({ code: 'GROUNDING_EXTERNAL_SUPPORT_REQUIRED', affected_claim_ids: [claim.id], explanation: 'This factual claim lacks a reference to externally supported evidence; model inference alone is not evidence.', required_next_information: ['Provide retrieved, user-provided, policy, or external-tool evidence for this claim.'] }));
}

export function communicabilityBoundary(assessment: CommunicabilityAssessment, claimIds: string[]): VerificationBoundary[] {
  return assessment.reviewable ? [] : [{ code: 'COMMUNICABILITY_REQUIREMENTS_UNMET', affected_claim_ids: claimIds, explanation: assessment.support_summary, required_next_information: assessment.missing_elements }];
}
