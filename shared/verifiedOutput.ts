/**
 * VerifiedOutputRecord - A derived artifact representing trustworthy AI outputs
 *
 * This module provides types and helpers to derive queryable records from
 * existing on-chain events (VerificationMarketplace Revealed + Finalized)
 * and existing receipt structures (MMVReceipt).
 *
 * No new contracts are needed - records are derived from existing data.
 *
 * @version 1.0
 */

import { hashCanonical, hashUtf8 } from './canonicalJson';
import { CONSTANTS, MMVReceipt } from './types';

// ============================================================================
// Constants
// ============================================================================

/** Default minimum score (bps) to be considered "worthy" */
export const WORTHY_MIN_BPS = parseInt(process.env.WORTHY_MIN_BPS || '8000', 10);

/** Threshold constants for verdict derivation */
export const SCORE_THRESHOLDS = {
  /** Score >= this is "worthy" (high quality) */
  WORTHY: WORTHY_MIN_BPS,
  /** Score >= this passes (mixed or better) */
  PASS: CONSTANTS.MIXED_THRESHOLD,
  /** Score >= this is reliable */
  RELIABLE: CONSTANTS.RELIABLE_THRESHOLD,
};

// ============================================================================
// VerifiedOutputRecord Type Definition
// ============================================================================

/**
 * A derived record representing a verified AI output.
 * Built from existing on-chain events and receipt data.
 */
export interface VerifiedOutputRecord {
  /** Record schema version */
  record_version: '1';

  /** Task identifier (uint256-safe string) */
  task_id: string;

  /** Final verification score in basis points (0-10000) */
  score_bps: number;

  /** Verification verdict - derived from score threshold */
  verdict: boolean;

  /** Whether this record is "worthy" (score >= WORTHY_MIN_BPS) */
  worthy: boolean;

  /** keccak256 hash of the evidence bundle */
  bundle_hash: string;

  /** URI to the evidence bundle (IPFS/Arweave) */
  bundle_uri: string;

  /** Timestamp when verification was finalized (seconds since epoch) */
  finalized_at: number;

  /** Chain ID where verification was recorded */
  chain_id: number;

  /** VerificationMarketplace contract address */
  contract_address: string;

  /** keccak256 hash of the input content (from MMVReceipt if available) */
  input_hash?: string;

  /** keccak256 hash of the output content (from MMVReceipt if available) */
  output_hash?: string;

  /** Evaluator address who submitted this evaluation */
  evaluator?: string;

  /** Block number where Finalized event was emitted */
  block_number?: number;

  /** Transaction hash of the finalization */
  tx_hash?: string;
}

// ============================================================================
// On-Chain Event Types (derived from VerificationMarketplace)
// ============================================================================

/**
 * Revealed event data from VerificationMarketplace
 * Event: Revealed(uint256 indexed taskId, address indexed evaluator, uint16 scoreBps, bytes32 bundleHash, string bundleURI)
 */
export interface RevealedEventData {
  taskId: string;
  evaluator: string;
  scoreBps: number;
  bundleHash: string;
  bundleUri: string;
  blockNumber?: number;
  transactionHash?: string;
}

/**
 * Finalized event data from VerificationMarketplace
 * Event: Finalized(uint256 indexed taskId, uint16 finalScoreBps, uint256 feePool)
 */
export interface FinalizedEventData {
  taskId: string;
  finalScoreBps: number;
  feePool: string;
  blockNumber?: number;
  blockTimestamp?: number;
  transactionHash?: string;
}

/**
 * Combined task data from on-chain events
 */
export interface OnChainTaskData {
  taskId: string;
  finalScoreBps: number;
  bundleHash: string;
  bundleUri: string;
  evaluator?: string;
  finalizedAt: number;
  blockNumber?: number;
  txHash?: string;
}

// ============================================================================
// Record Builder Functions
// ============================================================================

export interface BuildRecordParams {
  /** Task data from on-chain events */
  taskData: OnChainTaskData;

  /** Chain ID */
  chainId: number;

  /** VerificationMarketplace contract address */
  contractAddress: string;

  /** Optional: MMVReceipt for additional provenance */
  receipt?: MMVReceipt;
}

/**
 * Build a VerifiedOutputRecord from on-chain task data
 */
export function buildRecordFromChainData(params: BuildRecordParams): VerifiedOutputRecord {
  const { taskData, chainId, contractAddress, receipt } = params;

  const scoreBps = taskData.finalScoreBps;
  const verdict = scoreBps >= SCORE_THRESHOLDS.PASS;
  const worthy = scoreBps >= SCORE_THRESHOLDS.WORTHY;

  return {
    record_version: '1',
    task_id: taskData.taskId,
    score_bps: scoreBps,
    verdict,
    worthy,
    bundle_hash: taskData.bundleHash,
    bundle_uri: taskData.bundleUri,
    finalized_at: taskData.finalizedAt,
    chain_id: chainId,
    contract_address: contractAddress,
    input_hash: receipt?.input_hash,
    output_hash: receipt?.selected_output_hash,
    evaluator: taskData.evaluator,
    block_number: taskData.blockNumber,
    tx_hash: taskData.txHash,
  };
}

/**
 * Build a VerifiedOutputRecord directly from an MMVReceipt
 * Used when receipt already contains all needed data
 */
