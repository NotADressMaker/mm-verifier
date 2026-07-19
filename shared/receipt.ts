/**
 * Verification Receipt - Canonical Settlement Schema
 *
 * A VerificationReceipt is the canonical proof that a verification task
 * completed. It contains all data needed to:
 * 1. Verify the receipt hash matches on-chain records
 * 2. Trace provenance of the verification
 * 3. Audit the evidence bundle
 */

import type { Verdict } from './verdicts';

import { hashCanonical, canonicalize } from "./canonicalJson";
import {
  ProgramDefinitionWithLimits,
  computeProgramFingerprint,
} from "./programs";
import { VerifiedPlaintextStatement } from "./types";

// ============================================================================
// Receipt Version
// ============================================================================

export const RECEIPT_VERSION = "1.0.0" as const;
export const EXPLAIN_VERSION = "1.0.0" as const;
export const RECEIPT_SCHEMA_VERSION = "1" as const;

// ============================================================================
// Verification Receipt
// ============================================================================

/**
 * Canonical verification receipt schema
 */
export interface VerificationReceipt {
  /** Schema version for compatibility checks */
  schema_version: typeof RECEIPT_SCHEMA_VERSION;

  /** Schema version for the receipt payload */
  version: typeof RECEIPT_VERSION;

  /** Schema version for forward compatibility */
  receipt_version: typeof RECEIPT_VERSION;

  /** Public portable receipt identifier (computed from the canonical receipt hash when available) */
  receipt_id?: string;

  /** Task identifier (on-chain or API job id) */
  task_id: string;

  /** Unix timestamp when receipt was generated */
  generated_at: number;

  /** ISO-8601 timestamp for public receipt viewers */
  created_at?: string;

  /** Human-readable submitted input when storage policy allows it */
  input_checked?: string;

  /** Human-readable AI output or claim that was checked when storage policy allows it */
  output_checked?: string;

  /** Short plain-language summary of the claim/output reviewed */
  claim_summary?: string;

  // ─────────────────────────────────────────────────────────────────────────
  // Input/Output Hashes
  // ─────────────────────────────────────────────────────────────────────────

  /** keccak256 of canonical input */
  input_hash: `0x${string}`;

  /** keccak256 of canonical output (selected response) */
  output_hash: `0x${string}`;

  // ─────────────────────────────────────────────────────────────────────────
  // Verification Result
  // ─────────────────────────────────────────────────────────────────────────

  /** Final score in basis points (0-10000) */
  score_bps: number;

  /** Pass/fail verdict */
  verdict: boolean;

  /** Score meets "worthy" threshold (default 8000 bps) */
  worthy: boolean;

  /** Evidence verdict; see docs/VERDICTS.md. */
  verification_status?: Verdict;

  /** Confidence score normalized from 0..1 for public UI/SDK use */
  confidence_score?: number;

  /** Public warnings and risk flags surfaced by the verification run */
  warnings?: Array<{ code: string; severity: "low" | "medium" | "high"; message: string }>;

  /** Provider/model votes considered by the verifier */
  votes?: Array<{ provider: string; model: string; vote: "support" | "contradict" | "abstain" | "uncertain"; score_bps?: number; rationale?: string }>;

  /** Outputs or model votes flagged as outliers */
  outliers?: Array<{ id: string; provider?: string; model?: string; reason: string; score_bps?: number }>;

  /** Public quorum status. bft_quorum remains available in explain for compatibility. */
  quorum_status?: { met: boolean; method: "single_verifier" | "supermajority" | "bft_style_weighted"; threshold_bps?: number; observed_bps?: number; participant_count?: number };

  vote_merkle_root?: `0x${string}`;
  vote_merkle_proofs?: Record<string, string[]>;

  /** Source/evidence metadata safe to show without raw bundle access */
  evidence_sources?: Array<{ url?: string; title?: string; domain?: string; content_hash?: `0x${string}`; retrieved_at?: number; notes?: string }>;

  /** Canonical receipt hash for independent verification */
  receipt_hash?: `0x${string}`;

  /** Optional signer metadata without exposing private signing internals */
  signer?: { id?: string; address?: `0x${string}`; signature?: `0x${string}`; signed_at?: number; scheme?: string };

