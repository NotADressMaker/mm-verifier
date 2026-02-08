import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { getAllJobs } from '../services/blockchain';
import { normalizeTaskStatusQuery, TASK_STATUS_LABELS } from '../utils/taskStatus';
import { isMockVerifierEnabled } from '../utils/mockMode';
import {
  getMockBundle,
  getMockDisputes,
  getMockJob,
  getMockReceipt,
  listMockJobs,
} from '../services/mockVerifier';
import { getDebugTrace } from '../services/debugTraceStore';

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

    if (isMockVerifierEnabled()) {
      const jobs = await listMockJobs();
      const filtered = status
        ? jobs.filter((job) => job.status === status)
        : jobs;
      const startIndex = Number(offset);
      const endIndex = startIndex + Number(limit);
      const paginatedJobs = filtered.slice(startIndex, endIndex);

      return res.status(200).json({
        total: filtered.length,
        limit: Number(limit),
        offset: Number(offset),
        jobs: paginatedJobs,
      });
    }

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
    const jobs = isMockVerifierEnabled() ? await listMockJobs() : await getAllJobs();

    const statusLabels = isMockVerifierEnabled()
      ? ['queued', 'running', 'completed', 'failed']
      : TASK_STATUS_LABELS;

    const stats = {
      total: jobs.length,
      byStatus: Object.fromEntries(statusLabels.map((label) => [label, 0])) as Record<string, number>,
      averageScore: 0,
      totalRewards: '0',
    };

    let totalScore = 0;
    let completedCount = 0;
    let totalRewards = BigInt(0);

    for (const job of jobs) {
      const jobAny = job as any;
      // Count by status
      if (jobAny.status in stats.byStatus) {
        stats.byStatus[jobAny.status]++;
      }

      // Calculate averages for completed jobs
      if (jobAny.status === 'completed') {
        const score =
          typeof jobAny.consensusScore !== 'undefined'
            ? Number(jobAny.consensusScore)
            : Number(jobAny.scoreBps ?? 0);
        totalScore += score;
        completedCount++;
      }

      if (typeof jobAny.rewardPool !== 'undefined') {
        totalRewards += BigInt(jobAny.rewardPool);
      }
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

/**
 * GET /api/jobs/:jobId/receipt
 */
router.get('/:jobId/receipt', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    if (!isMockVerifierEnabled()) {
      return res.status(501).json({
        error: 'Not Implemented',
        message: 'Receipt retrieval is only available in mock mode',
      });
    }

    const receipt = await getMockReceipt(jobId);
    if (!receipt) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Receipt not found',
      });
    }

    return res.status(200).json({ receipt });
  } catch (error: any) {
    logger.error('Error fetching receipt:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
});

/**
 * GET /api/jobs/:jobId/trace
 */
router.get('/:jobId/trace', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const trace = await getDebugTrace(jobId);
    if (!trace) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Debug trace not found',
      });
    }
    return res.status(200).json({ trace });
  } catch (error: any) {
    logger.error('Error fetching debug trace:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
});

/**
 * GET /api/jobs/:jobId/bundle
 */
router.get('/:jobId/bundle', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    if (!isMockVerifierEnabled()) {
      return res.status(501).json({
        error: 'Not Implemented',
        message: 'Bundle retrieval is only available in mock mode',
      });
    }

    const bundle = await getMockBundle(jobId);
    if (!bundle) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Bundle not found',
      });
    }

    return res.status(200).json({ bundle });
  } catch (error: any) {
    logger.error('Error fetching bundle:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
});

/**
 * GET /api/jobs/:jobId/disputes
 */
router.get('/:jobId/disputes', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    if (!isMockVerifierEnabled()) {
      return res.status(501).json({
        error: 'Not Implemented',
        message: 'Dispute retrieval is only available in mock mode',
      });
    }

    const disputes = await getMockDisputes(jobId);
    return res.status(200).json({ disputes: disputes ?? [] });
  } catch (error: any) {
    logger.error('Error fetching disputes:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
});

/**
 * GET /api/jobs/:jobId
 */
router.get('/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    if (!isMockVerifierEnabled()) {
      return res.status(501).json({
        error: 'Not Implemented',
        message: 'Job detail retrieval is only available in mock mode',
      });
    }

    const job = await getMockJob(jobId);
    if (!job) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Job not found',
      });
    }

    return res.status(200).json({ job });
  } catch (error: any) {
    logger.error('Error fetching job:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
});

export { router as jobRoutes };
