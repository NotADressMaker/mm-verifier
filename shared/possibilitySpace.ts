/** Canonical and backwards-compatible declaration of a verification possibility space. */
import type { EvidenceRelationType, VerificationBoundaryCode } from './receipt';
import { VERIFICATION_CLAIM_TYPES } from './types';

/** Provenance authority for content used while assessing possible worlds. */
export type EvidenceSourceKind = 'model_inference' | 'retrieved_evidence' | 'user_provided_evidence' | 'rule_or_policy' | 'external_tool_observation' | 'unsupported_model_assertion';
export function is_evidence_backed(kind: EvidenceSourceKind): boolean { return kind === 'retrieved_evidence' || kind === 'user_provided_evidence' || kind === 'rule_or_policy' || kind === 'external_tool_observation'; }
export function is_model_inference(kind: EvidenceSourceKind): boolean { return kind === 'model_inference' || kind === 'unsupported_model_assertion'; }
export function requires_external_support(kind: EvidenceSourceKind): boolean { return is_model_inference(kind); }
export function is_policy_authorized(kind: EvidenceSourceKind): boolean { return kind === 'rule_or_policy'; }

export const DEFAULT_EVIDENCE_RELATION_TYPES = ['supports', 'contradicts', 'qualifies', 'contextualizes', 'duplicates', 'derives_from', 'inconclusive'] as const;
export const DEFAULT_ASSESSMENT_OUTCOMES = ['Supported', 'Contradicted', 'Mixed evidence', 'Unable to verify'] as const;
const VALID_RELATIONS = new Set<string>(DEFAULT_EVIDENCE_RELATION_TYPES);
const VALID_BOUNDARIES = new Set<string>(['INSUFFICIENT_EVIDENCE_COVERAGE', 'UNSUPPORTED_CLAIM_TYPE', 'SOURCE_INDEPENDENCE_UNAVAILABLE', 'REQUIRED_SOURCE_INACCESSIBLE', 'AMBIGUOUS_INTERPRETATION', 'MALFORMED_EVIDENCE', 'PROGRAM_RULE_MISSING', 'MATERIAL_CLAIM_UNASSESSABLE', 'RIVAL_WORLDS_INDISTINGUISHABLE', 'POSSIBILITY_SPACE_INCOMPLETE', 'WORLD_LIMIT_REACHED', 'DISTINGUISHING_EVIDENCE_UNAVAILABLE', 'EQUIVALENT_WORLDS_UNMERGED', 'STATEMENT_TYPE_UNCERTAIN', 'IMPLIED_CONTENT_AMBIGUOUS', 'QUOTATION_SOURCE_UNAVAILABLE', 'REFERENCE_AMBIGUOUS', 'REFERENCE_CONFLICTING', 'INDEXICAL_UNRESOLVED', 'STRUCTURED_REASONING_PARSE_FAILED', 'GROUNDING_EXTERNAL_SUPPORT_REQUIRED', 'COMMUNICABILITY_REQUIREMENTS_UNMET']);

export interface VerificationAlternative { id: string; label: string; description?: string; }
export type PossibleWorldType = 'interpretive' | 'causal' | 'temporal' | 'scope' | 'entity_identity' | 'source_reliability' | 'measurement_definition' | 'jurisdiction' | 'factual_outcome';
export type PossibleWorldStatus = 'candidate' | 'selected' | 'supported' | 'weakened' | 'rejected' | 'unresolved' | 'requires_clarification';
export interface PossibleWorld { id: string; interpretation: string; world_type: PossibleWorldType; assumptions: string[]; material_difference: string; distinguishing_conditions: string[]; predicted_observations: string[]; status: PossibleWorldStatus; selection_rationale?: string; rejection_reason?: string; plausibility?: number; }
export interface GenerationPolicy { max_worlds: number; max_rounds: number; minimum_material_difference: number; merge_equivalent_worlds: boolean; require_distinguishing_condition: boolean; }

/** Validation failures are stable machine-readable errors for routes and receipt builders. */
export interface PossibilitySpaceValidationError { code: string; path: string; message: string; }
export class PossibilitySpaceValidationException extends Error { constructor(public readonly errors: PossibilitySpaceValidationError[]) { super(errors.map(error => error.message).join('; ')); } }

