import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import { logger } from '../utils/logger';
import { computeCommitHash } from '../../../shared/commitHash';
import { getRpcUrl } from '../../../shared/env';
import { VerifierMarketplace } from '../../../shared/abi';

dotenv.config({ path: '../../.env' });

const MARKETPLACE_ABI = VerifierMarketplace.abi;

let provider: ethers.JsonRpcProvider;
let wallet: ethers.Wallet;
let marketplaceContract: ethers.Contract;

/**
 * Initialize blockchain connection
 */
export async function initializeBlockchain() {
  try {
    provider = new ethers.JsonRpcProvider(getRpcUrl());

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
  taskId: bigint | string,
  commitHash: string
): Promise<void> {
  try {
    if (!marketplaceContract) {
      throw new Error('Marketplace contract not initialized');
    }

    logger.info('Committing evaluation', { taskId: taskId.toString(), commitHash });

    const tx = await marketplaceContract.commitEvaluation(taskId, commitHash);
    const receipt = await tx.wait();

    logger.info('Evaluation committed', { taskId: taskId.toString(), txHash: receipt.hash });
  } catch (error: any) {
    logger.error('Failed to commit evaluation:', error);
    throw error;
  }
}

/**
 * Reveal evaluation (reveal phase)
 */
export async function revealEvaluation(
  taskId: bigint | string,
  scoreBps: number,
  bundleHash: string,
  bundleURI: string,
  salt: string
): Promise<void> {
  try {
    if (!marketplaceContract) {
      throw new Error('Marketplace contract not initialized');
    }

    logger.info('Revealing evaluation', { taskId: taskId.toString(), scoreBps });

    const tx = await marketplaceContract.revealEvaluation(
      taskId,
      scoreBps,
      bundleHash,
      bundleURI,
      salt
    );
    const receipt = await tx.wait();

    logger.info('Evaluation revealed', { taskId: taskId.toString(), txHash: receipt.hash });
  } catch (error: any) {
    logger.error('Failed to reveal evaluation:', error);
    throw error;
  }
}

/**
 * Get job details
 */
export async function getTaskDetails(taskId: bigint | string) {
  try {
    if (!marketplaceContract) {
      throw new Error('Marketplace contract not initialized');
    }

    const task = await marketplaceContract.getTaskMeta(taskId);

    return {
      state: task[0],
      requester: task[1],
      promptHash: task[2],
      rubricHash: task[3],
      commitDeadline: task[4],
      revealDeadline: task[5],
      disputeDeadline: task[6],
      minEvals: task[7],
      maxEvals: task[8],
      feePool: task[9],
      finalScoreBps: task[10],
      evalCount: task[11],
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
  taskId: bigint | string,
  verifierAddress: string,
  scoreBps: number,
  bundleHash: string,
  salt: string
): string {
  return computeCommitHash({
    taskId,
    verifier: verifierAddress,
    scoreBps,
    bundleHash,
    salt,
  });
}

/**
 * Generate random salt
 */
export function generateSalt(): string {
  return ethers.hexlify(ethers.randomBytes(32));
}

export { provider, wallet, marketplaceContract };
