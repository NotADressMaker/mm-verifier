/**
 * On-Chain Verification Helpers
 *
 * Utilities for verifying that verification receipts match on-chain records.
 * Uses existing VerificationMarketplace events (Revealed, Finalized).
 */

import { VerificationReceipt, computeReceiptHash } from './receipt';
import { hashCanonical } from './canonicalJson';

// ============================================================================
// Event Data Types
// ============================================================================

/**
 * Data from VerificationMarketplace.Revealed event
 */
export interface RevealedEvent {
  taskId: string;
  evaluator: string;
  scoreBps: number;
  bundleHash: string;
  bundleUri: string;
  blockNumber: number;
  txHash: string;
  timestamp?: number;
}

/**
 * Data from VerificationMarketplace.Finalized event
 */
export interface FinalizedEvent {
  taskId: string;
  finalScoreBps: number;
  feePool?: string;
  blockNumber: number;
  txHash: string;
  timestamp: number;
}

// ============================================================================
// Verification Result
// ============================================================================

export interface OnChainVerificationResult {
  verified: boolean;
  receipt_hash: string;
  task_id: string;
  checks: {
    finalized_event_exists: boolean;
    score_matches: boolean;
    bundle_hash_matches: boolean;
    timestamp_valid: boolean;
  };
  chain_data?: {
    block_number: number;
    tx_hash: string;
    finalized_at: number;
  };
  errors: string[];
}

// ============================================================================
// Verification Functions
// ============================================================================

/**
 * Verify a receipt against on-chain event data
 *
 * @param receipt - The verification receipt to verify
 * @param finalizedEvent - The Finalized event from chain
 * @param revealedEvent - The Revealed event from chain (optional, for bundle hash check)
 * @returns Verification result with detailed checks
 */
export function verifyReceiptAgainstEvents(
  receipt: VerificationReceipt,
  finalizedEvent: FinalizedEvent,
  revealedEvent?: RevealedEvent
): OnChainVerificationResult {
  const errors: string[] = [];
  const receiptHash = computeReceiptHash(receipt);

  // Check 1: Task ID matches
  if (receipt.task_id !== finalizedEvent.taskId) {
    errors.push(
      `Task ID mismatch: receipt=${receipt.task_id}, chain=${finalizedEvent.taskId}`
    );
  }

  // Check 2: Score matches
  const scoreMatches = receipt.score_bps === finalizedEvent.finalScoreBps;
  if (!scoreMatches) {
    errors.push(
      `Score mismatch: receipt=${receipt.score_bps}, chain=${finalizedEvent.finalScoreBps}`
    );
  }

  // Check 3: Bundle hash matches (if revealed event provided)
  let bundleHashMatches = true;
  if (revealedEvent) {
    const receiptBundleHash = receipt.evidence.bundle_hash.toLowerCase();
    const chainBundleHash = revealedEvent.bundleHash.toLowerCase();
    bundleHashMatches = receiptBundleHash === chainBundleHash;
    if (!bundleHashMatches) {
      errors.push(
        `Bundle hash mismatch: receipt=${receiptBundleHash}, chain=${chainBundleHash}`
      );
    }
  }

  // Check 4: Timestamp is valid (receipt generated before or at finalization)
  const timestampValid =
    receipt.generated_at <= finalizedEvent.timestamp + 60; // 60s tolerance
  if (!timestampValid) {
    errors.push(
      `Timestamp invalid: receipt generated after finalization`
    );
  }

  const verified =
    errors.length === 0 &&
    scoreMatches &&
    bundleHashMatches &&
    timestampValid;

  return {
    verified,
    receipt_hash: receiptHash,
    task_id: receipt.task_id,
    checks: {
      finalized_event_exists: true,
      score_matches: scoreMatches,
      bundle_hash_matches: bundleHashMatches,
      timestamp_valid: timestampValid,
    },
    chain_data: {
      block_number: finalizedEvent.blockNumber,
      tx_hash: finalizedEvent.txHash,
      finalized_at: finalizedEvent.timestamp,
    },
    errors,
  };
}

