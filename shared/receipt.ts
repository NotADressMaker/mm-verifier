/**
 * Verification Receipt - Canonical Settlement Schema
 *
 * A VerificationReceipt is the canonical proof that a verification task
 * completed. It contains all data needed to:
 * 1. Verify the receipt hash matches on-chain records
 * 2. Trace provenance of the verification
 * 3. Audit the evidence bundle
 */

import { hashCanonical, canonicalize } from './canonicalJson';
import { ProgramDefinitionWithLimits, computeProgramFingerprint } from './programs';

// ============================================================================
// Receipt Version
// ============================================================================

export const RECEIPT_VERSION = '1.0' as const;

// ============================================================================
// Verification Receipt
// ============================================================================

/**
 * Canonical verification receipt schema
 */
export interface VerificationReceipt {
  /** Schema version for forward compatibility */
  receipt_version: typeof RECEIPT_VERSION;

  /** Task identifier (on-chain) */
  task_id: string;

  /** Unix timestamp when receipt was generated */
  generated_at: number;

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

  // ─────────────────────────────────────────────────────────────────────────
  // Program Reference
  // ─────────────────────────────────────────────────────────────────────────

  /** Program used for verification (if any) */
  program?: {
    program_id: string;
    fingerprint: `0x${string}`;
    name: string;
    version: string;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Evidence Bundle
  // ─────────────────────────────────────────────────────────────────────────

  /** Evidence bundle reference */
  evidence: {
    bundle_hash: `0x${string}`;
    bundle_uri: string;
    bundle_version: '0.1' | '0.2';
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
// Receipt Hash Computation
// ============================================================================

/**
 * Fields included in receipt hash (order matters for determinism)
 */
const RECEIPT_HASH_FIELDS = [
  'receipt_version',
  'task_id',
  'generated_at',
  'input_hash',
  'output_hash',
  'score_bps',
  'verdict',
  'worthy',
  'program',
  'evidence',
  'metering',
  'provenance',
  'model_commitments',
  'reasoning_trace',
  // Note: zk_proof is NOT included in hash (it proves the hash)
] as const;

/**
 * Normalize receipt for hashing
 */
function normalizeReceiptForHash(
  receipt: VerificationReceipt
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
export function computeReceiptHash(receipt: VerificationReceipt): `0x${string}` {
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
  bundle_version?: '0.1' | '0.2';
  llm_provider: string;
  llm_model: string;
  program?: ProgramDefinitionWithLimits & { program_id?: string };
  metering?: VerificationReceipt['metering'];
  verifier_node?: string;
  software_version?: string;
  worthy_threshold_bps?: number;
}

/**
 * Build a verification receipt from parameters
 */
export function buildReceipt(params: BuildReceiptParams): VerificationReceipt {
  const worthyThreshold = params.worthy_threshold_bps ?? 8000;
  const passThreshold = 5000;

  const receipt: VerificationReceipt = {
    receipt_version: RECEIPT_VERSION,
    task_id: params.task_id,
    generated_at: Math.floor(Date.now() / 1000),
    input_hash: params.input_hash,
    output_hash: params.output_hash,
    score_bps: params.score_bps,
    verdict: params.score_bps >= passThreshold,
    worthy: params.score_bps >= worthyThreshold,
    evidence: {
      bundle_hash: params.bundle_hash,
      bundle_uri: params.bundle_uri,
      bundle_version: params.bundle_version ?? '0.2',
    },
    provenance: {
      llm_provider: params.llm_provider,
      llm_model: params.llm_model,
      verifier_node: params.verifier_node,
      software_version: params.software_version,
    },
  };

  // Add program reference if provided
  if (params.program) {
    const fingerprint = computeProgramFingerprint(params.program);
    receipt.program = {
      program_id: params.program.program_id ?? `prog_${fingerprint.slice(2, 10)}`,
      fingerprint: fingerprint as `0x${string}`,
      name: params.program.name,
      version: params.program.version,
    };
  }

  // Add metering if provided
  if (params.metering) {
    receipt.metering = params.metering;
  }

  return receipt;
}

/**
 * Attach chain context to a receipt after finalization
 */
export function attachChainContext(
  receipt: VerificationReceipt,
  context: NonNullable<VerificationReceipt['chain_context']>
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
  signature: NonNullable<VerificationReceipt['signature']>
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

  if (!receipt || typeof receipt !== 'object') {
    return { valid: false, errors: ['Receipt must be an object'] };
  }

  const r = receipt as Record<string, unknown>;

  // Version check
  if (r.receipt_version !== RECEIPT_VERSION) {
    errors.push(`receipt_version must be "${RECEIPT_VERSION}"`);
  }

  // Required fields
  if (typeof r.task_id !== 'string' || r.task_id.length === 0) {
    errors.push('task_id is required');
  }

  if (typeof r.generated_at !== 'number' || r.generated_at <= 0) {
    errors.push('generated_at must be a positive unix timestamp');
  }

  // Hash fields
  const hashFields = ['input_hash', 'output_hash'] as const;
  for (const field of hashFields) {
    const value = r[field];
    if (typeof value !== 'string' || !value.match(/^0x[0-9a-fA-F]{64}$/)) {
      errors.push(`${field} must be a 0x-prefixed 32-byte hex string`);
    }
  }

  // Score validation
  if (typeof r.score_bps !== 'number' || r.score_bps < 0 || r.score_bps > 10000) {
    errors.push('score_bps must be between 0 and 10000');
  }

  if (typeof r.verdict !== 'boolean') {
    errors.push('verdict must be a boolean');
  }

  if (typeof r.worthy !== 'boolean') {
    errors.push('worthy must be a boolean');
  }

  // Evidence validation
  if (!r.evidence || typeof r.evidence !== 'object') {
    errors.push('evidence is required');
  } else {
    const e = r.evidence as Record<string, unknown>;
    if (typeof e.bundle_hash !== 'string' || !e.bundle_hash.match(/^0x[0-9a-fA-F]{64}$/)) {
      errors.push('evidence.bundle_hash must be a 0x-prefixed 32-byte hex string');
    }
    if (typeof e.bundle_uri !== 'string' || e.bundle_uri.length === 0) {
      errors.push('evidence.bundle_uri is required');
    }
  }

  // Provenance validation
  if (!r.provenance || typeof r.provenance !== 'object') {
    errors.push('provenance is required');
  } else {
    const p = r.provenance as Record<string, unknown>;
    if (typeof p.llm_provider !== 'string') {
      errors.push('provenance.llm_provider is required');
    }
    if (typeof p.llm_model !== 'string') {
      errors.push('provenance.llm_model is required');
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
export function isVerificationReceipt(value: unknown): value is VerificationReceipt {
  return validateReceipt(value).valid;
}

// ============================================================================
// Receipt Comparison
// ============================================================================

/**
 * Compare two receipts for equivalence (ignoring chain_context and signature)
 */
export function receiptsMatch(a: VerificationReceipt, b: VerificationReceipt): boolean {
  return computeReceiptHash(a) === computeReceiptHash(b);
}

/**
 * Verify that a receipt's hash matches an expected hash
 */
export function verifyReceiptHash(
  receipt: VerificationReceipt,
  expectedHash: `0x${string}`
): boolean {
  return computeReceiptHash(receipt) === expectedHash;
}
