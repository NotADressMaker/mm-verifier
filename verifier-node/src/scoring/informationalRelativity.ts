import { createHash } from "crypto";

/**
 * The declared conditions under which evidence is assessed.  A frame is not a
 * property of a claim; it is an input to every reproducible assessment.
 */
export interface VerificationFrame {
  id: string;
  program: { id: string; version: number };
  interpretation: string;
  possibility_space_hash: `0x${string}`;
  evidence_scope: Record<string, unknown>;
  policy_hash: `0x${string}`;
  jurisdiction: string;
  domain: string;
  assessment_time: string;
  method_manifest_hash: `0x${string}`;
}

type CanonicalValue = null | boolean | number | string | CanonicalValue[] | { [key: string]: CanonicalValue };

/** Serialize JSON values deterministically, including recursively sorted keys. */
export function canonicalSerialize(value: CanonicalValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalSerialize).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalSerialize(value[key])}`).join(",")}}`;
}

/** SHA-256 commitment to the complete frame, suitable for receipt integrity. */
export function hashVerificationFrame(frame: VerificationFrame): `0x${string}` {
  return `0x${createHash("sha256").update(canonicalSerialize(frame as unknown as CanonicalValue)).digest("hex")}`;
}

/** The complete, verdict-free output of evidence evaluation. */
export interface MeasurementVector {
  coverage: number;
  support_ratio: number;
  contradiction_ratio: number;
  source_quality: number;
  source_independence: number;
  unresolved_ambiguity: number;
  process_reliability: number;
}

export interface EvidenceEvaluationInput {
  covered_claims: number;
  total_claims: number;
  supporting_relations: number;
  contradicting_relations: number;
  source_quality: number;
  source_independence: number;
  unresolved_ambiguity: number;
  process_reliability: number;
}

const clampUnit = (value: number) => Math.max(0, Math.min(1, value));

/**
 * Evaluates evidence in a declared frame. This deliberately returns only
 * measurements: policy verdicts are applied separately and later.
 */
export function evaluateEvidence(_frame: VerificationFrame, input: EvidenceEvaluationInput): MeasurementVector {
  const relations = input.supporting_relations + input.contradicting_relations;
  return {
    coverage: input.total_claims === 0 ? 0 : clampUnit(input.covered_claims / input.total_claims),
    support_ratio: relations === 0 ? 0 : clampUnit(input.supporting_relations / relations),
    contradiction_ratio: relations === 0 ? 0 : clampUnit(input.contradicting_relations / relations),
    source_quality: clampUnit(input.source_quality),
    source_independence: clampUnit(input.source_independence),
    unresolved_ambiguity: clampUnit(input.unresolved_ambiguity),
    process_reliability: clampUnit(input.process_reliability),
  };
}

export type Verdict = "mostly_supported" | "mixed_evidence" | "contradicted" | "unable_to_verify";

export interface VerdictPolicyThresholds {
  minimum_coverage: number;
  minimum_source_independence: number;
  maximum_unresolved_ambiguity: number;
  mostly_supported_minimum_support: number;
  mostly_supported_maximum_contradiction: number;
}

export interface VersionedVerdictPolicy {
  id: string;
  version: number;
  thresholds: VerdictPolicyThresholds;
}

export interface Abstention {
  reason: "insufficient_coverage" | "insufficient_source_independence" | "unresolved_ambiguity";
  explanation: string;
}

export interface PolicyAssessment {
  verdict: Exclude<Verdict, "unable_to_verify">;
  policy_rule: string;
}

export interface UnableToVerifyAssessment {
  verdict: "unable_to_verify";
  policy_rule: string;
  abstention: Abstention;
}

/** The only function permitted to map measurements to a human-facing verdict. */
export function applyVerdictPolicy(
  measurements: MeasurementVector,
  policy: VersionedVerdictPolicy,
): PolicyAssessment | UnableToVerifyAssessment {
  const { thresholds } = policy;
  if (measurements.coverage < thresholds.minimum_coverage) {
    return { verdict: "unable_to_verify", policy_rule: "abstain_coverage", abstention: { reason: "insufficient_coverage", explanation: "Evidence coverage is below this policy version's minimum." } };
  }
  if (measurements.source_independence < thresholds.minimum_source_independence) {
    return { verdict: "unable_to_verify", policy_rule: "abstain_independence", abstention: { reason: "insufficient_source_independence", explanation: "Independent-source evidence is below this policy version's minimum." } };
  }
  if (measurements.unresolved_ambiguity > thresholds.maximum_unresolved_ambiguity) {
    return { verdict: "unable_to_verify", policy_rule: "abstain_ambiguity", abstention: { reason: "unresolved_ambiguity", explanation: "Material interpretation ambiguity remains unresolved." } };
  }
  if (measurements.support_ratio >= thresholds.mostly_supported_minimum_support && measurements.contradiction_ratio <= thresholds.mostly_supported_maximum_contradiction) {
    return { verdict: "mostly_supported", policy_rule: "mostly_supported" };
  }
  if (measurements.contradiction_ratio > measurements.support_ratio) return { verdict: "contradicted", policy_rule: "contradicted" };
  return { verdict: "mixed_evidence", policy_rule: "mixed_evidence" };
}

export interface VerificationResult {
  frame: VerificationFrame;
  measurements: MeasurementVector;
  assessment: PolicyAssessment | UnableToVerifyAssessment;
}

