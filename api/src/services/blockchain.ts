import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import path from 'path';
import { logger } from '../utils/logger';
import { formatTaskStatus } from '../utils/taskStatus';
import { getRpcUrl } from '../../../shared/env';
import { VerifierMarketplace, AuditorRegistry, StakingManager } from '../../../shared/abi';

dotenv.config({ path: path.resolve(__dirname, '../../../.env.runtime') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env'), override: false });

export const MARKETPLACE_ABI = VerifierMarketplace.abi;
const STAKING_ABI = StakingManager.abi;
const AUDITOR_REGISTRY_ABI = AuditorRegistry.abi;

let provider: ethers.JsonRpcProvider;
let wallet: ethers.Wallet;
let marketplaceContract: ethers.Contract;
let stakingContract: ethers.Contract;
let auditorRegistryContract: ethers.Contract;

/**
 * Initialize blockchain connection
 */
export async function initializeBlockchain() {
  try {
    provider = new ethers.JsonRpcProvider(getRpcUrl());

    // Test connection
    const network = await provider.getNetwork();
    logger.info('Connected to blockchain', {
      chainId: network.chainId.toString(),
      name: network.name,
    });

    const marketplaceAddress = process.env.MARKETPLACE_ADDRESS || '';
    const stakingAddress = process.env.STAKING_ADDRESS || '';
    const auditorRegistryAddress = process.env.AUDITOR_REGISTRY_ADDRESS || '';

    // Initialize wallet if private key is provided
    if (process.env.PRIVATE_KEY) {
      wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
      logger.info('Wallet initialized', { address: wallet.address });
    }

    const signerOrProvider = wallet ?? provider;

    if (marketplaceAddress) {
      marketplaceContract = new ethers.Contract(marketplaceAddress, MARKETPLACE_ABI, signerOrProvider);
      logger.info('Marketplace contract loaded', { address: marketplaceAddress });
    }

    if (stakingAddress) {
      stakingContract = new ethers.Contract(stakingAddress, STAKING_ABI, signerOrProvider);
      logger.info('Staking contract loaded', { address: stakingAddress });
    }

    if (auditorRegistryAddress) {
      auditorRegistryContract = new ethers.Contract(auditorRegistryAddress, AUDITOR_REGISTRY_ABI, signerOrProvider);
      logger.info('Auditor registry contract loaded', { address: auditorRegistryAddress });
    }
  } catch (error) {
    logger.error('Failed to initialize blockchain:', error);
    throw error;
  }
}

/**
 * Submit verification job to blockchain
 */
export async function submitVerificationJob(params: {
  promptHash: string;
  rubricHash: string;
  commitDeadline: number;
  revealDeadline: number;
  disputeWindowSeconds: number;
  minEvals: number;
  maxEvals: number;
  feePoolWei: bigint;
}): Promise<string> {
  try {
    if (!marketplaceContract) {
      throw new Error('Marketplace contract not initialized');
    }
    if (!wallet) {
      throw new Error('Wallet not initialized for write operations');
    }

    logger.info('Submitting job to blockchain', {
      promptHash: params.promptHash,
      rubricHash: params.rubricHash,
      commitDeadline: params.commitDeadline,
      revealDeadline: params.revealDeadline,
      disputeWindowSeconds: params.disputeWindowSeconds,
      minEvals: params.minEvals,
      maxEvals: params.maxEvals,
      feePool: params.feePoolWei.toString(),
    });

    const tx = await marketplaceContract.createTask(
      params.promptHash,
      params.rubricHash,
      params.commitDeadline,
      params.revealDeadline,
      params.disputeWindowSeconds,
      params.minEvals,
      params.maxEvals,
      params.feePoolWei
    );

    logger.info('Transaction sent', { hash: tx.hash });

    const receipt = await tx.wait();
    logger.info('Transaction confirmed', { hash: receipt.hash });

    // Extract taskId from event logs
    const event = receipt.logs.find((log: any) => {
      try {
        const parsed = marketplaceContract.interface.parseLog(log);
        return parsed?.name === 'TaskCreated';
      } catch {
        return false;
      }
    });

    if (event) {
      const parsed = marketplaceContract.interface.parseLog(event);
      const taskId = parsed?.args.taskId as bigint;
      logger.info('Task created successfully', { taskId: taskId.toString() });
      return taskId.toString();
    }

    throw new Error('Failed to extract taskId from transaction');
  } catch (error) {
    logger.error('Failed to submit job to blockchain:', error);
    throw error;
  }
}

/**
 * Get job details from blockchain
 */
export async function getTaskDetails(taskId: bigint | string) {
  try {
    if (!marketplaceContract) {
      throw new Error('Marketplace contract not initialized');
    }

    const task = await marketplaceContract.getTaskMeta(taskId);
    return {
      state: Number(task[0]),
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
  } catch (error) {
    logger.error('Failed to get job details:', error);
    throw error;
  }
}

/**
 * Get all verification jobs from blockchain
 */
export async function getAllJobs() {
  try {
    if (!marketplaceContract) {
      throw new Error('Marketplace contract not initialized');
    }

    const nextTaskId = await marketplaceContract.nextTaskId();
    const totalTasks = Math.max(0, Number(nextTaskId) - 1);

    if (totalTasks === 0) {
      return [];
    }

    const jobs = await Promise.all(
      Array.from({ length: totalTasks }, async (_value, index) => {
        const taskId = BigInt(index + 1);
        const task = await getTaskDetails(taskId);

        return {
          taskId: taskId.toString(),
          status: formatTaskStatus(task.state),
          state: task.state,
          requester: task.requester,
          promptHash: task.promptHash,
          rubricHash: task.rubricHash,
          commitDeadline: task.commitDeadline,
          revealDeadline: task.revealDeadline,
          disputeDeadline: task.disputeDeadline,
          minEvals: task.minEvals,
          maxEvals: task.maxEvals,
          rewardPool: task.feePool.toString(),
          consensusScore: Number(task.finalScoreBps),
          evalCount: Number(task.evalCount),
        };
      })
    );

    return jobs;
  } catch (error) {
    logger.error('Failed to get all jobs:', error);
    throw error;
  }
}

/**
 * Stake as verifier
 */
export async function stakeAsVerifier(amount: bigint) {
  try {
    if (!stakingContract) {
      throw new Error('Staking contract not initialized');
    }

    const tx = await stakingContract.stakeAsVerifier({ value: amount });
    const receipt = await tx.wait();

    logger.info('Staked as verifier', { amount: amount.toString(), hash: receipt.hash });
    return receipt;
  } catch (error) {
    logger.error('Failed to stake as verifier:', error);
    throw error;
  }
}

/**
 * Get stake info
 */
export async function getStakeInfo(address: string) {
  try {
    if (!stakingContract) {
      throw new Error('Staking contract not initialized');
    }

    const stake = await stakingContract.stakes(address);
    return {
      amount: stake.amount,
      lockedAmount: stake.lockedAmount,
      unbondingAmount: stake.unbondingAmount,
      unbondingTime: stake.unbondingTime,
      stakeType: stake.stakeType,
      active: stake.active,
    };
  } catch (error) {
    logger.error('Failed to get stake info:', error);
    throw error;
  }
}

export { provider, wallet };
