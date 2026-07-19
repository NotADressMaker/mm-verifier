/** The declared alternatives and constraints used by a verification program. */
import type { EvidenceRelationType, VerificationBoundaryCode } from './receipt';

export const DEFAULT_EVIDENCE_RELATION_TYPES = ['supports', 'contradicts', 'qualifies', 'contextualizes', 'duplicates', 'derives_from', 'inconclusive'] as const;
export const DEFAULT_ASSESSMENT_OUTCOMES = ['Supported', 'Contradicted', 'Mixed evidence', 'Unable to verify'] as const;

export interface VerificationAlternative { id: string; label: string; description?: string; }
export type PossibleWorldType = 'interpretive' | 'causal' | 'temporal' | 'scope' | 'entity_identity' | 'source_reliability' | 'measurement_definition' | 'jurisdiction' | 'factual_outcome';
export type PossibleWorldStatus = 'candidate' | 'selected' | 'supported' | 'weakened' | 'rejected' | 'unresolved' | 'requires_clarification';
export interface PossibleWorld {
  id: string; interpretation: string; world_type: PossibleWorldType; assumptions: string[];
  material_difference: string; distinguishing_conditions: string[]; predicted_observations: string[];
  status: PossibleWorldStatus; selection_rationale?: string; rejection_reason?: string; plausibility?: number;
}
export interface GenerationPolicy { max_worlds: number; max_rounds: number; minimum_material_difference: number; merge_equivalent_worlds: boolean; require_distinguishing_condition: boolean; }

/**
 * This keeps the original program-declaration fields for legacy programs while
 * adding the frozen, run-specific fields used by context-v2 receipts.
 */
export interface VerificationPossibilitySpace {
  id: string; version: string; interpretation_alternatives: VerificationAlternative[]; claim_types: string[];
  evidence_relation_types: string[]; assessment_outcomes: string[]; boundary_outcomes: string[];
  schema_version?: '1'; input_summary?: string; worlds?: PossibleWorld[];
  allowed_claim_types?: string[]; allowed_evidence_relation_types?: EvidenceRelationType[]; allowed_verdicts?: string[];
  boundary_conditions?: VerificationBoundaryCode[];
  evidence_requirements?: { minimum_coverage?: number; minimum_independent_sources?: number; required_source_types?: string[]; prohibited_source_types?: string[]; };
  generation_policy?: GenerationPolicy; program_id?: string; program_version?: string; program_fingerprint?: string; created_at?: string;
}

export const DEFAULT_GENERATION_POLICY: GenerationPolicy = { max_worlds: 4, max_rounds: 2, minimum_material_difference: 0.2, merge_equivalent_worlds: true, require_distinguishing_condition: true };
export const DEFAULT_VERIFICATION_POSSIBILITY_SPACE: VerificationPossibilitySpace = {
  id: 'builtin-evidential-assessment', version: '1', interpretation_alternatives: [{ id: 'ordinary-reading', label: 'Ordinary reading' }],
  claim_types: ['factual', 'procedural', 'policy', 'citation'], evidence_relation_types: [...DEFAULT_EVIDENCE_RELATION_TYPES], assessment_outcomes: [...DEFAULT_ASSESSMENT_OUTCOMES],
  boundary_outcomes: ['INSUFFICIENT_EVIDENCE_COVERAGE', 'UNSUPPORTED_CLAIM_TYPE', 'SOURCE_INDEPENDENCE_UNAVAILABLE', 'REQUIRED_SOURCE_INACCESSIBLE', 'AMBIGUOUS_INTERPRETATION', 'MALFORMED_EVIDENCE', 'PROGRAM_RULE_MISSING', 'MATERIAL_CLAIM_UNASSESSABLE'],
};

function strings(value: unknown, field: string, errors: string[]): void { if (!Array.isArray(value) || value.length === 0 || value.some(v => typeof v !== 'string' || !v.trim())) errors.push(`${field} must be a non-empty array of strings`); }
export function validateVerificationPossibilitySpace(value: unknown): string[] {
  const errors: string[] = []; if (!value || typeof value !== 'object' || Array.isArray(value)) return ['possibility_space is required']; const s = value as Record<string, unknown>;
  for (const field of ['id', 'version']) if (typeof s[field] !== 'string' || !(s[field] as string).trim()) errors.push(`possibility_space.${field} is required`);
  if (!Array.isArray(s.interpretation_alternatives) || !s.interpretation_alternatives.length) errors.push('possibility_space.interpretation_alternatives must be non-empty');
  else { const ids = new Set<string>(); for (const a of s.interpretation_alternatives as unknown[]) { const x = a as VerificationAlternative; if (!x || typeof x.id !== 'string' || typeof x.label !== 'string') errors.push('each interpretation alternative requires id and label'); else if (ids.has(x.id)) errors.push('interpretation alternative ids must be unique'); else ids.add(x.id); } }
  for (const f of ['claim_types', 'evidence_relation_types', 'assessment_outcomes', 'boundary_outcomes']) strings(s[f], `possibility_space.${f}`, errors);
  if (s.generation_policy) { const p = s.generation_policy as Partial<GenerationPolicy>; if (!Number.isInteger(p.max_worlds) || p.max_worlds! < 1) errors.push('generation_policy.max_worlds must be a positive integer'); if (!Number.isInteger(p.max_rounds) || p.max_rounds! < 1) errors.push('generation_policy.max_rounds must be a positive integer'); if (typeof p.minimum_material_difference !== 'number' || p.minimum_material_difference < 0 || p.minimum_material_difference > 1) errors.push('generation_policy.minimum_material_difference must be between 0 and 1'); }
  return errors;
}
export function interpretationIsDeclared(space: VerificationPossibilitySpace, id: string): boolean { return space.interpretation_alternatives.some(a => a.id === id); }