export interface VerificationPossibilitySpace {
  id: string; version: string;
  /** Canonical fields. New programs and all context-v2 snapshots must use these. */
  worlds?: PossibleWorld[]; allowed_claim_types?: string[]; allowed_evidence_relation_types?: EvidenceRelationType[]; allowed_verdicts?: string[]; boundary_conditions?: VerificationBoundaryCode[];
  /** Legacy aliases are read-only compatibility projections. They may be supplied only when equal to the canonical field. */
  interpretation_alternatives?: VerificationAlternative[]; claim_types?: string[]; evidence_relation_types?: string[]; assessment_outcomes?: string[]; boundary_outcomes?: string[];
  schema_version?: '1'; input_summary?: string; evidence_requirements?: { minimum_coverage?: number; minimum_independent_sources?: number; required_source_types?: string[]; prohibited_source_types?: string[]; };
  generation_policy?: GenerationPolicy; program_id?: string; program_version?: string; program_fingerprint?: string; created_at?: string;
}

export const DEFAULT_GENERATION_POLICY: GenerationPolicy = { max_worlds: 4, max_rounds: 2, minimum_material_difference: 0.2, merge_equivalent_worlds: true, require_distinguishing_condition: true };
const defaults = { worlds: [{ id: 'ordinary-reading', interpretation: 'Ordinary reading', world_type: 'interpretive' as const, assumptions: ['Terms have their ordinary meaning.'], material_difference: 'The ordinary reading is used.', distinguishing_conditions: ['The submitted text supplies no material ambiguity.'], predicted_observations: [], status: 'candidate' as const }], allowed_claim_types: [...VERIFICATION_CLAIM_TYPES], allowed_evidence_relation_types: [...DEFAULT_EVIDENCE_RELATION_TYPES] as EvidenceRelationType[], allowed_verdicts: [...DEFAULT_ASSESSMENT_OUTCOMES], boundary_conditions: ['INSUFFICIENT_EVIDENCE_COVERAGE', 'UNSUPPORTED_CLAIM_TYPE', 'SOURCE_INDEPENDENCE_UNAVAILABLE', 'REQUIRED_SOURCE_INACCESSIBLE', 'AMBIGUOUS_INTERPRETATION', 'MALFORMED_EVIDENCE', 'PROGRAM_RULE_MISSING', 'MATERIAL_CLAIM_UNASSESSABLE'] as VerificationBoundaryCode[] };

export function deriveLegacyPossibilitySpaceFields(space: VerificationPossibilitySpace): VerificationPossibilitySpace {
  const worlds = space.worlds ?? defaults.worlds;
  const allowed_claim_types = space.allowed_claim_types ?? space.claim_types ?? defaults.allowed_claim_types;
  const allowed_evidence_relation_types = space.allowed_evidence_relation_types ?? space.evidence_relation_types as EvidenceRelationType[] ?? defaults.allowed_evidence_relation_types;
  const allowed_verdicts = space.allowed_verdicts ?? space.assessment_outcomes ?? defaults.allowed_verdicts;
  const boundary_conditions = space.boundary_conditions ?? space.boundary_outcomes as VerificationBoundaryCode[] ?? defaults.boundary_conditions;
  return { ...space, worlds, allowed_claim_types, allowed_evidence_relation_types, allowed_verdicts, boundary_conditions,
    interpretation_alternatives: worlds.map(world => ({ id: world.id, label: world.interpretation })), claim_types: [...allowed_claim_types], evidence_relation_types: [...allowed_evidence_relation_types], assessment_outcomes: [...allowed_verdicts], boundary_outcomes: [...boundary_conditions] };
}
export const DEFAULT_VERIFICATION_POSSIBILITY_SPACE: VerificationPossibilitySpace = deriveLegacyPossibilitySpaceFields({ id: 'builtin-evidential-assessment', version: '1' });

