import { ethers } from 'ethers';
import { logger } from '../utils/logger';
import { wallet } from './blockchain';

// Minimal ABI — only the functions the verifier node calls
const MODEL_REGISTRY_ABI = [
  'function getTopModelsByDomain(string domain, uint256 k) view returns (bytes32[])',
  'function getListing(bytes32 modelHash) view returns (tuple(string name, bytes32 modelHash, string provider, string version, string[] domainTags, uint16 feeBps, uint256 listingStake, address operator, uint64 reputationScore, uint32 totalJobs, uint32 accurateJobs, uint64 listedAt, bool active))',
  'function isListed(bytes32 modelHash) view returns (bool)',
  'function reputationOf(bytes32 modelHash) view returns (uint64)',
  'function totalModels() view returns (uint256)',
];

const MODEL_REPUTATION_ORACLE_ABI = [
  'function recordJobOutcome(bytes32 jobId, bytes32 modelHash, uint64 scoreBps, bool accurate) external',
  'function recordBatchOutcomes(bytes32 jobId, bytes32[] modelHashes, uint64[] scores, bool[] accurate) external',
];

export interface OnChainModelListing {
  name: string;
  modelHash: string;
  provider: string;
  version: string;
  domainTags: string[];
  feeBps: number;
  reputationScore: number; // 0-10000 bps
  totalJobs: number;
  active: boolean;
}

let registryContract: ethers.Contract | null = null;
let oracleContract: ethers.Contract | null = null;

function getRegistryContract(): ethers.Contract {
  if (registryContract) return registryContract;
  const addr = process.env.MODEL_REGISTRY_ADDRESS;
  if (!addr) throw new Error('MODEL_REGISTRY_ADDRESS not configured');
  registryContract = new ethers.Contract(addr, MODEL_REGISTRY_ABI, wallet);
  return registryContract;
}

function getOracleContract(): ethers.Contract {
  if (oracleContract) return oracleContract;
  const addr = process.env.MODEL_REPUTATION_ORACLE_ADDRESS;
  if (!addr) throw new Error('MODEL_REPUTATION_ORACLE_ADDRESS not configured');
  oracleContract = new ethers.Contract(addr, MODEL_REPUTATION_ORACLE_ABI, wallet);
  return oracleContract;
}

/**
 * Compute the on-chain modelHash for a given provider + name + version,
 * matching the encoding used in ModelRegistry.listModel().
 */
export function computeModelHash(provider: string, name: string, version: string): string {
  return ethers.keccak256(
    ethers.toUtf8Bytes(`${provider}:${name}:${version}`)
  );
}

/**
 * Return the top-k model hashes for a domain, sorted by on-chain reputation.
 * Falls back to an empty array (not an error) when the registry isn't configured
 * so the verifier node can operate without the registry during dev.
 */
export async function getTopModelsForDomain(
  domain: string,
  k = 5
): Promise<string[]> {
  if (!process.env.MODEL_REGISTRY_ADDRESS) return [];
  try {
    const registry = getRegistryContract();
    const hashes: string[] = await registry.getTopModelsByDomain(domain, k);
    return hashes;
  } catch (err: any) {
    logger.warn('ModelRegistry.getTopModelsByDomain failed', { domain, error: err.message });
    return [];
  }
}

/**
 * Fetch the full listing for a model hash.
 */
export async function getModelListing(
  modelHash: string
): Promise<OnChainModelListing | null> {
  if (!process.env.MODEL_REGISTRY_ADDRESS) return null;
  try {
    const registry = getRegistryContract();
    const raw = await registry.getListing(modelHash);
    if (!raw.active) return null;
    return {
      name:            raw.name,
      modelHash:       raw.modelHash,
      provider:        raw.provider,
      version:         raw.version,
      domainTags:      raw.domainTags,
      feeBps:          Number(raw.feeBps),
      reputationScore: Number(raw.reputationScore),
      totalJobs:       Number(raw.totalJobs),
      active:          raw.active,
    };
  } catch (err: any) {
    logger.warn('ModelRegistry.getListing failed', { modelHash, error: err.message });
    return null;
  }
}

/**
 * Return the on-chain reputation score (0-10000 bps) for a model.
 * Returns null when the registry is unconfigured or the model is not listed.
 */
export async function getOnChainReputation(
  provider: string,
  name: string,
  version = 'latest'
): Promise<number | null> {
  if (!process.env.MODEL_REGISTRY_ADDRESS) return null;
  try {
    const registry = getRegistryContract();
    const hash = computeModelHash(provider, name, version);
    const listed: boolean = await registry.isListed(hash);
    if (!listed) return null;
    const score: bigint = await registry.reputationOf(hash);
    return Number(score);
  } catch (err: any) {
    logger.warn('ModelRegistry.reputationOf failed', { provider, name, error: err.message });
    return null;
  }
}

export interface ModelOutcome {
  provider: string;
  model: string;      // name passed to queryModel()
  version?: string;
  scoreBps: number;   // 0-10000
  accurate: boolean;  // was this model within consensus (not an outlier)?
}

/**
 * Push per-model outcomes to the on-chain oracle as a single batch transaction.
 * Non-fatal: logs and returns false on failure so the job result isn't lost.
 */
export async function reportOutcomesToChain(
  jobId: string,
  outcomes: ModelOutcome[]
): Promise<boolean> {
  if (!process.env.MODEL_REPUTATION_ORACLE_ADDRESS) return false;
  if (outcomes.length === 0) return true;

  try {
    const oracle = getOracleContract();

    const jobIdBytes32 = ethers.keccak256(ethers.toUtf8Bytes(jobId));
    const modelHashes = outcomes.map((o) =>
      computeModelHash(o.provider, o.model, o.version ?? 'latest')
    );
    const scores  = outcomes.map((o) => o.scoreBps);
    const accurate = outcomes.map((o) => o.accurate);

    const tx = await oracle.recordBatchOutcomes(jobIdBytes32, modelHashes, scores, accurate);
    await tx.wait();

    logger.info('Outcomes reported to oracle', {
      jobId,
      models: outcomes.length,
      txHash: tx.hash,
    });
    return true;
  } catch (err: any) {
    logger.warn('Failed to report outcomes to oracle', { jobId, error: err.message });
    return false;
  }
}
