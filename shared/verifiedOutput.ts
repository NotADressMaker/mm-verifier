/**
 * VerifiedOutputRecord - The canonical "blockchain contribution" primitive
 *
 * This record represents a single unit of trustworthy AI output that becomes
 * part of the chain's public history. It captures the complete provenance
 * of a verification including the program, input/output hashes, scoring,
 * and on-chain references.
 *
 * @version 1.0
 */

import { hashCanonical, hashUtf8 } from './canonicalJson';
import {
  EvidenceBundleV02,
  ScoringTrace,
  EvidenceProvenance,
  CONSTANTS,
} from './types';

// ============================================================================
// VerifiedOutputRecord Type Definition
// ============================================================================

/**
 * The canonical VerifiedOutputRecord - unit of trustworthy AI output
 * recorded on-chain for public queryability and provenance tracking.
 */
export interface VerifiedOutputRecord {
  /** Record schema version */
  record_version: '1';

  /** Task identifier (uint256-safe string, never JS number) */
  task_id: string;

  /** Program/workflow identifier */
  program_id: string;

  /** Program version string (semver) */
  program_version: string;

  /** keccak256 hash of the input content */
  input_hash: `0x${string}`;

  /** keccak256 hash of the output content */
  output_hash: `0x${string}`;

  /** Final verification score in basis points (0-10000) */
  score_bps: number;

  /** Verification verdict (true = passed, false = failed) */
  verdict: boolean;

  /** keccak256 hash of the evidence bundle */
  bundle_hash: `0x${string}`;

  /** URI to the evidence bundle (IPFS/Arweave) */
  bundle_uri: string;

  /** Chain ID where verification was recorded */
  chain_id: number;

  /** Contract address of the registry */
  contract_address: `0x${string}`;

  /** Timestamp when verification was finalized (seconds since epoch) */
  finalized_at: number;

  /** Optional domain/category tags */
  tags?: string[];

  /** Optional source reference URIs */
  source_refs?: string[];

  /** Optional model run hashes for traceability */
  model_run_refs?: `0x${string}`[];
}

// ============================================================================
// VerifiedOutputRecord Builder
// ============================================================================

export interface BuildVerifiedOutputRecordParams {
  /** Evidence bundle v0.2 with full provenance */
  bundle: EvidenceBundleV02;

  /** Program identifier */
  program_id: string;

  /** Program version */
  program_version: string;

  /** Bundle URI (IPFS/Arweave) */
  bundle_uri: string;

  /** Chain ID */
  chain_id: number;

  /** Registry contract address */
  contract_address: `0x${string}`;

  /** Finalization timestamp (defaults to current time) */
  finalized_at?: number;

  /** Optional tags */
  tags?: string[];

  /** Optional source references */
  source_refs?: string[];
}

/**
 * Build a VerifiedOutputRecord from an EvidenceBundleV02
 * Reuses existing canonicalization and hashing logic.
 */
export function buildVerifiedOutputRecord(
  params: BuildVerifiedOutputRecordParams
): VerifiedOutputRecord {
  const { bundle, program_id, program_version, bundle_uri, chain_id, contract_address } = params;

  // Compute bundle hash using canonical JSON + keccak256
  // This reuses the same hashing approach as evidenceBundlerV2.ts
  const { signatures, ...bundleWithoutSig } = bundle;
  const bundleHash = hashCanonical(bundleWithoutSig) as `0x${string}`;

  // Extract model run hashes from provenance
  const modelRunRefs = bundle.provenance.model_runs.map(
    (run) => run.response_hash
  );

  // Extract source URIs from provenance
  const sourceRefs = bundle.provenance.sources?.map((src) => src.uri);

  // Determine verdict from score
  const verdict = bundle.final_score_bps >= CONSTANTS.MIXED_THRESHOLD;

  // Normalize task_id to string (uint256-safe)
  const taskId = typeof bundle.task_id === 'number'
    ? bundle.task_id.toString()
    : bundle.task_id;

  return {
    record_version: '1',
    task_id: taskId,
    program_id,
    program_version,
    input_hash: bundle.input.content_hash,
    output_hash: bundle.output.content_hash,
    score_bps: bundle.final_score_bps,
    verdict,
    bundle_hash: bundleHash,
    bundle_uri,
    chain_id,
    contract_address,
    finalized_at: params.finalized_at ?? Math.floor(Date.now() / 1000),
    tags: params.tags,
    source_refs: sourceRefs ?? params.source_refs,
    model_run_refs: modelRunRefs.length > 0 ? modelRunRefs : undefined,
  };
}

