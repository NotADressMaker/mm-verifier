/**
 * AI Transparency Types for MAMV
 *
 * Provides types and utilities for:
 * - Reasoning trace commitments (hash-based audit trail)
 * - Model commitment hashes (detect silent model updates)
 * - ZK proof interface stubs (future trustless verification)
 */

import { hashCanonical, canonicalize } from './canonicalJson';

// ============================================================================
// Reasoning Trace Commitments
// ============================================================================

/**
 * A single step in the reasoning trace.
 * Only hashes are stored in the evidence bundle; full text is off-chain.
 */
export interface ReasoningTraceStep {
  /** Unique identifier for this step */
  step_id: string;

  /** Optional short summary (NOT the full chain-of-thought) */
  summary?: string;

  /** keccak256 hash of the full reasoning text for this step */
  thought_hash: `0x${string}`;

  /** Optional references to supporting evidence (URIs or hashes) */
  evidence_refs?: string[];

  /** Confidence score for this reasoning step (0-1) */
  confidence?: number;

  /** Type of reasoning step */
  step_type?: 'observation' | 'inference' | 'conclusion' | 'citation' | 'verification';
}

/**
 * Complete reasoning trace with commitments.
 * Stored in evidence bundle; full trace content is off-chain.
 */
export interface ReasoningTraceCommitment {
  /** Version of the reasoning trace format */
  trace_version: '1.0';

  /** Individual reasoning steps with hash commitments */
  steps: ReasoningTraceStep[];

  /** Hash of the complete trace (all steps concatenated) */
  trace_hash: `0x${string}`;

  /** Optional URI to encrypted/full trace stored off-chain */
  trace_uri?: string;

  /** Timestamp when trace was generated */
  generated_at: number;
}

/**
 * Compute hash for a single reasoning step's content.
 * Uses UTF-8 encoding of the text content.
 */
export function hashReasoningStep(content: string): `0x${string}` {
  // Hash raw text bytes for reasoning content (not JSON)
  const encoder = new TextEncoder();
  const bytes = encoder.encode(content);
  // Use keccak256 via ethers or similar
  return hashCanonical(content) as `0x${string}`;
}

/**
 * Compute hash for an entire reasoning trace.
 * Concatenates all step hashes in order.
 */
export function computeTraceHash(steps: ReasoningTraceStep[]): `0x${string}` {
  const concatenated = steps.map((s) => s.thought_hash).join('');
  return hashCanonical(concatenated) as `0x${string}`;
}

/**
 * Build a reasoning trace commitment from raw steps.
 */
export function buildReasoningTraceCommitment(
  rawSteps: Array<{
    step_id: string;
    content: string;
    summary?: string;
    evidence_refs?: string[];
    confidence?: number;
    step_type?: ReasoningTraceStep['step_type'];
  }>,
  traceUri?: string
): ReasoningTraceCommitment {
  const steps: ReasoningTraceStep[] = rawSteps.map((raw) => ({
    step_id: raw.step_id,
    summary: raw.summary,
    thought_hash: hashReasoningStep(raw.content),
    evidence_refs: raw.evidence_refs,
    confidence: raw.confidence,
    step_type: raw.step_type,
  }));

  return {
    trace_version: '1.0',
    steps,
    trace_hash: computeTraceHash(steps),
    trace_uri: traceUri,
    generated_at: Math.floor(Date.now() / 1000),
  };
}

// ============================================================================
// Model Commitment
// ============================================================================

/**
 * Inference configuration for an LLM call.
 */
export interface InferenceConfig {
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stop_sequences?: string[];
  frequency_penalty?: number;
  presence_penalty?: number;
  seed?: number;
  /** Any additional provider-specific parameters */
  extra?: Record<string, unknown>;
}

/**
 * Model commitment data for hash computation.
 */
export interface ModelCommitmentData {
  provider: string;
  model: string;
  version?: string;
  inference_config?: InferenceConfig;
}

/**
 * Computed model commitment with hashes.
 */
export interface ModelCommitment {
  /** Hash of the complete model commitment (provider+model+version+config) */
  model_commitment_hash: `0x${string}`;

