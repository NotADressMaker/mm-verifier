import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import { logger } from '../utils/logger';

dotenv.config({ path: '../../.env' });

// Simplified ABIs
const MARKETPLACE_ABI = [
  'function commitEvaluation(bytes32 jobId, bytes32 commitHash) external',
  'function revealEvaluation(bytes32 jobId, uint256 score, string verdict, bytes32 evidenceHash, bytes32 salt) external',
  'function getJob(bytes32 jobId) view returns (address, bytes32, string[], uint8, uint256, uint8, uint256)',
];

let provider: ethers.JsonRpcProvider;
let wallet: ethers.Wallet;
let marketplaceContract: ethers.Contract;

/**
 * Initialize blockchain connection
 */
export async function initializeBlockchain() {
  try {
    const rpcUrl = process.env.ARBITRUM_SEPOLIA_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
    provider = new ethers.JsonRpcProvider(rpcUrl);

    const privateKey = process.env.VERIFIER_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('VERIFIER_PRIVATE_KEY not configured');
    }

    wallet = new ethers.Wallet(privateKey, provider);

    const network = await provider.getNetwork();
    logger.info('Connected to blockchain', {
      chainId: network.chainId.toString(),
      verifierAddress: wallet.address,
    });

    const marketplaceAddress = process.env.MARKETPLACE_ADDRESS;
    if (marketplaceAddress) {
      marketplaceContract = new ethers.Contract(
        marketplaceAddress,
        MARKETPLACE_ABI,
        wallet
      );
      logger.info('Marketplace contract loaded', { address: marketplaceAddress });
    }
  } catch (error) {
    logger.error('Failed to initialize blockchain:', error);
    throw error;
  }
}

/**
 * Commit evaluation hash (commit phase)
 */
export async function commitEvaluation(
  jobId: string,
  commitHash: string
): Promise<void> {
  try {
    if (!marketplaceContract) {
      throw new Error('Marketplace contract not initialized');
    }

    logger.info('Committing evaluation', { jobId, commitHash });

    const tx = await marketplaceContract.commitEvaluation(jobId, commitHash);
    const receipt = await tx.wait();

    logger.info('Evaluation committed', { jobId, txHash: receipt.hash });
  } catch (error: any) {
    logger.error('Failed to commit evaluation:', error);
    throw error;
  }
}

/**
 * Reveal evaluation (reveal phase)
 */
export async function revealEvaluation(
  jobId: string,
  score: number,
  verdict: string,
  evidenceHash: string,
  salt: string
): Promise<void> {
  try {
    if (!marketplaceContract) {
      throw new Error('Marketplace contract not initialized');
    }

    logger.info('Revealing evaluation', { jobId, score, verdict });

    const tx = await marketplaceContract.revealEvaluation(
      jobId,
      score,
      verdict,
      evidenceHash,
      salt
    );
    const receipt = await tx.wait();

    logger.info('Evaluation revealed', { jobId, txHash: receipt.hash });
  } catch (error: any) {
    logger.error('Failed to reveal evaluation:', error);
    throw error;
  }
}

/**
 * Get job details
 */
export async function getJobDetails(jobId: string) {
  try {
    if (!marketplaceContract) {
      throw new Error('Marketplace contract not initialized');
    }

    const job = await marketplaceContract.getJob(jobId);

    return {
      requester: job[0],
      promptHash: job[1],
      models: job[2],
      taskType: job[3],
      rewardPool: job[4],
      status: job[5],
      consensusScore: job[6],
    };
  } catch (error: any) {
    logger.error('Failed to get job details:', error);
    throw error;
  }
}

/**
 * Generate commit hash
 */
export function generateCommitHash(
  jobId: string,
  verifierAddress: string,
  salt: string,
  score: number,
  verdict: string,
  evidenceHash: string
): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'address', 'bytes32', 'uint256', 'string', 'bytes32'],
      [jobId, verifierAddress, salt, score, verdict, evidenceHash]
    )
  );
}

/**
 * Generate random salt
 */
export function generateSalt(): string {
  return ethers.hexlify(ethers.randomBytes(32));
}

export { provider, wallet, marketplaceContract };
