import { ethers, Wallet } from 'ethers';
import { logger } from '../utils/logger';
import { getRpcUrl } from '../../../shared/env';
import {
  VerifiedOutputRecord,
  buildVerifiedOutputRecord,
  toEip712Message,
  getVerifiedOutputEip712Domain,
  VERIFIED_OUTPUT_EIP712_TYPES,
  validateVerifiedOutputRecord,
  calculateBuilderReward,
  BuilderRewardsConfig,
  DEFAULT_BUILDER_REWARDS_CONFIG,
} from '../../../shared/verifiedOutput';
import { EvidenceBundleV02 } from '../../../shared/types';
import { hashCanonical } from '../../../shared/canonicalJson';

// ============================================================================
// Types
// ============================================================================

export interface VerifiedOutputServiceConfig {
  /** RPC URL for blockchain connection */
  rpcUrl?: string;

  /** Private key for signing records */
  privateKey?: string;

  /** VerifiedOutputRegistry contract address */
  registryAddress?: string;

  /** Chain ID */
  chainId?: number;

  /** Builder rewards configuration */
  rewardsConfig?: BuilderRewardsConfig;

  /** Enable on-chain submission (if false, only builds records) */
  enableOnChainSubmission?: boolean;
}

export interface SubmitVerifiedOutputResult {
  /** The built VerifiedOutputRecord */
  record: VerifiedOutputRecord;

  /** EIP-712 signature */
  signature?: string;

  /** Transaction hash if submitted on-chain */
  txHash?: string;

  /** Record ID returned from contract */
  recordId?: string;

  /** Calculated builder reward (if rewards enabled) */
  reward?: {
    amount: string;
    qualityBonus: boolean;
  };
}

// ============================================================================
// Registry ABI (minimal for our needs)
// ============================================================================

const VERIFIED_OUTPUT_REGISTRY_ABI = [
  'function registerOutput(bytes32 taskId, bytes32 programId, bytes32 inputHash, bytes32 outputHash, uint16 scoreBps, bool verdict, bytes32 bundleHash, string bundleUri, bytes signature) external returns (bytes32 recordId)',
  'function isVerifier(address verifier) external view returns (bool)',
  'function rewardsEnabled() external view returns (bool)',
  'function getRewardConfig() external view returns (uint256 baseReward, uint256 qualityMultiplierBps, uint256 minScoreBps)',
  'event OutputRecorded(bytes32 indexed recordId, bytes32 indexed taskId, bytes32 indexed programId, address submitter, uint16 scoreBps, bool verdict, bytes32 bundleHash, string bundleUri)',
];

// ============================================================================
// Service State
// ============================================================================

let serviceConfig: VerifiedOutputServiceConfig = {};
let provider: ethers.JsonRpcProvider | null = null;
let wallet: Wallet | null = null;
let registryContract: ethers.Contract | null = null;
let initialized = false;

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the VerifiedOutput service
 */
