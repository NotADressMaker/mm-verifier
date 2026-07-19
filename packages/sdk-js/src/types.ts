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

export interface ProgramScoringComponent {
  id: string;
  description?: string;
  weight_bps: number;
}

export interface ProgramScoringDefinition {
  method: 'weighted_sum';
  components: ProgramScoringComponent[];
}

export interface ProgramThresholds {
  pass_bps: number;
  worthy_bps: number;
}

export interface ProgramReceiptDefinition {
  schema_version: '1';
  receipt_version: string;
  explain_version: string;
}

export interface ProgramDefinition {
  name: string;
  version: string;
  description?: string;
  inputs?: ProgramIO[];
  outputs?: ProgramIO[];
  steps: ProgramStep[];
  scoring: ProgramScoringDefinition;
  thresholds: ProgramThresholds;
  receipt: ProgramReceiptDefinition;
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
export type VerificationReceipt = SharedVerificationReceipt;

export type ReceiptExplain = SharedReceiptExplain;

/**
 * Response from getReceipt
 */
export interface ReceiptResponse {
  receipt: VerificationReceipt;
}

export interface ReceiptComparison {
  same_input: boolean;
  program_diff: Record<string, unknown>;
  context_diff: Record<string, unknown>;
  interpretation_diff: Record<string, unknown>;
  claim_diff: Record<string, unknown>;
  evidence_diff: Record<string, unknown>;
  limitation_diff: Record<string, unknown>;
  verdict_diff: Record<string, unknown>;
  summary: string;
}

export interface ReverifyRequest {
  mode: 'same_program_version' | 'latest_program_version' | 'another_program';
  program_id?: string;
  program_version?: string;
  updated_evidence?: unknown;
  reason: string;
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
import type {
  ReceiptExplain as SharedReceiptExplain,
  VerificationReceipt as SharedVerificationReceipt,
} from '../../shared/schemaTypes';
