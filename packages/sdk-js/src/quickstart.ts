/**
 * MAMV SDK Quickstart API
 *
 * Provides simple, high-level functions for common verification tasks.
 * Use these functions for rapid integration - they handle all the setup.
 */

import { MAMVClient, MAMVClientOptions } from './client';
import { Receipt, VerifyOptions, OnchainVerifyResult, ProgramSummary } from './types';

// ============================================================================
// Configuration
// ============================================================================

export interface QuickstartConfig {
  /** Base URL of the MAMV API (default: http://localhost:3000) */
  baseUrl?: string;
  /** API key for authentication */
  apiKey?: string;
  /** Chain ID (default: 421614 for Arbitrum Sepolia) */
  chainId?: number;
  /** Contract address */
  contractAddress?: string;
}

// Default configuration
const DEFAULT_BASE_URL = 'http://localhost:3000';
const DEFAULT_CHAIN_ID = 421614; // Arbitrum Sepolia
const DEFAULT_CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000000';

// Global client instance (lazy initialized)
let globalClient: MAMVClient | null = null;
let globalConfig: QuickstartConfig = {};

// ============================================================================
// Factual Consensus Program (v1.0.0)
// ============================================================================

/**
 * Built-in verification program: Factual Consensus v1.0.0
 *
 * This program verifies factual claims by:
 * 1. Querying multiple LLMs with the same prompt
 * 2. Extracting claims from each response
 * 3. Cross-checking claims for consistency across models
 * 4. Scoring based on consensus level and confidence
 * 5. Packaging evidence with full audit trail
 *
 * Use this program for general factual Q&A verification.
 */
/** Receipt explanations are generated text; fluency is not confidence or evidence. */
export const RECEIPT_EXPLANATION_DISCLOSURE = 'Natural-language receipt explanations are generated text; fluency is not confidence or evidence.';

export const FACTUAL_CONSENSUS_PROGRAM: ProgramSummary = {
  id: 'factual-consensus',
  version: '1.0.0',
  description:
    'Multi-model consensus verification for factual claims. Queries multiple LLMs, extracts claims, cross-checks for consistency, and scores based on agreement.',
  hash: 'dd5cf58f1617af56192049a9fda1ca848ae00f5fa9df000d3ad2f0b3c6431f9c',
};

// ============================================================================
// Client Factory
// ============================================================================

/**
 * Create a configured MAMV client instance.
 *
 * @param config - Configuration options
 * @returns Configured MAMVClient
 */
export function createClient(config: QuickstartConfig = {}): MAMVClient {
  return new MAMVClient({
    baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
    apiKey: config.apiKey,
    chainId: config.chainId ?? DEFAULT_CHAIN_ID,
    contractAddress: config.contractAddress ?? DEFAULT_CONTRACT_ADDRESS,
  });
}

/**
 * Configure the global client used by verify() and verifyReceiptOnchain()
 */
export function configure(config: QuickstartConfig): void {
  globalConfig = config;
  globalClient = null; // Reset so next call creates fresh client
}

function getClient(): MAMVClient {
  if (!globalClient) {
    globalClient = createClient(globalConfig);
  }
  return globalClient;
}

// ============================================================================
// Quickstart Functions
// ============================================================================

/**
 * Verify LLM output and return a compact receipt.
 *
 * This is the simplest way to verify AI output. It handles all the complexity
 * of submitting a verification task, waiting for completion, and extracting
 * the receipt.
 *
 * @param text - The LLM output text to verify
 * @param options - Optional configuration
 * @returns A compact Receipt object
 *
 * @example
 * ```ts
 * import { verify, configure } from '@mamv/sdk';
 *
 * // Configure once at startup
 * configure({ baseUrl: 'http://localhost:3000', apiKey: 'your-key' });
 *
 * // Verify any LLM output
 * const receipt = await verify('Paris is the capital of France');
 *
 * if (receipt.verdict) {
 *   console.log(`Verified with ${receipt.score_bps / 100}% confidence`);
 * }
 * ```
 */
export async function verify(text: string, options: VerifyOptions = {}): Promise<Receipt> {
  const client = getClient();
  return client.verifyOutput(text, options);
}

/**
 * Verify a receipt against on-chain data or local mock.
 *
 * This function checks that:
 * 1. The receipt exists (has valid structure)
 * 2. The bundle hash matches expectations
 * 3. The chain ID matches the configured chain
 * 4. The contract address matches the configured contract
 *
 * In mock mode (when chain is unavailable), it performs local validation only.
 *
 * @param receipt - The receipt to verify
 * @param expectedChainId - Expected chain ID (default: from config)
 * @param expectedContract - Expected contract address (default: from config)
 * @returns Verification result with detailed checks
 *
 * @example
 * ```ts
 * const receipt = await verify('Paris is the capital of France');
 * const result = verifyReceiptOnchain(receipt);
 *
 * if (result.valid) {
 *   console.log('Receipt verified successfully');
 * } else {
 *   console.error('Verification failed:', result.errors);
 * }
 * ```
 */
export function verifyReceiptOnchain(
  receipt: Receipt,
  expectedChainId?: number,
  expectedContract?: string
): OnchainVerifyResult {
  const errors: string[] = [];
  const chainId = expectedChainId ?? globalConfig.chainId ?? DEFAULT_CHAIN_ID;
  const contract = expectedContract ?? globalConfig.contractAddress ?? DEFAULT_CONTRACT_ADDRESS;

  // Check 1: Receipt exists (has required fields)
  const receiptExists =
    typeof receipt.task_id === 'string' &&
    receipt.task_id.length > 0 &&
    typeof receipt.verdict === 'boolean' &&
    typeof receipt.score_bps === 'number' &&
    typeof receipt.bundle_hash === 'string';

  if (!receiptExists) {
    errors.push('Receipt is missing required fields');
  }

  // Check 2: Hash is valid format (0x-prefixed 64 hex chars)
  const hashMatches =
    typeof receipt.bundle_hash === 'string' &&
    /^0x[0-9a-fA-F]{64}$/.test(receipt.bundle_hash);

  if (!hashMatches && receiptExists) {
    errors.push(`Invalid bundle_hash format: ${receipt.bundle_hash}`);
  }

  // Check 3: Chain ID matches
  const chainMatches =
    typeof receipt.chain_id === 'number' && receipt.chain_id === chainId;
  if (!chainMatches) {
    errors.push(
      `Chain ID mismatch: expected ${chainId}, got ${receipt.chain_id}`
    );
  }

  // Check 4: Contract address matches
  const contractMatches =
    typeof receipt.contract_address === 'string' &&
    receipt.contract_address.toLowerCase() === contract.toLowerCase();
  if (!contractMatches) {
    errors.push(
      `Contract address mismatch: expected ${contract}, got ${receipt.contract_address}`
    );
  }

  const valid = receiptExists && hashMatches && chainMatches && contractMatches;

  return {
    valid,
    checks: {
      receipt_exists: receiptExists,
      hash_matches: hashMatches,
      chain_matches: chainMatches,
      contract_matches: contractMatches,
    },
    errors,
  };
}
