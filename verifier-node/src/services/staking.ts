import { ethers } from 'ethers';
import { wallet } from './blockchain';
import { logger } from '../utils/logger';

// TODO: Uncomment after compiling contracts and exporting ABIs
// import { StakingManager, AuditorRegistry } from '../../../shared/abi';

// TEMPORARY: Human-readable ABIs (replace with imports from shared/abi/ after compilation)
const STAKING_ABI = [
  'function stakeAsVerifier() payable',
  'function hasVerifierStake(address) view returns (bool)',
  'function getStake(address) view returns (tuple(uint256,uint256,uint256,uint256,uint8,bool))',
];

// NOTE: After compiling contracts, replace with: const STAKING_ABI = StakingManager.abi;

let stakingContract: ethers.Contract;

/**
 * Initialize staking contract
 */
export function initializeStaking() {
  const stakingAddress = process.env.STAKING_ADDRESS;
  if (!stakingAddress) {
    throw new Error('STAKING_ADDRESS not configured');
  }

  stakingContract = new ethers.Contract(stakingAddress, STAKING_ABI, wallet);
  logger.info('Staking contract loaded', { address: stakingAddress });
}

/**
 * Register as verifier by staking
 */
export async function registerAsVerifier() {
  try {
    if (!stakingContract) {
      initializeStaking();
    }

    // Check if already staked
    const hasStake = await stakingContract.hasVerifierStake(wallet.address);

    if (hasStake) {
      logger.info('Already registered as verifier', { address: wallet.address });
      return;
    }

    const stakeAmount =
      process.env.VERIFIER_STAKE_AMOUNT || ethers.parseEther('0.1').toString();

    logger.info('Staking as verifier', {
      amount: ethers.formatEther(stakeAmount),
      address: wallet.address,
    });

    const tx = await stakingContract.stakeAsVerifier({ value: stakeAmount });
    const receipt = await tx.wait();

    logger.info('Successfully staked as verifier', {
      txHash: receipt.hash,
      amount: ethers.formatEther(stakeAmount),
    });
  } catch (error: any) {
    logger.error('Failed to register as verifier:', error);
    throw error;
  }
}

/**
 * Check if address has verifier stake
 */
export async function hasVerifierStake(address: string): Promise<boolean> {
  try {
    if (!stakingContract) {
      initializeStaking();
    }

    return await stakingContract.hasVerifierStake(address);
  } catch (error: any) {
    logger.error('Failed to check verifier stake:', error);
    return false;
  }
}

/**
 * Get stake info
 */
export async function getStakeInfo(address: string) {
  try {
    if (!stakingContract) {
      initializeStaking();
    }

    const stake = await stakingContract.getStake(address);

    return {
      amount: stake[0],
      lockedAmount: stake[1],
      unbondingAmount: stake[2],
      unbondingTime: stake[3],
      stakeType: stake[4],
      active: stake[5],
    };
  } catch (error: any) {
    logger.error('Failed to get stake info:', error);
    throw error;
  }
}

export { stakingContract };
