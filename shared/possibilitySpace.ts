/**
 * The declared set of distinctions a verification program may make.
 *
 * This is deliberately data, rather than a collection of prompt conventions:
 * a completed receipt can say which alternatives were available when a
 * selection or assessment was made.
 */
export const DEFAULT_EVIDENCE_RELATION_TYPES = [
  'supports', 'contradicts', 'qualifies', 'contextualizes',
  'duplicates', 'derives_from', 'inconclusive',
] as const;

export const DEFAULT_ASSESSMENT_OUTCOMES = [
  'Supported', 'Contradicted', 'Mixed', 'Unable to verify',
] as const;

export interface VerificationAlternative {
  /** Stable identifier used in selections and receipt references. */
  id: string;
  /** Customer-facing label for the alternative. */
  label: string;
  description?: string;
}

export interface VerificationPossibilitySpace {
  /** Stable, program-scoped ID; changing contents requires a new version. */
  id: string;
  version: string;
  /** Readings that may be selected before claim extraction. */
  interpretation_alternatives: VerificationAlternative[];
  /** Claim categories the program is able to assess. */
  claim_types: string[];
  /** Evidential links the program is able to represent. */
  evidence_relation_types: string[];
  /** Evidential assessment outcomes, never intrinsic answer properties. */
  assessment_outcomes: string[];
  /** Named limits at which the program must abstain. */
  boundary_outcomes: string[];
}

/** A usable default for integrations that have not yet supplied a custom program. */
export const DEFAULT_VERIFICATION_POSSIBILITY_SPACE: VerificationPossibilitySpace = {
  id: 'builtin-evidential-assessment',
  version: '1',
  interpretation_alternatives: [{ id: 'ordinary-reading', label: 'Ordinary reading' }],
  claim_types: ['factual', 'procedural', 'policy', 'citation'],
  evidence_relation_types: [...DEFAULT_EVIDENCE_RELATION_TYPES],
  assessment_outcomes: [...DEFAULT_ASSESSMENT_OUTCOMES],
  boundary_outcomes: [
    'INSUFFICIENT_EVIDENCE_COVERAGE', 'UNSUPPORTED_CLAIM_TYPE',
    'SOURCE_INDEPENDENCE_UNAVAILABLE', 'REQUIRED_SOURCE_INACCESSIBLE',
    'AMBIGUOUS_INTERPRETATION', 'MALFORMED_EVIDENCE', 'PROGRAM_RULE_MISSING',
    'MATERIAL_CLAIM_UNASSESSABLE',
  ],
};

function nonEmptyStrings(value: unknown, field: string, errors: string[]): void {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string' || !item.trim())) {
    errors.push(`${field} must be a non-empty array of strings`);
  }
}

export function validateVerificationPossibilitySpace(value: unknown): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['possibility_space is required'];
  const space = value as Record<string, unknown>;
  for (const field of ['id', 'version']) if (typeof space[field] !== 'string' || !space[field]?.trim()) errors.push(`possibility_space.${field} is required`);
  if (!Array.isArray(space.interpretation_alternatives) || space.interpretation_alternatives.length === 0) {
    errors.push('possibility_space.interpretation_alternatives must be non-empty');
  } else {
    const ids = new Set<string>();
    for (const alternative of space.interpretation_alternatives) {
      if (!alternative || typeof alternative !== 'object' || typeof (alternative as Record<string, unknown>).id !== 'string' || typeof (alternative as Record<string, unknown>).label !== 'string') errors.push('each interpretation alternative requires id and label');
      else if (ids.has((alternative as VerificationAlternative).id)) errors.push('interpretation alternative ids must be unique');
      else ids.add((alternative as VerificationAlternative).id);
    }
  }
  nonEmptyStrings(space.claim_types, 'possibility_space.claim_types', errors);
  nonEmptyStrings(space.evidence_relation_types, 'possibility_space.evidence_relation_types', errors);
  nonEmptyStrings(space.assessment_outcomes, 'possibility_space.assessment_outcomes', errors);
  nonEmptyStrings(space.boundary_outcomes, 'possibility_space.boundary_outcomes', errors);
  return errors;
}

export function interpretationIsDeclared(space: VerificationPossibilitySpace, interpretationId: string): boolean {
  return space.interpretation_alternatives.some((alternative) => alternative.id === interpretationId);
}