export async function initializeVerifiedOutputService(
  config: VerifiedOutputServiceConfig = {}
): Promise<void> {
  try {
    serviceConfig = {
      rpcUrl: config.rpcUrl || getRpcUrl(),
      privateKey: config.privateKey || process.env.VERIFIER_PRIVATE_KEY,
      registryAddress: config.registryAddress || process.env.VERIFIED_OUTPUT_REGISTRY_ADDRESS,
      chainId: config.chainId || parseInt(process.env.CHAIN_ID || '421614', 10), // Arbitrum Sepolia default
      rewardsConfig: config.rewardsConfig || DEFAULT_BUILDER_REWARDS_CONFIG,
      enableOnChainSubmission: config.enableOnChainSubmission ?? true,
    };

    if (!serviceConfig.rpcUrl) {
      logger.warn('VerifiedOutputService: No RPC URL configured, on-chain features disabled');
      initialized = true;
      return;
    }

    provider = new ethers.JsonRpcProvider(serviceConfig.rpcUrl);

    if (serviceConfig.privateKey) {
      wallet = new Wallet(serviceConfig.privateKey, provider);
      logger.info('VerifiedOutputService: Wallet configured', {
        address: wallet.address,
      });
    }

    if (serviceConfig.registryAddress && wallet) {
      registryContract = new ethers.Contract(
        serviceConfig.registryAddress,
        VERIFIED_OUTPUT_REGISTRY_ABI,
        wallet
      );
      logger.info('VerifiedOutputService: Registry contract loaded', {
        address: serviceConfig.registryAddress,
      });

      // Check if we're an authorized verifier
      try {
        const isVerifier = await registryContract.isVerifier(wallet.address);
        if (!isVerifier) {
          logger.warn('VerifiedOutputService: Wallet is not an authorized verifier', {
            address: wallet.address,
          });
        }
      } catch (err) {
        logger.warn('VerifiedOutputService: Could not check verifier status');
      }
    }

    initialized = true;
    logger.info('VerifiedOutputService initialized successfully');
  } catch (error) {
    logger.error('VerifiedOutputService: Initialization failed', error);
    throw error;
  }
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Build a VerifiedOutputRecord from a finalized evidence bundle
 */
export function buildRecordFromBundle(
  bundle: EvidenceBundleV02,
  params: {
    programId: string;
    programVersion: string;
    bundleUri: string;
    tags?: string[];
  }
): VerifiedOutputRecord {
  if (!initialized) {
    throw new Error('VerifiedOutputService not initialized');
  }

  const record = buildVerifiedOutputRecord({
    bundle,
    program_id: params.programId,
    program_version: params.programVersion,
    bundle_uri: params.bundleUri,
    chain_id: serviceConfig.chainId!,
    contract_address: (serviceConfig.registryAddress || '0x0000000000000000000000000000000000000000') as `0x${string}`,
    tags: params.tags,
  });

  // Validate the record
  const validation = validateVerifiedOutputRecord(record);
  if (!validation.valid) {
    logger.error('VerifiedOutputService: Invalid record', { errors: validation.errors });
    throw new Error(`Invalid VerifiedOutputRecord: ${validation.errors.join(', ')}`);
  }

  return record;
}

/**
 * Sign a VerifiedOutputRecord with EIP-712
 */
export async function signRecord(record: VerifiedOutputRecord): Promise<string> {
  if (!wallet) {
    throw new Error('VerifiedOutputService: Wallet not configured');
  }

  const message = toEip712Message(record);
  const domain = getVerifiedOutputEip712Domain(
    record.chain_id,
    record.contract_address
  );

  const signature = await wallet.signTypedData(
    domain,
    VERIFIED_OUTPUT_EIP712_TYPES,
    message
  );

  logger.debug('VerifiedOutputService: Record signed', {
    taskId: record.task_id,
    signer: wallet.address,
  });

  return signature;
}

/**
 * Submit a VerifiedOutputRecord to the on-chain registry
 */
export async function submitToRegistry(
  record: VerifiedOutputRecord,
  signature: string
): Promise<{ txHash: string; recordId: string }> {
  if (!registryContract || !wallet) {
    throw new Error('VerifiedOutputService: Registry or wallet not configured');
  }

  if (!serviceConfig.enableOnChainSubmission) {
    throw new Error('VerifiedOutputService: On-chain submission disabled');
  }

  logger.info('VerifiedOutputService: Submitting to registry', {
    taskId: record.task_id,
    programId: record.program_id,
  });

  // Convert record fields to contract format
  const taskIdBytes32 = normalizeToBytes32(record.task_id);
  const programIdBytes32 = ethers.keccak256(ethers.toUtf8Bytes(record.program_id));

  try {
    const tx = await registryContract.registerOutput(
      taskIdBytes32,
      programIdBytes32,
      record.input_hash,
      record.output_hash,
      record.score_bps,
      record.verdict,
      record.bundle_hash,
      record.bundle_uri,
      signature
    );

    const receipt = await tx.wait();

    // Extract recordId from event
    let recordId = '';
    for (const log of receipt.logs) {
      try {
        const parsed = registryContract.interface.parseLog({
          topics: log.topics,
          data: log.data,
        });
        if (parsed && parsed.name === 'OutputRecorded') {
          recordId = parsed.args.recordId;
          break;
        }
      } catch {
        // Not our event
      }
    }

    logger.info('VerifiedOutputService: Record submitted successfully', {
      txHash: receipt.hash,
      recordId,
      taskId: record.task_id,
    });

    return { txHash: receipt.hash, recordId };
  } catch (error: any) {
    logger.error('VerifiedOutputService: Submission failed', error);
    throw error;
  }
}

/**
 * Build, sign, and optionally submit a VerifiedOutputRecord
 * Main entry point for verified output handling
 */
export async function processVerifiedOutput(
  bundle: EvidenceBundleV02,
  params: {
    programId: string;
    programVersion: string;
    bundleUri: string;
    tags?: string[];
    submitOnChain?: boolean;
  }
): Promise<SubmitVerifiedOutputResult> {
  // Build the record
  const record = buildRecordFromBundle(bundle, {
    programId: params.programId,
    programVersion: params.programVersion,
    bundleUri: params.bundleUri,
    tags: params.tags,
  });

  const result: SubmitVerifiedOutputResult = { record };

  // Calculate reward if enabled
  if (serviceConfig.rewardsConfig?.enabled) {
    const rewardCalc = calculateBuilderReward(record, serviceConfig.rewardsConfig);
    result.reward = {
      amount: rewardCalc.reward,
      qualityBonus: rewardCalc.qualityBonus,
    };
  }

  // Sign the record if wallet is available
  if (wallet) {
    result.signature = await signRecord(record);
  }

  // Submit on-chain if requested and enabled
  const shouldSubmit = params.submitOnChain !== false &&
    serviceConfig.enableOnChainSubmission &&
    registryContract &&
    result.signature;

  if (shouldSubmit) {
    const { txHash, recordId } = await submitToRegistry(record, result.signature!);
    result.txHash = txHash;
    result.recordId = recordId;
  }

  return result;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Normalize a value to bytes32 hex string
 */
function normalizeToBytes32(value: string): string {
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
    return ethers.keccak256(ethers.toUtf8Bytes(value));
  }
}

/**
 * Get current service configuration
 */
export function getServiceConfig(): VerifiedOutputServiceConfig {
  return { ...serviceConfig };
}

/**
 * Check if service is ready for on-chain operations
 */
export function isOnChainReady(): boolean {
  return !!(initialized && wallet && registryContract && serviceConfig.enableOnChainSubmission);
}

/**
 * Get connected wallet address
 */
export function getWalletAddress(): string | null {
  return wallet?.address || null;
}

/**
 * Fetch on-chain reward configuration
 */
export async function fetchOnChainRewardConfig(): Promise<{
  enabled: boolean;
  baseReward: string;
  qualityMultiplierBps: number;
  minScoreBps: number;
} | null> {
  if (!registryContract) {
    return null;
  }

  try {
    const enabled = await registryContract.rewardsEnabled();
    const [baseReward, qualityMultiplierBps, minScoreBps] = await registryContract.getRewardConfig();

    return {
      enabled,
      baseReward: baseReward.toString(),
      qualityMultiplierBps: Number(qualityMultiplierBps),
      minScoreBps: Number(minScoreBps),
    };
  } catch (error) {
    logger.warn('VerifiedOutputService: Could not fetch reward config', error);
    return null;
  }
}

// ============================================================================
// Exports
// ============================================================================

export {
  VerifiedOutputRecord,
  buildVerifiedOutputRecord,
  validateVerifiedOutputRecord,
  calculateBuilderReward,
} from '../../../shared/verifiedOutput';
