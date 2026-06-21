import { Router, Request, Response } from 'express';
import { logger } from '../../utils/logger';
import { getTaskDetails } from '../../services/blockchain';
import { VerifyResponse } from '../../../../shared/httpSchemas';
import { verdictFromScore, buildTimings } from './verify';

const router = Router();

router.use((req, res, next) => {
  res.setHeader('X-MAMV-API-Version', '1');
  next();
});

const statusMap: Record<number, VerifyResponse['status']> = {
  0: 'queued',
  1: 'running',
  2: 'finalized',
  3: 'running',
  4: 'finalized',
};

router.get('/:taskId', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    logger.info('Fetching task status', { taskId });

    const taskDetails = await getTaskDetails(taskId);
    const scoreBps = Number(taskDetails.finalScoreBps || 0);
    const status = statusMap[Number(taskDetails.state)] || 'failed';

    const response: VerifyResponse = {
      task_id: taskId,
      status,
      verdict: status === 'finalized' ? verdictFromScore(scoreBps) : 'unknown',
      score_bps: status === 'finalized' ? scoreBps : 0,
      evidence: {
        bundle_hash: null,
        bundle_uri: null,
      },
      timings: buildTimings(),
      errors: [],
    };

    res.status(200).json(response);
  } catch (error: any) {
    logger.error('Error fetching task status:', error);
    res.status(500).json({
      errors: [
        {
          code: 'INTERNAL_ERROR',
          message: error.message || 'Internal Server Error',
        },
      ],
    });
  }
});

export { router as tasksV1Routes };