// ============================================================================
// Canonical Hashing
// ============================================================================

/**
 * Compute deterministic hash of VerifiedOutputRecord
 * Uses canonical JSON serialization for consistency
 */
export function hashVerifiedOutputRecord(record: VerifiedOutputRecord): `0x${string}` {
  return hashCanonical(record) as `0x${string}`;
}

/**
 * Compute on-chain record ID from key fields
 * Used for deduplication and indexing
 */
export function computeRecordId(
  taskId: string,
  programId: string,
  chainId: number
): `0x${string}` {
  return hashUtf8(`${taskId}:${programId}:${chainId}`) as `0x${string}`;
}

// ============================================================================
// EIP-712 Types for On-Chain Signing
// ============================================================================

export const VERIFIED_OUTPUT_EIP712_DOMAIN = {
  name: 'VerifiedOutputRegistry',
  version: '1',
};

export function getVerifiedOutputEip712Domain(
  chainId: number,
  verifyingContract: string
) {
  return {
    ...VERIFIED_OUTPUT_EIP712_DOMAIN,
    chainId,
    verifyingContract,
  };
}

/**
 * EIP-712 type definitions for on-chain verification
 */
export const VERIFIED_OUTPUT_EIP712_TYPES = {
  VerifiedOutput: [
    { name: 'taskId', type: 'bytes32' },
    { name: 'programId', type: 'bytes32' },
    { name: 'inputHash', type: 'bytes32' },
    { name: 'outputHash', type: 'bytes32' },
    { name: 'scoreBps', type: 'uint16' },
    { name: 'verdict', type: 'bool' },
    { name: 'bundleHash', type: 'bytes32' },
    { name: 'finalizedAt', type: 'uint64' },
  ],
};

/**
 * EIP-712 message structure for signing
 */
export interface VerifiedOutputEIP712Message {
  taskId: string;       // bytes32
  programId: string;    // bytes32 (hash of program_id string)
  inputHash: string;    // bytes32
  outputHash: string;   // bytes32
  scoreBps: number;     // uint16
  verdict: boolean;     // bool
  bundleHash: string;   // bytes32
  finalizedAt: number;  // uint64
}

/**
 * Convert VerifiedOutputRecord to EIP-712 message for signing
 */
