import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { getAllJobs } from '../services/blockchain';
import { normalizeTaskStatusQuery, TASK_STATUS_LABELS } from '../utils/taskStatus';

const router = Router();

/**
 * GET /api/jobs
 * Get all verification jobs
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    const normalizedStatus = normalizeTaskStatusQuery(status as string | undefined);

    logger.info('Fetching jobs', { status, normalizedStatus, limit, offset });

    const jobs = await getAllJobs();

    // Filter by status if provided
    let filteredJobs = jobs;
    if (normalizedStatus) {
      filteredJobs = jobs.filter((job: any) => job.status === normalizedStatus);
    }

    // Pagination
    const startIndex = Number(offset);
    const endIndex = startIndex + Number(limit);
    const paginatedJobs = filteredJobs.slice(startIndex, endIndex);

    res.status(200).json({
      total: filteredJobs.length,
      limit: Number(limit),
      offset: Number(offset),
      jobs: paginatedJobs,
    });
  } catch (error: any) {
    logger.error('Error fetching jobs:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
});

/**
 * GET /api/jobs/stats
 * Get job statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const jobs = await getAllJobs();

    const stats = {
      total: jobs.length,
      byStatus: Object.fromEntries(TASK_STATUS_LABELS.map((label) => [label, 0])) as Record<string, number>,
      averageScore: 0,
      totalRewards: '0',
    };

    let totalScore = 0;
    let completedCount = 0;
    let totalRewards = BigInt(0);

    for (const job of jobs) {
      // Count by status
      if (job.status in stats.byStatus) {
        stats.byStatus[job.status]++;
      }

      // Calculate averages for completed jobs
      if (job.status === 'completed') {
        totalScore += Number(job.consensusScore);
        completedCount++;
      }

      totalRewards += BigInt(job.rewardPool);
    }

    if (completedCount > 0) {
      stats.averageScore = totalScore / completedCount;
    }

    stats.totalRewards = totalRewards.toString();

    res.status(200).json(stats);
  } catch (error: any) {
    logger.error('Error fetching job stats:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
});

export { router as jobRoutes };
