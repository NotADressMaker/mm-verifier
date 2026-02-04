import { Contract, ethers } from 'ethers';
import { logger } from '../utils/logger';
import { getRpcUrl } from '../../../shared/env';
import { JobBoardEscrow } from '../../../shared/abi';

export interface JobBoardJob {
  jobId: string;
  owner: string;
  agentId: string;
  jobURI: string;
  jobHash: string;
  paymentToken: string;
  budgetAmount: string;
  deadline: string;
  passThreshold: number;
  milestoneCount: string;
  awardedAt: string;
  totalReleased: string;
  disputeOpen: boolean;
  disputePayoutBps: number;
  status: 'open' | 'awarded' | 'dispute' | 'closed';
}

let provider: ethers.JsonRpcProvider | null = null;
let jobBoardContract: Contract | null = null;

export async function initializeJobBoardIndexer(): Promise<void> {
  try {
    const rpcUrl = getRpcUrl();
    if (!rpcUrl) {
      logger.warn('JobBoardIndexer: No RPC URL configured, on-chain features disabled');
      return;
    }

    const contractAddress = process.env.JOB_BOARD_ADDRESS || '';
    if (!contractAddress) {
      logger.warn('JobBoardIndexer: No JOB_BOARD_ADDRESS configured');
      return;
    }

    provider = new ethers.JsonRpcProvider(rpcUrl);
    jobBoardContract = new ethers.Contract(contractAddress, JobBoardEscrow.abi, provider);

    logger.info('JobBoardIndexer initialized', {
      contractAddress,
    });
  } catch (error) {
    logger.error('JobBoardIndexer initialization failed', error);
  }
}

export async function getJobBoardJobs(): Promise<JobBoardJob[]> {
  if (!jobBoardContract) return [];

  try {
    const nextJobId = await jobBoardContract.nextJobId();
    const totalJobs = Math.max(0, Number(nextJobId) - 1);

    const jobs: JobBoardJob[] = [];

    for (let i = 1; i <= totalJobs; i++) {
      const job = await jobBoardContract.jobs(i);
      const status = job.closed
        ? 'closed'
        : job.disputeOpen
          ? 'dispute'
          : job.agentId === 0n
            ? 'open'
            : 'awarded';

      jobs.push({
        jobId: i.toString(),
        owner: job.owner,
        agentId: job.agentId.toString(),
        jobURI: job.jobURI,
        jobHash: job.jobHash,
        paymentToken: job.paymentToken,
        budgetAmount: job.budgetAmount.toString(),
        deadline: job.deadline.toString(),
        passThreshold: Number(job.passThreshold),
        milestoneCount: job.milestoneCount.toString(),
        awardedAt: job.awardedAt.toString(),
        totalReleased: job.totalReleased.toString(),
        disputeOpen: job.disputeOpen,
        disputePayoutBps: Number(job.disputePayoutBps),
        status,
      });
    }

    return jobs;
  } catch (error) {
    logger.error('JobBoardIndexer: Failed to fetch jobs', error);
    return [];
  }
}