export function toEip712Message(record: VerifiedOutputRecord): VerifiedOutputEIP712Message {
  return {
    taskId: normalizeBytes32(record.task_id),
    programId: hashUtf8(record.program_id),
    inputHash: record.input_hash,
    outputHash: record.output_hash,
    scoreBps: record.score_bps,
    verdict: record.verdict,
    bundleHash: record.bundle_hash,
    finalizedAt: record.finalized_at,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Normalize a value to bytes32 hex string
 */
function normalizeBytes32(value: string): string {
  if (value.startsWith('0x')) {
    // Already hex - pad to 32 bytes
    const hex = value.slice(2);
    return '0x' + hex.padStart(64, '0');
  }

  // Numeric string - convert to hex
  try {
    const bigVal = BigInt(value);
    return '0x' + bigVal.toString(16).padStart(64, '0');
  } catch {
    // Fallback to hashing the string
    return hashUtf8(value);
  }
}

/**
 * Validate a VerifiedOutputRecord structure
 */
export function validateVerifiedOutputRecord(
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

  if (!r.program_id || typeof r.program_id !== 'string') {
    errors.push('program_id must be a non-empty string');
  }

  if (!r.program_version || typeof r.program_version !== 'string') {
    errors.push('program_version must be a non-empty string');
  }

  if (!r.input_hash?.startsWith('0x') || r.input_hash.length !== 66) {
    errors.push('input_hash must be a 0x-prefixed 32-byte hex string');
  }

  if (!r.output_hash?.startsWith('0x') || r.output_hash.length !== 66) {
    errors.push('output_hash must be a 0x-prefixed 32-byte hex string');
  }

  if (typeof r.score_bps !== 'number' || r.score_bps < 0 || r.score_bps > 10000) {
    errors.push('score_bps must be a number between 0 and 10000');
  }

  if (typeof r.verdict !== 'boolean') {
    errors.push('verdict must be a boolean');
  }

  if (!r.bundle_hash?.startsWith('0x') || r.bundle_hash.length !== 66) {
    errors.push('bundle_hash must be a 0x-prefixed 32-byte hex string');
  }

  if (!r.bundle_uri || typeof r.bundle_uri !== 'string') {
    errors.push('bundle_uri must be a non-empty string');
  }

  if (typeof r.chain_id !== 'number' || r.chain_id <= 0) {
    errors.push('chain_id must be a positive number');
  }

  if (!r.contract_address?.startsWith('0x') || r.contract_address.length !== 42) {
    errors.push('contract_address must be a valid Ethereum address');
  }

  if (typeof r.finalized_at !== 'number' || r.finalized_at <= 0) {
    errors.push('finalized_at must be a positive timestamp');
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// Builder Rewards Configuration (MVP - behind feature flag)
// ============================================================================

export interface BuilderRewardsConfig {
  /** Feature flag to enable/disable rewards */
  enabled: boolean;

  /** Reward pool type: 'eth' for ETH-based, 'points' for off-chain points */
  rewardType: 'eth' | 'points';

  /** Base reward per verified output (in wei for ETH, raw value for points) */
  baseRewardPerOutput: string;

  /** Bonus multiplier for high-quality outputs (score >= 8000 bps) */
  qualityBonusMultiplier: number;

  /** Minimum score to receive any rewards (in bps) */
  minScoreForRewards: number;

  /** Maximum rewards per day per builder (rate limiting) */
  maxDailyRewardsPerBuilder: string;
}

export const DEFAULT_BUILDER_REWARDS_CONFIG: BuilderRewardsConfig = {
  enabled: false, // Disabled by default - opt-in feature
  rewardType: 'points',
  baseRewardPerOutput: '100', // 100 points per verified output
  qualityBonusMultiplier: 1.5, // 50% bonus for high quality
  minScoreForRewards: 5000, // Must pass minimum threshold
  maxDailyRewardsPerBuilder: '10000', // 10k points max per day
};

/**
 * Calculate builder reward for a verified output
 * Used by off-chain reward tracking or on-chain distribution
 */
export function calculateBuilderReward(
  record: VerifiedOutputRecord,
  config: BuilderRewardsConfig
): { reward: string; qualityBonus: boolean } {
  if (!config.enabled) {
    return { reward: '0', qualityBonus: false };
  }

  if (record.score_bps < config.minScoreForRewards) {
    return { reward: '0', qualityBonus: false };
  }

  const baseReward = BigInt(config.baseRewardPerOutput);
  const isHighQuality = record.score_bps >= CONSTANTS.RELIABLE_THRESHOLD;

  if (isHighQuality) {
    const bonusReward = (baseReward * BigInt(Math.floor(config.qualityBonusMultiplier * 100))) / 100n;
    return { reward: bonusReward.toString(), qualityBonus: true };
  }

  return { reward: baseReward.toString(), qualityBonus: false };
}

// ============================================================================
// Record Query Helpers
// ============================================================================

/**
 * Filter criteria for querying verified output records
 */
export interface VerifiedOutputQueryFilter {
  /** Filter by program ID */
  program_id?: string;

  /** Filter by minimum score */
  min_score_bps?: number;

  /** Filter by verdict (pass/fail) */
  verdict?: boolean;

  /** Filter by tag */
  tag?: string;

  /** Filter by chain ID */
  chain_id?: number;

  /** Filter by time range (start, inclusive) */
  finalized_after?: number;

  /** Filter by time range (end, inclusive) */
  finalized_before?: number;
}

/**
 * Check if a record matches the given filter criteria
 */
export function matchesFilter(
  record: VerifiedOutputRecord,
  filter: VerifiedOutputQueryFilter
): boolean {
  if (filter.program_id && record.program_id !== filter.program_id) {
    return false;
  }

  if (filter.min_score_bps !== undefined && record.score_bps < filter.min_score_bps) {
    return false;
  }

  if (filter.verdict !== undefined && record.verdict !== filter.verdict) {
    return false;
  }

  if (filter.tag && (!record.tags || !record.tags.includes(filter.tag))) {
    return false;
  }

  if (filter.chain_id !== undefined && record.chain_id !== filter.chain_id) {
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
