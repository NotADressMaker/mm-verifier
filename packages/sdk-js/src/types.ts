export type VerifyStatus = 'queued' | 'running' | 'finalized' | 'failed';

export type VerifyVerdict = true | false | 'unknown';

export type VerifyErrorCode =
  | 'INVALID_INPUT'
  | 'PROVIDER_ERROR'
  | 'CHAIN_REVERT'
  | 'TIMEOUT'
  | 'NOT_FOUND'
  | 'INTERNAL_ERROR';

export interface VerifyError {
  code: VerifyErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export interface EvidenceReference {
  bundle_hash: string | null;
  bundle_uri: string | null;
}

export interface TimingInfo {
  queue_ms: number | null;
  llm_ms: number | null;
  bundle_ms: number | null;
  chain_ms: number | null;
  total_ms: number | null;
}

export type ProgramStepType =
  | 'prompt'
  | 'retrieve'
  | 'cross-check'
  | 'score'
  | 'evidence'
  | 'consensus';

export interface ProgramStep {
  id?: string;
  type: ProgramStepType;
  description?: string;
  config?: Record<string, unknown>;
}

export interface ProgramIO {
  name: string;
  type: string;
  description?: string;
  required?: boolean;
}

export interface ProgramDefinition {
  name: string;
  version: string;
  description?: string;
  inputs?: ProgramIO[];
  outputs?: ProgramIO[];
  steps: ProgramStep[];
}

export interface ProgramSummary {
  id: string;
  version: string;
  description?: string;
  hash: string;
}

export interface VerifyRequest {
  prompt: string;
  models: string[];
  task_type: string;
  deadline?: number;
  commit_deadline_seconds?: number;
  reveal_deadline_seconds?: number;
  reward_pool?: number;
  program_id?: string;
  program_version?: string;
  idempotency_key?: string;
}

export interface VerifyResponse {
  task_id: string;
  status: VerifyStatus;
  verdict: VerifyVerdict;
  score_bps: number;
  evidence: EvidenceReference;
  timings: TimingInfo;
  errors: VerifyError[];
  program_id?: string;
  program_version?: string;
  program?: ProgramSummary;
}

export interface ProgramRecord {
  id: string;
  version: string;
  description: string;
  hash: string;
}

// ============================================================================
// Verified Output Records
// ============================================================================

/**
 * A verified output record representing a trustworthy AI artifact.
 * Derived from on-chain events (Revealed + Finalized).
 */
export interface VerifiedOutputRecord {
  record_version: '1';
  task_id: string;
  score_bps: number;
  verdict: boolean;
  worthy: boolean;
  bundle_hash: string;
  bundle_uri: string;
  finalized_at: number;
  chain_id: number;
  contract_address: string;
  input_hash?: string;
  output_hash?: string;
  evaluator?: string;
  block_number?: number;
  tx_hash?: string;
}

/**
 * Filter options for listing records
 */
export interface RecordQueryFilter {
  min_score_bps?: number;
  worthy_only?: boolean;
  verdict?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Response from listRecords
 */
export interface RecordListResponse {
  records: VerifiedOutputRecord[];
  total: number;
  has_more: boolean;
  filter: {
    min_score_bps?: number;
    worthy_only?: boolean;
    limit?: number;
    offset?: number;
  };
}

/**
 * Response from getRecord
 */
export interface RecordResponse {
  record: VerifiedOutputRecord;
}

/**
 * Response from verifyRecordOnChain
 */
export interface OnChainVerifyResult {
  task_id: string;
  verified: boolean;
  block_number?: number;
  tx_hash?: string;
}

// ============================================================================
// Verification Receipts
// ============================================================================

/**
 * Canonical verification receipt - proof of task completion
 */
export interface VerificationReceipt {
  version: '1.0.0';
  receipt_version: '1.0.0';
  task_id: string;
  generated_at: number;
  input_hash: string;
  output_hash: string;
  score_bps: number;
  verdict: boolean;
  worthy: boolean;
  program?: {
    id: string;
    version: string;
    hash: string;
  };
  evidence: {
    bundle_hash: string;
    bundle_uri: string;
    bundle_version: '0.1' | '0.2' | '0.3';
  };
  metering?: {
    llm_calls: number;
    total_tokens: number;
    execution_ms: number;
    retrieval_calls?: number;
    bundle_size_bytes?: number;
  };
  provenance: {
    verifier_node?: string;
    software_version?: string;
    llm_provider: string;
    llm_model: string;
  };
  chain_context?: {
    chain_id: number;
    contract_address: string;
    finalized_at: number;
    block_number: number;
    tx_hash: string;
  };
  signature?: {
    signer: string;
    signature: string;
    signed_at: number;
  };
  /** Model commitment hashes for accountability */
  model_commitments?: Array<{
    provider: string;
    model: string;
    model_commitment_hash: string;
    inference_config_hash: string;
  }>;
  /** Reasoning trace commitments (hashes only) */
  reasoning_trace?: {
    trace_hash: string;
    trace_uri?: string;
    step_count: number;
  };
  explain: ReceiptExplain;
  /** ZK proof for trustless verification */
  zk_proof?: {
    proof: string;
    public_inputs: {
      input_hash: string;
      output_hash: string;
      model_commitment_hash: string;
      score_bps: number;
      bundle_hash: string;
    };
    proof_system: string;
  };
}

export interface ReceiptExplain {
  version: '1.0.0';
  score_components: Array<{
    name: string;
    score_bps: number;
    weight_bps?: number;
    notes?: string;
  }>;
  checks: Record<string, unknown>;
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
  timings_ms?: {
    fetch?: number;
    program_run?: number;
    total?: number;
  };
}

/**
 * Response from getReceipt
 */
export interface ReceiptResponse {
  receipt: VerificationReceipt;
}

// ============================================================================
// Compact Receipt (for quickstart API)
// ============================================================================

/**
 * Compact receipt for the simplified verify() API.
 * Contains all essential fields for displaying verification results.
 */
export interface Receipt {
  task_id: string;
  verdict: boolean;
  score_bps: number;
  bundle_hash: string;
  bundle_uri: string;
  program_id: string;
  program_version: string;
  chain_id: number;
  contract_address: string;
}

/**
 * Options for the verify() function
 */
export interface VerifyOptions {
  /** Models to use for verification (default: ['gpt-4', 'claude-3']) */
  models?: string[];
  /** Task type (default: 'factual-qa') */
  taskType?: string;
  /** Program ID to use (default: built-in 'factual-consensus') */
  programId?: string;
  /** Program version to use (default: '1.0.0') */
  programVersion?: string;
  /** Timeout for waiting for finalization (default: 120000ms) */
  timeoutMs?: number;
  /** Poll interval when waiting for finalization (default: 3000ms) */
  pollIntervalMs?: number;
}

/**
 * Result of verifyReceiptOnchain()
 */
export interface OnchainVerifyResult {
  valid: boolean;
  checks: {
    receipt_exists: boolean;
    hash_matches: boolean;
    chain_matches: boolean;
    contract_matches: boolean;
  };
  errors: string[];
}