export function buildRecordFromReceipt(
  receipt: MMVReceipt,
  chainContext: {
    chainId: number;
    contractAddress: string;
    bundleHash: string;
    bundleUri: string;
    finalizedAt?: number;
    blockNumber?: number;
    txHash?: string;
  }
): VerifiedOutputRecord {
  const scoreBps = receipt.decision.overall_score * 100; // Convert 0-100 to bps
  const verdict = receipt.decision.pass;
  const worthy = scoreBps >= SCORE_THRESHOLDS.WORTHY;

  return {
    record_version: '1',
    task_id: receipt.task_id,
    score_bps: scoreBps,
    verdict,
    worthy,
    bundle_hash: chainContext.bundleHash,
    bundle_uri: chainContext.bundleUri,
    finalized_at: chainContext.finalizedAt ?? Math.floor(Date.now() / 1000),
    chain_id: chainContext.chainId,
    contract_address: chainContext.contractAddress,
    input_hash: receipt.input_hash,
    output_hash: receipt.selected_output_hash,
    block_number: chainContext.blockNumber,
    tx_hash: chainContext.txHash,
  };
}

// ============================================================================
// Query Helpers
// ============================================================================

/**
 * Filter criteria for querying verified output records
 */
export interface RecordQueryFilter {
  /** Filter by minimum score (bps) */
  min_score_bps?: number;

  /** Only return "worthy" records (score >= WORTHY_MIN_BPS) */
  worthy_only?: boolean;

  /** Filter by verdict */
  verdict?: boolean;

  /** Filter by time range (start, inclusive) */
  finalized_after?: number;

  /** Filter by time range (end, inclusive) */
  finalized_before?: number;

  /** Pagination: number of records to return */
  limit?: number;

  /** Pagination: offset from start */
  offset?: number;
}

/**
 * Check if a record matches the given filter criteria
 */
export function matchesFilter(
  record: VerifiedOutputRecord,
  filter: RecordQueryFilter
): boolean {
  if (filter.min_score_bps !== undefined && record.score_bps < filter.min_score_bps) {
    return false;
  }

  if (filter.worthy_only && !record.worthy) {
    return false;
  }

  if (filter.verdict !== undefined && record.verdict !== filter.verdict) {
    return false;
  }

  if (filter.finalized_after !== undefined && record.finalized_at < filter.finalized_after) {
    return false;
  }

  if (filter.finalized_before !== undefined && record.finalized_at > filter.finalized_before) {
    return false;
  }

  return true;
}

/**
 * Apply pagination to a list of records
 */
export function paginateRecords(
  records: VerifiedOutputRecord[],
  limit: number = 50,
  offset: number = 0
): { records: VerifiedOutputRecord[]; total: number; has_more: boolean } {
  const total = records.length;
  const paginated = records.slice(offset, offset + limit);
  return {
    records: paginated,
    total,
    has_more: offset + limit < total,
  };
}

// ============================================================================
// Hashing Utilities (reuses existing canonicalJson)
// ============================================================================

/**
 * Compute deterministic hash of a VerifiedOutputRecord
 */
export function hashRecord(record: VerifiedOutputRecord): string {
  return hashCanonical(record);
}

/**
 * Normalize a task ID to bytes32 hex string
 */
export function normalizeTaskIdBytes32(taskId: string | number): string {
  const idStr = typeof taskId === 'number' ? taskId.toString() : taskId;

  if (idStr.startsWith('0x')) {
    const hex = idStr.slice(2);
    return '0x' + hex.padStart(64, '0');
  }

  try {
    const bigVal = BigInt(idStr);
    return '0x' + bigVal.toString(16).padStart(64, '0');
  } catch {
    return hashUtf8(idStr);
  }
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate a VerifiedOutputRecord structure
 */
export function validateRecord(
  record: unknown
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!record || typeof record !== 'object') {
    return { valid: false, errors: ['Record must be an object'] };
  }

  const r = record as Partial<VerifiedOutputRecord>;

  if (r.record_version !== '1') {
    errors.push(`Invalid record_version: ${r.record_version}, expected '1'`);
  }

  if (!r.task_id || typeof r.task_id !== 'string') {
    errors.push('task_id must be a non-empty string');
  }

  if (typeof r.score_bps !== 'number' || r.score_bps < 0 || r.score_bps > 10000) {
    errors.push('score_bps must be a number between 0 and 10000');
  }

  if (typeof r.verdict !== 'boolean') {
    errors.push('verdict must be a boolean');
  }

  if (typeof r.worthy !== 'boolean') {
    errors.push('worthy must be a boolean');
  }

  if (!r.bundle_hash || typeof r.bundle_hash !== 'string') {
    errors.push('bundle_hash must be a non-empty string');
  }

  if (!r.bundle_uri || typeof r.bundle_uri !== 'string') {
    errors.push('bundle_uri must be a non-empty string');
  }

  if (typeof r.chain_id !== 'number' || r.chain_id <= 0) {
    errors.push('chain_id must be a positive number');
  }

  if (!r.contract_address || typeof r.contract_address !== 'string') {
    errors.push('contract_address must be a non-empty string');
  }

  if (typeof r.finalized_at !== 'number' || r.finalized_at <= 0) {
    errors.push('finalized_at must be a positive timestamp');
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a value is a valid VerifiedOutputRecord
 */
export function isVerifiedOutputRecord(value: unknown): value is VerifiedOutputRecord {
  return validateRecord(value).valid;
}