  /** Hash of just the inference configuration */
  inference_config_hash: `0x${string}`;

  /** Original data used to compute the commitment */
  data: ModelCommitmentData;
}

/**
 * Fields to include in model commitment hash (ordered for determinism).
 */
const MODEL_COMMITMENT_FIELDS = [
  'provider',
  'model',
  'version',
  'inference_config',
] as const;

/**
 * Fields to include in inference config hash (ordered for determinism).
 */
const INFERENCE_CONFIG_FIELDS = [
  'temperature',
  'top_p',
  'max_tokens',
  'stop_sequences',
  'frequency_penalty',
  'presence_penalty',
  'seed',
  'extra',
] as const;

/**
 * Normalize inference config for deterministic hashing.
 */
function normalizeInferenceConfig(
  config: InferenceConfig | undefined
): Record<string, unknown> {
  if (!config) {
    return {};
  }

  const normalized: Record<string, unknown> = {};
  for (const field of INFERENCE_CONFIG_FIELDS) {
    const value = config[field as keyof InferenceConfig];
    if (value !== undefined) {
      normalized[field] = value;
    }
  }
  return normalized;
}

/**
 * Normalize model commitment data for deterministic hashing.
 */
function normalizeModelCommitmentData(
  data: ModelCommitmentData
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  for (const field of MODEL_COMMITMENT_FIELDS) {
    if (field === 'inference_config') {
      const configNormalized = normalizeInferenceConfig(data.inference_config);
      if (Object.keys(configNormalized).length > 0) {
        normalized.inference_config = configNormalized;
      }
    } else {
      const value = data[field as keyof ModelCommitmentData];
      if (value !== undefined) {
        normalized[field] = value;
      }
    }
  }

  return normalized;
}

/**
 * Compute model commitment hashes.
 */
export function computeModelCommitment(data: ModelCommitmentData): ModelCommitment {
  const normalized = normalizeModelCommitmentData(data);
  const modelCommitmentHash = hashCanonical(normalized) as `0x${string}`;

  const configNormalized = normalizeInferenceConfig(data.inference_config);
  const inferenceConfigHash = hashCanonical(configNormalized) as `0x${string}`;

  return {
    model_commitment_hash: modelCommitmentHash,
    inference_config_hash: inferenceConfigHash,
    data,
  };
}

/**
 * Verify that a model commitment matches expected data.
 */
export function verifyModelCommitment(
  commitment: ModelCommitment,
  expectedData: ModelCommitmentData
): boolean {
  const recomputed = computeModelCommitment(expectedData);
  return recomputed.model_commitment_hash === commitment.model_commitment_hash;
}

// ============================================================================
// ZK Proof Interface (Stub for Future Implementation)
// ============================================================================

/**
 * Public inputs for ZK verification.
 * These are the values that can be verified on-chain.
 */
export interface ZKPublicInputs {
  input_hash: `0x${string}`;
  output_hash: `0x${string}`;
  model_commitment_hash: `0x${string}`;
  score_bps: number;
  bundle_hash: `0x${string}`;
}

/**
 * ZK proof attachment for verification receipts.
 * When present, allows trustless verification of the computation.
 */
export interface ZKProofAttachment {
  /** The proof bytes (format depends on proof system) */
  zk_proof: `0x${string}`;

  /** Public inputs that anyone can verify */
  zk_public_inputs: ZKPublicInputs;

  /** Proof system used (for future compatibility) */
  proof_system: 'risc_zero' | 'sp1' | 'noir' | 'other';

  /** Version of the verification circuit */
  circuit_version?: string;

  /** Verification key hash (for circuit identification) */
  vk_hash?: `0x${string}`;
}

/**
 * Check if a receipt has a valid ZK proof structure.
 * Does NOT verify the proof cryptographically.
 */
export function hasZKProof(
  receipt: { zk_proof?: ZKProofAttachment }
): receipt is { zk_proof: ZKProofAttachment } {
  return (
    receipt.zk_proof !== undefined &&
    typeof receipt.zk_proof.zk_proof === 'string' &&
    receipt.zk_proof.zk_proof.startsWith('0x') &&
    receipt.zk_proof.zk_public_inputs !== undefined
  );
}

