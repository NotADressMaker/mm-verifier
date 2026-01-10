import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import { logger } from '../utils/logger';

// TODO: Uncomment after compiling contracts and exporting ABIs
// import { VerifierMarketplace, BondVaultWETH, AuditorRegistry } from '../../../shared/abi';

dotenv.config({ path: '../../.env' });

// TEMPORARY: Human-readable ABIs (replace with imports from shared/abi/ after compilation)
// Once contracts are compiled, use: VerifierMarketplace.abi, BondVaultWETH.abi, etc.
const MARKETPLACE_ABI = [
  'function submitJob(bytes32 promptHash, string[] models, uint8 taskType, uint256 deadline) payable returns (bytes32)',
  'function getJob(bytes32 jobId) view returns (address requester, bytes32 promptHash, string[] models, uint8 taskType, uint256 rewardPool, uint8 status, uint256 consensusScore)',
  'function getJobVerifiers(bytes32 jobId) view returns (address[])',
  'function getEvaluation(bytes32 jobId, address verifier) view returns (uint256 score, string verdict, bytes32 evidenceHash, bool revealed)',
  'function getAllJobs() view returns (bytes32[])',
];

const STAKING_ABI = [
  'function stakeAsVerifier() payable',
  'function stakeAsAuditor() payable',
  'function getStake(address staker) view returns (tuple(uint256 amount, uint256 lockedAmount, uint256 unbondingAmount, uint256 unbondingTime, uint8 stakeType, bool active))',
];

const AUDITOR_REGISTRY_ABI = [
  'function registerAuditor()',
  'function getAuditor(address auditor) view returns (tuple(bool registered, uint256 reputation, uint256 totalVotes, uint256 correctVotes, uint256 totalEarnings, bool active))',
];

// NOTE: After compiling contracts and running `npm run export-abis` in contracts/,
// replace the hardcoded ABIs above with:
//   const MARKETPLACE_ABI = VerifierMarketplace.abi;
//   const STAKING_ABI = StakingManager.abi;
//   const AUDITOR_REGISTRY_ABI = AuditorRegistry.abi;

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
    const rpcUrl = process.env.ARBITRUM_SEPOLIA_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
    provider = new ethers.JsonRpcProvider(rpcUrl);

    // Test connection
    const network = await provider.getNetwork();
    logger.info('Connected to blockchain', {
      chainId: network.chainId.toString(),
      name: network.name,
    });

    // Initialize wallet if private key is provided
    if (process.env.PRIVATE_KEY) {
      wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
      logger.info('Wallet initialized', { address: wallet.address });

      // Load contract addresses from deployment
      const marketplaceAddress = process.env.MARKETPLACE_ADDRESS || '';
      const stakingAddress = process.env.STAKING_ADDRESS || '';
      const auditorRegistryAddress = process.env.AUDITOR_REGISTRY_ADDRESS || '';

      if (marketplaceAddress) {
        marketplaceContract = new ethers.Contract(marketplaceAddress, MARKETPLACE_ABI, wallet);
        logger.info('Marketplace contract loaded', { address: marketplaceAddress });
      }

      if (stakingAddress) {
        stakingContract = new ethers.Contract(stakingAddress, STAKING_ABI, wallet);
        logger.info('Staking contract loaded', { address: stakingAddress });
      }

      if (auditorRegistryAddress) {
        auditorRegistryContract = new ethers.Contract(auditorRegistryAddress, AUDITOR_REGISTRY_ABI, wallet);
        logger.info('Auditor registry contract loaded', { address: auditorRegistryAddress });
      }
    }
  } catch (error) {
    logger.error('Failed to initialize blockchain:', error);
    throw error;
  }
}

/**
 * Submit verification job to blockchain
 */
export async function submitVerificationJob(
  promptHash: string,
  models: string[],
  taskType: number,
  deadline: number,
  rewardPoolWei: bigint
): Promise<string> {
  try {
    if (!marketplaceContract) {
      throw new Error('Marketplace contract not initialized');
    }

    logger.info('Submitting job to blockchain', {
      promptHash,
      models,
      taskType,
      deadline,
      rewardPool: rewardPoolWei.toString(),
    });

    const tx = await marketplaceContract.submitJob(
      promptHash,
      models,
      taskType,
      deadline,
      { value: rewardPoolWei }
    );

    logger.info('Transaction sent', { hash: tx.hash });

    const receipt = await tx.wait();
    logger.info('Transaction confirmed', { hash: receipt.hash });

    // Extract jobId from event logs
    const event = receipt.logs.find((log: any) => {
      try {
        const parsed = marketplaceContract.interface.parseLog(log);
        return parsed?.name === 'JobSubmitted';
      } catch {
        return false;
      }
    });

    if (event) {
      const parsed = marketplaceContract.interface.parseLog(event);
      const jobId = parsed?.args.jobId;
      logger.info('Job submitted successfully', { jobId });
      return jobId;
    }

    throw new Error('Failed to extract jobId from transaction');
  } catch (error) {
    logger.error('Failed to submit job to blockchain:', error);
    throw error;
  }
}

/**
 * Get job details from blockchain
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
  } catch (error) {
    logger.error('Failed to get job details:', error);
    throw error;
  }
}

/**
 * Get job evaluations from blockchain
 */
export async function getJobEvaluations(jobId: string) {
  try {
    if (!marketplaceContract) {
      throw new Error('Marketplace contract not initialized');
    }

    const verifiers = await marketplaceContract.getJobVerifiers(jobId);
    const evaluations = [];

    for (const verifier of verifiers) {
      const evaluation = await marketplaceContract.getEvaluation(jobId, verifier);
      evaluations.push({
        verifier,
        score: evaluation[0],
        verdict: evaluation[1],
        evidenceHash: evaluation[2],
        revealed: evaluation[3],
      });
    }

    return evaluations;
  } catch (error) {
    logger.error('Failed to get job evaluations:', error);
    throw error;
  }
}

/**
 * Get all jobs from blockchain
 */
export async function getAllJobs() {
  try {
    if (!marketplaceContract) {
      throw new Error('Marketplace contract not initialized');
    }

    const jobIds = await marketplaceContract.getAllJobs();
    const jobs = [];

    for (const jobId of jobIds) {
      const jobDetails = await getJobDetails(jobId);
      jobs.push({
        jobId,
        ...jobDetails,
      });
    }

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

    const stake = await stakingContract.getStake(address);
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