export function verifyInFrame(frame: VerificationFrame, input: EvidenceEvaluationInput, policy: VersionedVerdictPolicy): VerificationResult {
  const measurements = evaluateEvidence(frame, input);
  return { frame, measurements, assessment: applyVerdictPolicy(measurements, policy) };
}

export interface AssessmentReceiptForDiff {
  claim: { id: string };
  verification_frame: VerificationFrame;
  measurements: MeasurementVector;
  assessment: PolicyAssessment | UnableToVerifyAssessment;
}

export type FrameChangeFactor = "interpretation" | "evidence" | "policy" | "time" | "jurisdiction" | "program_version" | "method" | "possibility_space";
export interface AssessmentChangeAttribution {
  factor: FrameChangeFactor;
  materiality: number;
  explanation: string;
}

export interface ReceiptFrameDiff {
  claim_id: string;
  changed_components: FrameChangeFactor[];
  assessment_delta: Partial<Record<keyof MeasurementVector, number>>;
  attributions: AssessmentChangeAttribution[];
}

const frameFactors: Array<{ factor: FrameChangeFactor; changed: (left: VerificationFrame, right: VerificationFrame) => boolean; weight: number }> = [
  { factor: "interpretation", changed: (a, b) => a.interpretation !== b.interpretation, weight: 1 },
  { factor: "evidence", changed: (a, b) => canonicalSerialize(a.evidence_scope) !== canonicalSerialize(b.evidence_scope), weight: 1 },
  { factor: "policy", changed: (a, b) => a.policy_hash !== b.policy_hash, weight: 1 },
  { factor: "time", changed: (a, b) => a.assessment_time !== b.assessment_time, weight: .5 },
  { factor: "jurisdiction", changed: (a, b) => a.jurisdiction !== b.jurisdiction, weight: .75 },
  { factor: "program_version", changed: (a, b) => a.program.id !== b.program.id || a.program.version !== b.program.version, weight: 1 },
  { factor: "method", changed: (a, b) => a.method_manifest_hash !== b.method_manifest_hash, weight: .75 },
  { factor: "possibility_space", changed: (a, b) => a.possibility_space_hash !== b.possibility_space_hash, weight: 1 },
];

/** Heuristic, normalized attribution: changed material frame components share one unit of materiality. */
export function diffAssessmentReceipts(left: AssessmentReceiptForDiff, right: AssessmentReceiptForDiff): ReceiptFrameDiff {
  if (left.claim.id !== right.claim.id) throw new Error("Receipts must concern the same claim");
  const changed = frameFactors.filter((entry) => entry.changed(left.verification_frame, right.verification_frame));
  const totalWeight = changed.reduce((sum, entry) => sum + entry.weight, 0);
  const assessment_delta = Object.fromEntries(
    (Object.keys(left.measurements) as Array<keyof MeasurementVector>).map((key) => [key, right.measurements[key] - left.measurements[key]]),
  ) as Partial<Record<keyof MeasurementVector, number>>;
  return {
    claim_id: left.claim.id,
    changed_components: changed.map((entry) => entry.factor),
    assessment_delta,
    attributions: changed.map((entry) => ({
      factor: entry.factor,
      materiality: totalWeight === 0 ? 0 : entry.weight / totalWeight,
      explanation: `${entry.factor} changed between declared verification frames.`,
    })),
  };
}

export interface CanonicalClaim {
  id: string;
  canonical_form: Record<string, unknown>;
  /** Claim-content commitment; receipt integrity commitments remain under integrity. */
  hash: `0x${string}`;
}

export interface InformationalRelativityReceipt {
  claim: CanonicalClaim;
  verification_frame: VerificationFrame;
  measurements: MeasurementVector;
  assessment: (PolicyAssessment | UnableToVerifyAssessment) & {
    explanation: string;
    limitations: string[];
  };
  integrity: {
    claim_hash: `0x${string}`;
    frame_hash: `0x${string}`;
    evidence_root: `0x${string}`;
    receipt_hash: `0x${string}`;
    signatures: string[];
  };
}

const hashValue = (value: unknown): `0x${string}` =>
  `0x${createHash("sha256").update(canonicalSerialize(value as CanonicalValue)).digest("hex")}`;

/** Builds the portable receipt after evidence and policy evaluation are complete. */
export function createInformationalRelativityReceipt(args: {
  claim: Omit<CanonicalClaim, "hash"> & { hash?: `0x${string}` };
  verification: VerificationResult;
  evidence_root: `0x${string}`;
  explanation: string;
  limitations?: string[];
  signatures?: string[];
}): InformationalRelativityReceipt {
  const claimHash = args.claim.hash ?? hashValue({ id: args.claim.id, canonical_form: args.claim.canonical_form });
  const claim: CanonicalClaim = { ...args.claim, hash: claimHash };
  const integrityWithoutReceiptHash = {
    claim_hash: claimHash,
    frame_hash: hashVerificationFrame(args.verification.frame),
    evidence_root: args.evidence_root,
    signatures: args.signatures ?? [],
  };
  const receiptHash = hashValue({
    claim,
    verification_frame: args.verification.frame,
    measurements: args.verification.measurements,
    assessment: args.verification.assessment,
    integrity: integrityWithoutReceiptHash,
  });
  return {
    claim,
    verification_frame: args.verification.frame,
    measurements: args.verification.measurements,
    assessment: { ...args.verification.assessment, explanation: args.explanation, limitations: args.limitations ?? [] },
    integrity: { ...integrityWithoutReceiptHash, receipt_hash: receiptHash },
  };
}
