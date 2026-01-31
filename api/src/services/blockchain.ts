import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import { logger } from '../utils/logger';

// TODO: Uncomment after compiling contracts and exporting ABIs
// import { VerifierMarketplace, BondVaultWETH, AuditorRegistry } from '../../../shared/abi';

dotenv.config({ path: '../../.env' });

// TEMPORARY: Human-readable ABIs (replace with imports from shared/abi/ after compilation)
// Once contracts are compiled, use: VerifierMarketplace.abi, BondVaultWETH.abi, etc.
export const MARKETPLACE_ABI = [
  'function createTask(bytes32 promptHash, bytes32 rubricHash, uint40 commitDeadline, uint40 revealDeadline, uint40 disputeWindowSeconds, uint8 minEvals, uint8 maxEvals, uint256 feePool) external returns (uint256)',
  'function getTaskMeta(uint256 taskId) view returns (uint8 state, address requester, bytes32 promptHash, bytes32 rubricHash, uint40 commitDeadline, uint40 revealDeadline, uint40 disputeDeadline, uint8 minEvals, uint8 maxEvals, uint256 feePool, uint16 finalScoreBps, uint256 evalCount)',
  'event TaskCreated(uint256 indexed taskId, address indexed requester, uint256 feePool)',
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
      const taskId = parsed?.args.taskId;
      logger.info('Task created successfully', { taskId });
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
  } catch (error) {
    logger.error('Failed to get job details:', error);
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
