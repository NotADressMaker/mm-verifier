import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { logger } from '../utils/logger';
import { verifyWithMMV } from '../services/mmvVerifier';
import { hashUtf8 } from '../services/mmvHasher';
import { runDecisionGate } from '../services/decisionGate';
import { buildMMVReceipt } from '../services/mmvReceipt';

const router = Router();

const mmvValidators = [
  body('taskId').isString().notEmpty().withMessage('taskId is required'),
  body('input').isString().notEmpty().withMessage('input is required'),
  body('candidates').isArray({ min: 1 }).withMessage('At least one candidate required'),
  body('candidates.*').isString().withMessage('Candidates must be strings'),
  body('evidence').optional().isObject().withMessage('Evidence must be an object'),
];

router.post('/verify', mmvValidators, async (req: Request, res: Response) => {
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
    const mmvResult = await verifyWithMMV(
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

    const receipt = buildMMVReceipt(mmvResult);

    res.status(200).json({
      taskId,
      result: mmvResult,
      receipt,
    });
  } catch (error: any) {
    logger.error('MMV verification failed', { error: error.message });
    res.status(500).json({
      error: 'MMV verification failed',
      message: error.message,
    });
  }
});

router.post('/guard', mmvValidators, async (req: Request, res: Response) => {
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
    logger.warn('MMV decision gate blocked request', { error: error.message });
    res.status(403).json({
      error: 'Decision gate blocked',
      message: error.message,
    });
  }
});

export { router as mmvRoutes };
