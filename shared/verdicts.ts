/**
 * Public verdicts describe the evidence reviewed for an output; they do not state
 * that an output is true, safe, or suitable for a particular use.
 */
export const VERDICTS = [
  'Supported',
  'Mostly supported',
  'Mixed evidence',
  'Unsupported',
  'Contradicted',
  'Unable to verify',
] as const;

export type Verdict = typeof VERDICTS[number];

export interface VerdictInputs {
  /** Weighted share (0..1) of assessable claims supported by reviewed evidence. */
  supportedClaimRatio: number;
  /** Weighted share (0..1) of assessable claims contradicted by reviewed evidence. */
  contradictedClaimRatio: number;
  /** Share (0..1) of all material claims with reviewed evidence. */
  evidenceCoverage: number;
  /** Number of independent sources or methods supporting the result. */
  independentSupportCount: number;
  /** Whether a material contradiction remains unresolved. */
  hasMaterialContradiction: boolean;
}

/**
 * Applies the public verdict policy. Inputs must come from the evidence bundle,
 * not from model agreement alone. Precedence prevents a high aggregate score
 * from hiding absent evidence or a material contradiction.
 */
export function verdictFromEvidence(input: VerdictInputs): Verdict {
  const coverage = bounded(input.evidenceCoverage);
  const supported = bounded(input.supportedClaimRatio);
  const contradicted = bounded(input.contradictedClaimRatio);

  if (coverage < 0.5) return 'Unable to verify';
  if (input.hasMaterialContradiction && contradicted > supported) return 'Contradicted';
  if (input.hasMaterialContradiction || (supported >= 0.25 && contradicted >= 0.25)) return 'Mixed evidence';
  if (supported >= 0.9 && input.independentSupportCount >= 2) return 'Supported';
  if (supported >= 0.75 && input.independentSupportCount >= 1) return 'Mostly supported';
  return 'Unsupported';
}

function bounded(value: number): number {
  return Math.max(0, Math.min(1, value));
}
