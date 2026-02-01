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

export interface VerifyRequest {
  prompt: string;
  models: string[];
  task_type: string;
  deadline?: number;
  commit_deadline_seconds?: number;
  reveal_deadline_seconds?: number;
  reward_pool?: number;
  program_id?: string;
  program?: ProgramDefinition;
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
  program?: ProgramDefinition;
}

export interface ProgramRecord {
  program_id: string;
  program: ProgramDefinition;
  created_at: string;
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
