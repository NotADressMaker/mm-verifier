/**
 * Produces audit-safe interpretation candidates before claim extraction.  It
 * intentionally does not score truth: confidence only ranks reading quality.
 */
import { extractStatements } from '../../../shared/pragmatics';
export type AmbiguityStatus = 'unambiguous' | 'assumption_recorded' | 'user_clarification_required' | 'multiple_interpretations_verified';

export interface InterpretationCandidate {
  id: string;
  summary: string;
  domain?: string;
  assumptions: string[];
  candidate_claims: Array<{ text: string; claim_type: string; statement_type?: import('../../../shared/pragmatics').StatementTypeClassification; content?: import('../../../shared/pragmatics').ClaimContent; content_role?: 'literal'|'implied'|'hedge_disclosure'|'hedged_content'; parent_claim_id?: string }>;
  confidence?: number;
}

export interface InterpretationResult {
  candidates: InterpretationCandidate[];
  selected_interpretation_id?: string;
  ambiguity_status: AmbiguityStatus;
  selection_reason?: string;
}

const MATERIAL_AMBIGUITY = /\b(it|they|this|that|current|latest|best|safe|near|soon|may|might)\b/i;

function claimsFor(text: string): InterpretationCandidate['candidate_claims'] {
  // Classification deliberately occurs before world/claim generation so worlds inherit
  // separate literal, implied, and hedge records rather than attempting to split a verdict later.
  return extractStatements(text).map((claim) => ({ text: claim.content.literal_content, claim_type: /\b(should|must|safe|legal|allowed)\b/i.test(claim.original_text) ? 'policy' : 'factual', statement_type: claim.statement_type, content: claim.content, content_role: claim.role, parent_claim_id: claim.parent_claim_id }));
}

/** Deterministic baseline used when a model-backed interpreter is unavailable. */
export function interpretVerificationInput(input: string, options: { domain?: string; clarificationRequired?: boolean } = {}): InterpretationResult {
  const text = input.trim();
  const candidate: InterpretationCandidate = {
    id: 'interpretation-1', summary: text, domain: options.domain, assumptions: [], candidate_claims: claimsFor(text), confidence: 1,
  };
  if (options.clarificationRequired || (!text && true)) {
    return { candidates: [candidate], ambiguity_status: 'user_clarification_required', selection_reason: 'The input does not contain enough information to extract material claims safely.' };
  }
  if (!MATERIAL_AMBIGUITY.test(text)) {
    return { candidates: [candidate], selected_interpretation_id: candidate.id, ambiguity_status: 'unambiguous', selection_reason: 'The input identifies a single material reading.' };
  }
  candidate.assumptions = ['Terms without a named reference are interpreted using the supplied verification scope.'];
  return { candidates: [candidate], selected_interpretation_id: candidate.id, ambiguity_status: 'assumption_recorded', selection_reason: 'A material assumption was recorded before claims were extracted.' };
}