/**
 * Placeholder for future ZK proof verification.
 * Currently returns a stub result.
 */
export function verifyZKProof(
  _proof: ZKProofAttachment
): { verified: boolean; error?: string } {
  // TODO: Implement actual ZK verification when proof system is integrated
  return {
    verified: false,
    error: 'ZK verification not yet implemented. This is a placeholder.',
  };
}

// ============================================================================
// Extended Evidence Bundle Types
// ============================================================================

/**
 * Extended provenance model run with commitment hashes.
 */
export interface ExtendedProvenanceModelRun {
  provider: string;
  model: string;
  prompt_hash: `0x${string}`;
  response_hash: `0x${string}`;
  started_at: number;
  finished_at: number;
  latency_ms?: number;
  tokens_in?: number;
  tokens_out?: number;
  /** Model commitment hash for this run */
  model_commitment_hash?: `0x${string}`;
  /** Inference config hash for this run */
  inference_config_hash?: `0x${string}`;
}

/**
 * Evidence bundle transparency extensions.
 * These fields extend EvidenceBundleV02 for AI transparency.
 */
export interface TransparencyExtensions {
  /** Reasoning trace commitments (hash-based, not raw CoT) */
  reasoning_trace?: ReasoningTraceCommitment;

  /** ZK proof attachment (when available) */
  zk_proof?: ZKProofAttachment;
}

// ============================================================================
// Validation
// ============================================================================

export interface ReasoningTraceValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a reasoning trace commitment structure.
 */
export function validateReasoningTrace(
  trace: unknown
): ReasoningTraceValidationResult {
  const errors: string[] = [];

  if (!trace || typeof trace !== 'object') {
    return { valid: false, errors: ['Reasoning trace must be an object'] };
  }

  const t = trace as Record<string, unknown>;

  if (t.trace_version !== '1.0') {
    errors.push('trace_version must be "1.0"');
  }

  if (!Array.isArray(t.steps)) {
    errors.push('steps must be an array');
  } else {
    for (let i = 0; i < t.steps.length; i++) {
      const step = t.steps[i] as Record<string, unknown>;
      if (typeof step.step_id !== 'string') {
        errors.push(`steps[${i}].step_id must be a string`);
      }
      if (
        typeof step.thought_hash !== 'string' ||
        !step.thought_hash.match(/^0x[0-9a-fA-F]{64}$/)
      ) {
        errors.push(`steps[${i}].thought_hash must be a 0x-prefixed 32-byte hex`);
      }
    }
  }

  if (
    typeof t.trace_hash !== 'string' ||
    !t.trace_hash.match(/^0x[0-9a-fA-F]{64}$/)
  ) {
    errors.push('trace_hash must be a 0x-prefixed 32-byte hex string');
  }

  if (typeof t.generated_at !== 'number' || t.generated_at <= 0) {
    errors.push('generated_at must be a positive unix timestamp');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export interface ModelCommitmentValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a model commitment structure.
 */
export function validateModelCommitment(
  commitment: unknown
): ModelCommitmentValidationResult {
  const errors: string[] = [];

  if (!commitment || typeof commitment !== 'object') {
    return { valid: false, errors: ['Model commitment must be an object'] };
  }

  const c = commitment as Record<string, unknown>;

  if (
    typeof c.model_commitment_hash !== 'string' ||
    !c.model_commitment_hash.match(/^0x[0-9a-fA-F]{64}$/)
  ) {
    errors.push('model_commitment_hash must be a 0x-prefixed 32-byte hex');
  }

  if (
    typeof c.inference_config_hash !== 'string' ||
    !c.inference_config_hash.match(/^0x[0-9a-fA-F]{64}$/)
  ) {
    errors.push('inference_config_hash must be a 0x-prefixed 32-byte hex');
  }

  if (!c.data || typeof c.data !== 'object') {
    errors.push('data must be an object');
  } else {
    const d = c.data as Record<string, unknown>;
    if (typeof d.provider !== 'string') {
      errors.push('data.provider must be a string');
    }
    if (typeof d.model !== 'string') {
      errors.push('data.model must be a string');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
