import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { getJobBoardJobs } from '../services/jobBoardIndexer';

const router = Router();

/**
 * GET /api/job-board
 * Get JobBoard escrow jobs
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    const jobs = await getJobBoardJobs();

    let filteredJobs = jobs;
    if (status && typeof status === 'string') {
      filteredJobs = jobs.filter((job) => job.status === status);
    }

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
    logger.error('Error fetching job board jobs:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
});

export { router as jobBoardRoutes };
