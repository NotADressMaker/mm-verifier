import { Router, Request, Response } from 'express';
import { body, query, param, validationResult } from 'express-validator';
import { logger } from '../utils/logger';
import { verifyWithMAMV } from '../services/mamvVerifier';
import { hashUtf8 } from '../services/mamvHasher';
import { runDecisionGate } from '../services/decisionGate';
import { buildMAMVReceipt } from '../services/mamvReceipt';
import {
  getRecord,
  listRecords,
  verifyRecordOnChain,
  getCacheStats,
} from '../services/recordsService';
import { WORTHY_MIN_BPS } from '../../../shared/verifiedOutput';

const router = Router();

const mamvValidators = [
  body('taskId').isString().notEmpty().withMessage('taskId is required'),
  body('input').isString().notEmpty().withMessage('input is required'),
  body('candidates').isArray({ min: 1 }).withMessage('At least one candidate required'),
  body('candidates.*').isString().withMessage('Candidates must be strings'),
  body('evidence').optional().isObject().withMessage('Evidence must be an object'),
];

router.post('/verify', mamvValidators, async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const requesterId = req.header('x-requester-id') || req.ip || 'anonymous';
  const { taskId, input, candidates, evidence } = req.body as {
    taskId: string;
    input: string;
    candidates: string[];
    evidence?: Record<string, unknown>;
  };

  try {
    const mamvResult = await verifyWithMAMV(
      {
        taskId,
        input,
        candidates: candidates.map((output, index) => ({
          index,
          output,
          outputHash: hashUtf8(output),
        })),
        evidence,
      },
      requesterId
    );

    const receipt = buildMAMVReceipt(mamvResult);

    res.status(200).json({
      taskId,
      result: mamvResult,
      receipt,
    });
  } catch (error: any) {
    logger.error('MAMV verification failed', { error: error.message });
    res.status(500).json({
      error: 'MAMV verification failed',
      message: error.message,
    });
  }
});

router.post('/guard', mamvValidators, async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const requesterId = req.header('x-requester-id') || req.ip || 'anonymous';
  const { taskId, input, candidates, evidence } = req.body as {
    taskId: string;
    input: string;
    candidates: string[];
    evidence?: Record<string, unknown>;
  };

  try {
    const gateResult = await runDecisionGate({
      taskId,
      input,
      candidates,
      evidence,
      requesterId,
    });

    res.status(200).json({
      taskId,
      attestation: gateResult.attestation,
      signature: gateResult.signature,
      selectedOutput: gateResult.selectedOutput,
      receipt: gateResult.receipt,
    });
  } catch (error: any) {
    logger.warn('MAMV decision gate blocked request', { error: error.message });
    res.status(403).json({
      error: 'Decision gate blocked',
      message: error.message,
    });
  }
});

// ============================================================================
// Record Endpoints - Trustworthy AI Outputs Ledger
// ============================================================================

/**
 * GET /api/mamv/tasks/:taskId/record
 * Get the VerifiedOutputRecord for a specific task
 */
router.get(
  '/tasks/:taskId/record',
  [param('taskId').isString().notEmpty().withMessage('taskId is required')],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { taskId } = req.params;

    try {
      const record = await getRecord(taskId);

      if (!record) {
        return res.status(404).json({
          error: 'Record not found',
          message: `No finalized verification record found for task ${taskId}`,
        });
      }

      res.status(200).json({ record });
    } catch (error: any) {
      logger.error('Failed to get record', { taskId, error: error.message });
      res.status(500).json({
        error: 'Failed to get record',
        message: error.message,
      });
    }
  }
);

/**
 * GET /api/mamv/records
 * List verified output records with filtering and pagination
 * Returns "worthy" records by default (score >= WORTHY_MIN_BPS)
 */
const recordsValidators = [
  query('min_score_bps')
    .optional()
    .isInt({ min: 0, max: 10000 })
    .withMessage('min_score_bps must be 0-10000'),
  query('worthy_only')
    .optional()
    .isBoolean()
    .withMessage('worthy_only must be a boolean'),
  query('verdict')
    .optional()
    .isBoolean()
    .withMessage('verdict must be a boolean'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be 1-100'),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('offset must be >= 0'),
];

router.get('/records', recordsValidators, async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const filter = {
      min_score_bps: req.query.min_score_bps
        ? parseInt(req.query.min_score_bps as string, 10)
        : undefined,
      worthy_only: req.query.worthy_only !== undefined
        ? req.query.worthy_only === 'true'
        : true, // Default: only worthy
      verdict: req.query.verdict !== undefined
        ? req.query.verdict === 'true'
        : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
    };

    const result = await listRecords(filter);

    res.status(200).json({
      records: result.records,
      total: result.total,
      has_more: result.has_more,
      filter: {
        min_score_bps: filter.min_score_bps ?? WORTHY_MIN_BPS,
        worthy_only: filter.worthy_only,
        limit: filter.limit,
        offset: filter.offset,
      },
    });
  } catch (error: any) {
    logger.error('Failed to list records', { error: error.message });
    res.status(500).json({
      error: 'Failed to list records',
      message: error.message,
    });
  }
});

/**
 * GET /api/mamv/tasks/:taskId/verify
 * Verify that a record exists on-chain
 */
router.get(
  '/tasks/:taskId/verify',
  [param('taskId').isString().notEmpty().withMessage('taskId is required')],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { taskId } = req.params;

    try {
      const result = await verifyRecordOnChain(taskId);

      res.status(200).json({
        task_id: taskId,
        verified: result.verified,
        block_number: result.blockNumber,
        tx_hash: result.txHash,
      });
    } catch (error: any) {
      logger.error('Failed to verify record on-chain', { taskId, error: error.message });
      res.status(500).json({
        error: 'Failed to verify record',
        message: error.message,
      });
    }
  }
);

/**
 * GET /api/mamv/records/stats
 * Get cache statistics (for debugging/monitoring)
 */
router.get('/records/stats', async (_req: Request, res: Response) => {
  try {
    const stats = getCacheStats();
    res.status(200).json({
      worthy_threshold_bps: WORTHY_MIN_BPS,
      ...stats,
    });
  } catch (error: any) {
    logger.error('Failed to get cache stats', { error: error.message });
    res.status(500).json({
      error: 'Failed to get stats',
      message: error.message,
    });
  }
});

export { router as mamvRoutes };