  /** Optional onchain anchoring metadata. Anchoring makes the receipt tamper-evident; it does not prove the answer true. */
  onchain_anchor?: { chain_id?: number; contract_address?: `0x${string}`; tx_hash?: `0x${string}`; block_number?: number; anchor_status: "not_anchored" | "pending" | "anchored" | "failed" };

  // ─────────────────────────────────────────────────────────────────────────
  // Program Reference
  // ─────────────────────────────────────────────────────────────────────────

  /** Program used for verification (if any) */
  program?: {
    id: string;
    version: string;
    hash: string;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Evidence Bundle
  // ─────────────────────────────────────────────────────────────────────────

  /** Evidence bundle reference */
  evidence: {
    bundle_hash: `0x${string}`;
    bundle_uri: string;
    bundle_version: "0.1" | "0.2" | "0.3";
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Metering (Resource Usage)
  // ─────────────────────────────────────────────────────────────────────────

  /** Resource consumption during verification */
  metering?: {
    llm_calls: number;
    total_tokens: number;
    execution_ms: number;
    retrieval_calls?: number;
    bundle_size_bytes?: number;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Provenance
  // ─────────────────────────────────────────────────────────────────────────

  /** Execution provenance for audit trail */
  provenance: {
    /** Verifier node identifier */
    verifier_node?: string;
    /** Software version/commit */
    software_version?: string;
    /** LLM provider used */
    llm_provider: string;
    /** LLM model used */
    llm_model: string;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Chain Context
  // ─────────────────────────────────────────────────────────────────────────

  /** On-chain context when finalized */
  chain_context?: {
    chain_id: number;
    contract_address: `0x${string}`;
    finalized_at: number;
    block_number: number;
    tx_hash: `0x${string}`;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Signature (Optional attestation)
  // ─────────────────────────────────────────────────────────────────────────

  /** EIP-712 signature from verifier */
  signature?: {
    signer: `0x${string}`;
    signature: `0x${string}`;
    signed_at: number;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Model Accountability (New)
  // ─────────────────────────────────────────────────────────────────────────

  /** Model commitment hashes for accountability */
  model_commitments?: Array<{
    provider: string;
    model: string;
    model_commitment_hash: `0x${string}`;
    inference_config_hash: `0x${string}`;
  }>;

  // ─────────────────────────────────────────────────────────────────────────
  // Reasoning Trace (New)
  // ─────────────────────────────────────────────────────────────────────────

  /** Reasoning trace commitments (hashes only, not raw CoT) */
  reasoning_trace?: {
    trace_hash: `0x${string}`;
    trace_uri?: string;
    step_count: number;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Explainability (Machine-readable)
  // ─────────────────────────────────────────────────────────────────────────

  /** Structured, machine-readable explanation */
  explain: ReceiptExplain;

  /** Signed statement for verified plaintext bundles (privacy mode) */
  plaintext_verification?: VerifiedPlaintextStatement;

  // ─────────────────────────────────────────────────────────────────────────
  // ZK Proof (Future)
  // ─────────────────────────────────────────────────────────────────────────

  /** ZK proof for trustless verification (when available) */
  zk_proof?: {
    proof: `0x${string}`;
    public_inputs: {
      input_hash: `0x${string}`;
      output_hash: `0x${string}`;
      model_commitment_hash: `0x${string}`;
      score_bps: number;
      bundle_hash: `0x${string}`;
    };
    proof_system: string;
  };
}

// ============================================================================
// Explainability
// ============================================================================

export interface ReceiptExplain {
  version: typeof EXPLAIN_VERSION;
  score_components: Array<{
    name: string;
    score_bps: number;
    weight_bps?: number;
    notes?: string;
  }>;
  score_components_detail: {
    coverage_bps: number;
    contradiction_penalty_bps: number;
    citation_quality_bps: number;
    final_score_bps: number;
  };
  claim_summary: Array<{
    cluster_id: string;
    canonical_text: string;
    supported_by: string[];
    contradicted_by: string[];
    severity?: "LOW" | "MED" | "HIGH";
    citations: Array<{
      url: string;
      domain?: string;
      title?: string;
    }>;
  }>;
  highlights: string[];
  checks: Record<string, unknown>;
  checks_fired: Array<{
    id: string;
    severity: "low" | "medium" | "high";
    summary: string;
    claim_id?: string;
  }>;
  uncertain_claims: Array<{
    claim_id: string;
    text: string;
    confidence?: number;
    reason: string;
  }>;
  score_adjustments: Array<{
    component: string;
    score_bps: number;
    weight_bps?: number;
    contribution_bps?: number;
    direction: "up" | "down" | "neutral";
    reason?: string;
  }>;
  contradictions_found: Array<{
    type: string;
    severity: string;
    summary: string;
    evidence_refs: string[];
  }>;
  citation_checks: Array<{
    claim: string;
    sources: string[];
    verdict: string;
    notes?: string;
  }>;
  model_disagreement: {
    models: string[];
    agreement_rate: number;
    clusters?: Array<Record<string, unknown>>;
  };
  debug_trace_uri?: string;
  debug_trace?: Record<string, unknown>;
  plaintext_verification?: VerifiedPlaintextStatement;
  bft_quorum?: boolean;
  outliers?: string[];
  vote_merkle_root?: `0x${string}`;
  vote_merkle_proofs?: Record<string, string[]>;
  timings_ms?: {
    fetch?: number;
    program_run?: number;
    total?: number;
  };
}

// ============================================================================
// Receipt Hash Computation
// ============================================================================

/**
 * Fields included in receipt hash (order matters for determinism)
 */
const RECEIPT_HASH_FIELDS = [
  "schema_version",
  "version",
  "receipt_version",
  "task_id",
  "generated_at",
  "created_at",
  "input_checked",
  "output_checked",
  "claim_summary",
  "input_hash",
  "output_hash",
  "score_bps",
  "verdict",
  "worthy",
  "verification_status",
  "confidence_score",
  "warnings",
  "votes",
  "outliers",
  "quorum_status",
  "vote_merkle_root",
  "vote_merkle_proofs",
  "evidence_sources",
  "signer",
  "onchain_anchor",
  "program",
  "evidence",
  "metering",
  "provenance",
  "model_commitments",
  "reasoning_trace",
  "explain",
  "plaintext_verification",
  // Note: zk_proof is NOT included in hash (it proves the hash)
] as const;

/**
 * Normalize receipt for hashing
 */
function normalizeReceiptForHash(
  receipt: VerificationReceipt,
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  for (const field of RECEIPT_HASH_FIELDS) {
    const value = receipt[field as keyof VerificationReceipt];
    if (value !== undefined) {
      normalized[field] = value;
    }
  }

  return normalized;
}

/**
 * Compute deterministic hash of a receipt
 * Note: Does NOT include chain_context or signature (those come after hashing)
 *
 * @param receipt - The verification receipt
 * @returns 0x-prefixed keccak256 hash
 */
export function computeReceiptHash(
  receipt: VerificationReceipt,
): `0x${string}` {
  const normalized = normalizeReceiptForHash(receipt);
  return hashCanonical(normalized) as `0x${string}`;
}

/**
 * Get the canonical JSON representation of a receipt (for debugging)
 */
export function getReceiptCanonicalJson(receipt: VerificationReceipt): string {
  const normalized = normalizeReceiptForHash(receipt);
  return canonicalize(normalized);
}

// ============================================================================
// Receipt Builder
// ============================================================================

export interface BuildReceiptParams {
  task_id: string;
  input_hash: `0x${string}`;
  output_hash: `0x${string}`;
  score_bps: number;
  bundle_hash: `0x${string}`;
  bundle_uri: string;
  bundle_version?: "0.1" | "0.2" | "0.3";
  llm_provider: string;
  llm_model: string;
  program?: ProgramDefinitionWithLimits & { program_id?: string };
  program_hash?: string;
  metering?: VerificationReceipt["metering"];
  verifier_node?: string;
  software_version?: string;
  worthy_threshold_bps?: number;
  explain?: ReceiptExplain;
}

/**
 * Build a verification receipt from parameters
 */
export function buildReceipt(params: BuildReceiptParams): VerificationReceipt {
  const worthyThreshold = params.worthy_threshold_bps ?? 8000;
  const passThreshold = 5000;
  const explain: ReceiptExplain = params.explain ?? {
    version: EXPLAIN_VERSION,
    score_components: [],
    score_components_detail: {
      coverage_bps: 0,
      contradiction_penalty_bps: 0,
      citation_quality_bps: 0,
      final_score_bps: 0,
    },
    claim_summary: [],
    highlights: [],
    checks: {},
    checks_fired: [],
    uncertain_claims: [],
    score_adjustments: [],
    contradictions_found: [],
    citation_checks: [],
    model_disagreement: {
      models: [],
      agreement_rate: 0,
    },
  };

  const receipt: VerificationReceipt = {
    schema_version: RECEIPT_SCHEMA_VERSION,
    version: RECEIPT_VERSION,
    receipt_version: RECEIPT_VERSION,
    task_id: params.task_id,
    generated_at: Math.floor(Date.now() / 1000),
    created_at: new Date().toISOString(),
    input_hash: params.input_hash,
    output_hash: params.output_hash,
    score_bps: params.score_bps,
    verdict: params.score_bps >= passThreshold,
    worthy: params.score_bps >= worthyThreshold,
    // A score alone cannot establish an evidence verdict.
    verification_status: "Unable to verify",
    confidence_score: Math.round((params.score_bps / 10000) * 100) / 100,
    warnings: explain.checks_fired.map((check) => ({ code: check.id, severity: check.severity, message: check.summary })),
    votes: explain.model_disagreement.models.map((model) => ({ provider: params.llm_provider, model, vote: params.score_bps >= 5000 ? "support" : "contradict", score_bps: params.score_bps })),
    outliers: (explain.outliers ?? []).map((id) => ({ id, reason: "Flagged by verifier disagreement analysis" })),
    quorum_status: { met: Boolean(explain.bft_quorum ?? params.score_bps >= 5000), method: "supermajority", threshold_bps: 6667, observed_bps: Math.round((explain.model_disagreement.agreement_rate ?? 0) * 10000), participant_count: explain.model_disagreement.models.length },
    vote_merkle_root: explain.vote_merkle_root,
    vote_merkle_proofs: explain.vote_merkle_proofs,
    evidence_sources: explain.claim_summary.flatMap((claim) => claim.citations.map((citation) => ({ url: citation.url, domain: citation.domain, title: citation.title }))),
    onchain_anchor: { anchor_status: "not_anchored" },
    evidence: {
      bundle_hash: params.bundle_hash,
      bundle_uri: params.bundle_uri,
      bundle_version: params.bundle_version ?? "0.2",
    },
    provenance: {
      llm_provider: params.llm_provider,
      llm_model: params.llm_model,
      verifier_node: params.verifier_node,
      software_version: params.software_version,
    },
    explain,
  };

  // Add program reference if provided
  if (params.program) {
    const fingerprint = computeProgramFingerprint(params.program);
    receipt.program = {
      id: params.program.program_id ?? `prog_${fingerprint.slice(2, 10)}`,
      version: params.program.version,
      hash: params.program_hash ?? fingerprint.replace(/^0x/, ""),
    };
  }

  // Add metering if provided
  if (params.metering) {
    receipt.metering = params.metering;
  }

  receipt.receipt_hash = computeReceiptHash(receipt);
  receipt.receipt_id = receipt.receipt_hash;
  return receipt;
}

/**
 * Attach chain context to a receipt after finalization
 */
export function attachChainContext(
  receipt: VerificationReceipt,
  context: NonNullable<VerificationReceipt["chain_context"]>,
): VerificationReceipt {
  return {
    ...receipt,
    chain_context: context,
  };
}

/**
 * Attach signature to a receipt
 */
export function attachSignature(
  receipt: VerificationReceipt,
  signature: NonNullable<VerificationReceipt["signature"]>,
): VerificationReceipt {
  return {
    ...receipt,
    signature,
  };
}

// ============================================================================
// Receipt Validation
// ============================================================================

export interface ReceiptValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a verification receipt
 */
export function validateReceipt(receipt: unknown): ReceiptValidationResult {
  const errors: string[] = [];

  if (!receipt || typeof receipt !== "object") {
    return { valid: false, errors: ["Receipt must be an object"] };
  }

  const r = receipt as Record<string, unknown>;
  const receiptVersion = r.receipt_version as string | undefined;
  const isLegacy = receiptVersion === "1.0";

  // Version check
  if (receiptVersion !== RECEIPT_VERSION && receiptVersion !== "1.0") {
    errors.push(`receipt_version must be "${RECEIPT_VERSION}"`);
  }

  if (!isLegacy && r.version !== RECEIPT_VERSION) {
    errors.push(`version must be "${RECEIPT_VERSION}"`);
  }

  if (!isLegacy && r.schema_version !== RECEIPT_SCHEMA_VERSION) {
    errors.push(`schema_version must be "${RECEIPT_SCHEMA_VERSION}"`);
  }

  // Required fields
  if (typeof r.task_id !== "string" || r.task_id.length === 0) {
    errors.push("task_id is required");
  }

  if (typeof r.generated_at !== "number" || r.generated_at <= 0) {
    errors.push("generated_at must be a positive unix timestamp");
  }

  // Hash fields
  const hashFields = ["input_hash", "output_hash"] as const;
  for (const field of hashFields) {
    const value = r[field];
    if (typeof value !== "string" || !value.match(/^0x[0-9a-fA-F]{64}$/)) {
      errors.push(`${field} must be a 0x-prefixed 32-byte hex string`);
    }
  }

  // Score validation
  if (
    typeof r.score_bps !== "number" ||
    r.score_bps < 0 ||
    r.score_bps > 10000
  ) {
    errors.push("score_bps must be between 0 and 10000");
  }

  if (typeof r.verdict !== "boolean") {
    errors.push("verdict must be a boolean");
  }

  if (typeof r.worthy !== "boolean") {
    errors.push("worthy must be a boolean");
  }

  // Evidence validation
  if (!r.evidence || typeof r.evidence !== "object") {
    errors.push("evidence is required");
  } else {
    const e = r.evidence as Record<string, unknown>;
    if (
      typeof e.bundle_hash !== "string" ||
      !e.bundle_hash.match(/^0x[0-9a-fA-F]{64}$/)
    ) {
      errors.push(
        "evidence.bundle_hash must be a 0x-prefixed 32-byte hex string",
      );
    }
    if (typeof e.bundle_uri !== "string" || e.bundle_uri.length === 0) {
      errors.push("evidence.bundle_uri is required");
    }
  }

  // Provenance validation
  if (!r.provenance || typeof r.provenance !== "object") {
    errors.push("provenance is required");
  } else {
    const p = r.provenance as Record<string, unknown>;
    if (typeof p.llm_provider !== "string") {
      errors.push("provenance.llm_provider is required");
    }
    if (typeof p.llm_model !== "string") {
      errors.push("provenance.llm_model is required");
    }
  }

  if (!isLegacy) {
    if (!r.explain || typeof r.explain !== "object") {
      errors.push("explain is required");
    }

    if (r.program !== undefined) {
      const program = r.program as Record<string, unknown>;
      if (typeof program.id !== "string") {
        errors.push("program.id is required");
      }
      if (typeof program.version !== "string") {
        errors.push("program.version is required");
      }
      if (typeof program.hash !== "string") {
        errors.push("program.hash is required");
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Type guard for VerificationReceipt
 */
export function isVerificationReceipt(
  value: unknown,
): value is VerificationReceipt {
  return validateReceipt(value).valid;
}

// ============================================================================
// Receipt Comparison
// ============================================================================

/**
 * Compare two receipts for equivalence (ignoring chain_context and signature)
 */
export function receiptsMatch(
  a: VerificationReceipt,
  b: VerificationReceipt,
): boolean {
  return computeReceiptHash(a) === computeReceiptHash(b);
}

/**
 * Verify that a receipt's hash matches an expected hash
 */
export function verifyReceiptHash(
  receipt: VerificationReceipt,
  expectedHash: `0x${string}`,
): boolean {
  return computeReceiptHash(receipt) === expectedHash;
}
