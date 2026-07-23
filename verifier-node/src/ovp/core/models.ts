export const OVP_VERSION = '0.1.0';

export const CLAIM_TYPES = [
  'mathematical', 'logical', 'empirical', 'historical', 'bibliographic',
  'definitional', 'interpretive', 'predictive', 'normative', 'unknown',
] as const;
export type ClaimType = (typeof CLAIM_TYPES)[number];
export const FINDING_STATUSES = [
  'verified', 'contradicted', 'unsupported', 'ambiguous', 'partially_supported',
  'needs_qualification', 'not_machine_checkable', 'error',
] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];
export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type VerificationMethod =
  | 'formal_proof' | 'deterministic_check' | 'structured_data' | 'primary_source'
  | 'secondary_source' | 'semantic_source_comparison' | 'model_review' | 'human_required';

export interface SourceSpan { start: number; end: number; }
export interface Claim {
  claim_id: string;
  text: string;
  source_span: SourceSpan;
  context: string;
  claim_type: ClaimType;
  dependencies: string[];
  metadata: Record<string, unknown>;
}
export interface Evidence {
  type: 'source' | 'proof' | 'calculation' | 'repository';
  locator: string;
  supporting_excerpt: string;
  content_hash: string;
  relation?: 'supports' | 'contradicts' | 'qualifies' | 'contextualizes' | 'inconclusive';
  retrieved_at?: string;
}
export interface CheckerIdentity { name: string; version: string; }
export interface Reproducibility {
  verifier_version: string;
  input_hash: string;
  timestamp: string;
  profile: string;
  checker_versions: Record<string, string>;
}
export interface Finding {
  finding_id: string;
  claim_id: string;
  claim_text: string;
  status: FindingStatus;
  severity: Severity;
  reason: string;
  evidence: Evidence[];
  counterevidence: Evidence[];
  assumptions: string[];
  limitations: string[];
  verification_method: VerificationMethod;
  checker: CheckerIdentity;
  confidence?: number;
  suggested_revision?: string;
  reproducibility: Reproducibility;
}
export interface VerificationContext {
  input: string;
  input_hash: string;
  profile: string;
  claims: Claim[];
  sources?: Evidence[];
  network_enabled: boolean;
  llm_enabled: boolean;
  verifier_version: string;
  timestamp: string;
}
export interface VerificationRun {
  ovp_version: typeof OVP_VERSION;
  run_id: string;
  input: { type: string; hash: string };
  claims: Claim[];
  findings: Finding[];
  disagreements: Array<{ claim_id: string; finding_ids: string[]; reason: string }>;
  provenance: {
    verifier_version: string; profile: string; timestamp: string; input_hash: string;
    checker_versions: Record<string, string>; network_used: boolean; llm_used: boolean;
    checker_failures: Array<{ checker: string; message: string }>;
  };
}