/**
 * Verify that a receipt hash can be derived from on-chain data
 * This is useful when you only have the receipt hash and want to verify it
 *
 * @param expectedHash - The expected receipt hash (from on-chain or client)
 * @param receipt - The receipt to verify
 */
export function verifyReceiptHashMatches(
  expectedHash: string,
  receipt: VerificationReceipt
): boolean {
  const computedHash = computeReceiptHash(receipt);
  return computedHash.toLowerCase() === expectedHash.toLowerCase();
}

// ============================================================================
// Evidence Bundle Verification
// ============================================================================

/**
 * Verify that evidence bundle content matches its hash
 *
 * @param bundleContent - The raw evidence bundle (JSON object or string)
 * @param expectedHash - The expected keccak256 hash
 */
export function verifyBundleHash(
  bundleContent: unknown,
  expectedHash: string
): boolean {
  const computedHash = hashCanonical(bundleContent);
  return computedHash.toLowerCase() === expectedHash.toLowerCase();
}

// ============================================================================
// Input/Output Hash Verification
// ============================================================================

/**
 * Verify input hash matches content
 */
export function verifyInputHash(
  inputContent: unknown,
  expectedHash: string
): boolean {
  const computedHash = hashCanonical(inputContent);
  return computedHash.toLowerCase() === expectedHash.toLowerCase();
}

/**
 * Verify output hash matches content
 */
export function verifyOutputHash(
  outputContent: unknown,
  expectedHash: string
): boolean {
  const computedHash = hashCanonical(outputContent);
  return computedHash.toLowerCase() === expectedHash.toLowerCase();
}

// ============================================================================
// Chain Context Builder
// ============================================================================

/**
 * Build chain context from finalized event for attaching to receipt
 */
export function buildChainContext(
  finalizedEvent: FinalizedEvent,
  chainId: number,
  contractAddress: string
): NonNullable<VerificationReceipt['chain_context']> {
  return {
    chain_id: chainId,
    contract_address: contractAddress as `0x${string}`,
    finalized_at: finalizedEvent.timestamp,
    block_number: finalizedEvent.blockNumber,
    tx_hash: finalizedEvent.txHash as `0x${string}`,
  };
}

// ============================================================================
// Full Verification Flow
// ============================================================================

export interface FullVerificationParams {
  receipt: VerificationReceipt;
  finalizedEvent: FinalizedEvent;
  revealedEvent?: RevealedEvent;
  bundleContent?: unknown;
  inputContent?: unknown;
  outputContent?: unknown;
}

export interface FullVerificationResult extends OnChainVerificationResult {
  bundle_verified?: boolean;
  input_verified?: boolean;
  output_verified?: boolean;
}

/**
 * Perform full verification of a receipt including content hashes
 */
export function performFullVerification(
  params: FullVerificationParams
): FullVerificationResult {
  const { receipt, finalizedEvent, revealedEvent, bundleContent, inputContent, outputContent } =
    params;

  // First verify against events
  const result = verifyReceiptAgainstEvents(
    receipt,
    finalizedEvent,
    revealedEvent
  ) as FullVerificationResult;

  // Verify bundle content if provided
  if (bundleContent !== undefined) {
    result.bundle_verified = verifyBundleHash(
      bundleContent,
      receipt.evidence.bundle_hash
    );
    if (!result.bundle_verified) {
      result.errors.push('Bundle content hash mismatch');
      result.verified = false;
    }
  }

  // Verify input content if provided
  if (inputContent !== undefined) {
    result.input_verified = verifyInputHash(inputContent, receipt.input_hash);
    if (!result.input_verified) {
      result.errors.push('Input content hash mismatch');
      result.verified = false;
    }
  }

  // Verify output content if provided
  if (outputContent !== undefined) {
    result.output_verified = verifyOutputHash(outputContent, receipt.output_hash);
    if (!result.output_verified) {
      result.errors.push('Output content hash mismatch');
      result.verified = false;
    }
  }

  return result;
}