const sameStrings = (a: unknown, b: unknown) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && [...a].map(String).sort().every((v, i) => v === [...b].map(String).sort()[i]);
export function validatePossibilitySpaceConsistency(value: VerificationPossibilitySpace): PossibilitySpaceValidationError[] {
  const errors: PossibilitySpaceValidationError[] = []; const add = (code: string, path: string, message: string) => errors.push({ code, path, message });
  if (value.worlds && value.interpretation_alternatives && (!sameStrings(value.worlds.map(w => w.id), value.interpretation_alternatives.map(a => a.id)) || value.worlds.some(w => value.interpretation_alternatives!.find(a => a.id === w.id)?.label !== w.interpretation))) add('INCONSISTENT_DUAL_REPRESENTATION', 'interpretation_alternatives', 'interpretation_alternatives must be derived from worlds');
  for (const [legacy, canonical] of [['claim_types', 'allowed_claim_types'], ['evidence_relation_types', 'allowed_evidence_relation_types'], ['assessment_outcomes', 'allowed_verdicts'], ['boundary_outcomes', 'boundary_conditions']] as const) if (value[legacy] && value[canonical] && !sameStrings(value[legacy], value[canonical])) add('INCONSISTENT_DUAL_REPRESENTATION', legacy, `${legacy} must equal ${canonical}`);
  return errors;
}
export function normalizeVerificationPossibilitySpace(value: VerificationPossibilitySpace): VerificationPossibilitySpace {
  const errors = validatePossibilitySpaceConsistency(value); if (errors.length) throw new PossibilitySpaceValidationException(errors);
  return deriveLegacyPossibilitySpaceFields(value);
}
export function validateVerificationPossibilitySpaceDetailed(value: unknown): PossibilitySpaceValidationError[] {
  const errors: PossibilitySpaceValidationError[] = []; const add = (code: string, path: string, message: string) => errors.push({ code, path, message });
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [{ code: 'REQUIRED', path: 'possibility_space', message: 'possibility_space is required' }];
  const raw = value as VerificationPossibilitySpace; if (!raw.id?.trim()) add('REQUIRED', 'id', 'possibility_space.id is required'); if (!raw.version?.trim()) add('REQUIRED', 'version', 'possibility_space.version is required'); errors.push(...validatePossibilitySpaceConsistency(raw));
  let space: VerificationPossibilitySpace; try { space = normalizeVerificationPossibilitySpace(raw); } catch { return errors; }
  const worlds = space.worlds!; const ids = new Set<string>(); if (!worlds.length) add('REQUIRED', 'worlds', 'possibility_space.worlds must be non-empty');
  for (const world of worlds) { if (!world.id || ids.has(world.id)) add('DUPLICATE_WORLD_ID', 'worlds', 'world ids must be unique'); ids.add(world.id); if (!world.assumptions?.length) add('MISSING_ASSUMPTIONS', `worlds.${world.id}`, `world ${world.id} requires an assumption`); if (worlds.length > 1 && !world.material_difference?.trim()) add('MISSING_MATERIAL_DIFFERENCE', `worlds.${world.id}`, `world ${world.id} requires a material difference`); if ((space.generation_policy ?? DEFAULT_GENERATION_POLICY).require_distinguishing_condition && !world.distinguishing_conditions?.length) add('MISSING_DISTINGUISHER', `worlds.${world.id}`, `world ${world.id} requires a distinguishing condition`); }
  if (worlds.length > (space.generation_policy ?? DEFAULT_GENERATION_POLICY).max_worlds) add('WORLD_LIMIT', 'worlds', 'world count exceeds generation_policy.max_worlds');
  if (space.allowed_evidence_relation_types!.some(type => !VALID_RELATIONS.has(type))) add('INVALID_RELATION_TYPE', 'allowed_evidence_relation_types', 'allowed evidence relation types are invalid'); if (!space.allowed_verdicts!.length) add('REQUIRED', 'allowed_verdicts', 'allowed_verdicts must be non-empty'); if (space.boundary_conditions!.some(code => !VALID_BOUNDARIES.has(code))) add('INVALID_BOUNDARY', 'boundary_conditions', 'boundary conditions are invalid');
  const policy = space.generation_policy; if (policy && (!Number.isInteger(policy.max_worlds) || policy.max_worlds < 1 || !Number.isInteger(policy.max_rounds) || policy.max_rounds < 1 || policy.minimum_material_difference < 0 || policy.minimum_material_difference > 1)) add('INVALID_GENERATION_POLICY', 'generation_policy', 'generation policy limits are invalid');
  return errors;
}
export function validateVerificationPossibilitySpace(value: unknown): string[] { return validateVerificationPossibilitySpaceDetailed(value).map(error => error.message); }
export function validatePossibilitySpaceForRegistration(value: VerificationPossibilitySpace): string[] {
  const errors = validateVerificationPossibilitySpaceDetailed(value);
  const worlds = normalizeVerificationPossibilitySpace(value).worlds ?? [];
  if (worlds.length === 1) errors.push({ code: 'SINGLE_SCENARIO', path: 'worlds', message: 'program possibility spaces require at least two scenarios; use an explicit lightweight compatibility receipt instead' });
  if (worlds.length > 1) {
    const signatures = worlds.map(world => JSON.stringify({ conditions: [...world.distinguishing_conditions].sort(), observations: [...world.predicted_observations].sort() }));
    if (new Set(signatures).size === 1) errors.push({ code: 'NON_DISTINGUISHING_SCENARIOS', path: 'worlds', message: 'program scenarios have identical distinguishing evidence relations' });
  }
  return errors.map(error => error.message);
}

export function interpretationIsDeclared(space: VerificationPossibilitySpace, id: string): boolean { return normalizeVerificationPossibilitySpace(space).worlds!.some(world => world.id === id); }
