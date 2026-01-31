import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { submitVerificationJob } from '../services/blockchain';
import { queueVerificationJob } from '../services/jobQueue';
import {
  getProgram,
  registerProgram,
  validateVerificationProgram,
  VerificationProgram,
} from '../services/programRegistry';

const router = Router();

/**
 * POST /api/verify
 * Submit a new verification request
 */
router.post(
  '/',
  [
    body('prompt').isString().notEmpty().withMessage('Prompt is required'),
    body('models').isArray({ min: 1 }).withMessage('At least one model required'),
    body('models.*').isString().withMessage('Model names must be strings'),
    body('taskType').isIn(['factual-qa', 'math-proof', 'policy-compliance', 'citation-check', 'general'])
      .withMessage('Invalid task type'),
    body('deadline').optional().isInt({ min: 1 }).withMessage('Deadline must be positive integer'),
    body('rewardPool').optional().isNumeric().withMessage('Reward pool must be numeric'),
    body('programId').optional().isString().withMessage('Program ID must be a string'),
    body('program').optional().custom((value) => {
      const validation = validateVerificationProgram(value);
      if (!validation.valid) {
        throw new Error(validation.message || 'Invalid program');
      }
      return true;
    }),
  ],
  async (req: Request, res: Response) => {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const {
        prompt,
        models,
        taskType,
        deadline,
        rewardPool,
        programId,
        program,
      }: {
        prompt: string;
        models: string[];
        taskType: string;
        deadline?: number;
        rewardPool?: number;
        programId?: string;
        program?: VerificationProgram;
      } = req.body;

      let resolvedProgramId = programId;
      let resolvedProgram: VerificationProgram | undefined = undefined;

      if (program) {
        const record = registerProgram(program);
        resolvedProgramId = record.id;
        resolvedProgram = record.program;
      }

      if (resolvedProgramId) {
        const record = getProgram(resolvedProgramId);
        if (!record) {
          return res.status(400).json({
            error: 'Invalid program',
            message: 'Program ID not found',
          });
        }
        resolvedProgram = record.program;
      }

      logger.info('Received verification request', {
        models,
        taskType,
        promptLength: prompt.length,
        programId: resolvedProgramId,
      });

      // Hash the prompt
      const { ethers } = require('ethers');
      const promptHash = ethers.keccak256(ethers.toUtf8Bytes(prompt));

      // Calculate deadline (default: 1 hour from now)
      const commitDeadline = deadline || Math.floor(Date.now() / 1000) + 3600;
      const revealDeadline = commitDeadline + 3600;
      const disputeWindowSeconds = parseInt(process.env.DISPUTE_WINDOW_SECONDS || '3600', 10);
      const minEvals = parseInt(process.env.MIN_EVALS || '1', 10);
      const maxEvals = parseInt(process.env.MAX_EVALS || '3', 10);

      // Default reward pool (0.01 ETH)
      const feePoolWei = rewardPool
        ? ethers.parseEther(rewardPool.toString())
        : ethers.parseEther('0.01');

      const rubricHash = ethers.keccak256(
        ethers.toUtf8Bytes(JSON.stringify({ taskType, models }))
      );

      // Submit task to blockchain
      const taskId = await submitVerificationJob({
        promptHash,
        rubricHash,
        commitDeadline,
        revealDeadline,
        disputeWindowSeconds,
        minEvals,
        maxEvals,
        feePoolWei,
      });

      // Queue job for verifier nodes
      await queueVerificationJob({
        jobId: taskId,
        prompt,
        promptHash,
        models,
        taskType,
        deadline: commitDeadline,
        programId: resolvedProgramId,
        program: resolvedProgram,
      });

      logger.info('Verification task submitted', { taskId });

      // Return job info
      res.status(201).json({
        jobId: taskId,
        status: 'pending',
        promptHash,
        models,
        taskType,
        deadline: new Date(commitDeadline * 1000).toISOString(),
        estimatedCompletion: new Date((revealDeadline) * 1000).toISOString(),
        programId: resolvedProgramId,
        program: resolvedProgram,
      });
    } catch (error: any) {
      logger.error('Error submitting verification request:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  }
);

/**
 * GET /api/verify/:jobId
 * Get verification result
 */
router.get('/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    logger.info('Fetching verification result', { jobId });

    // Get job from blockchain
    const { getTaskDetails } = require('../services/blockchain');
    const taskDetails = await getTaskDetails(jobId);

    // Map status
    const statusMap = ['open', 'reveal-phase', 'completed', 'disputed', 'resolved'];
    const status = statusMap[taskDetails.state];

    // Build response
    const response: any = {
      jobId,
      status,
      promptHash: taskDetails.promptHash,
      rubricHash: taskDetails.rubricHash,
      rewardPool: taskDetails.feePool.toString(),
      deadline: new Date(Number(taskDetails.commitDeadline) * 1000).toISOString(),
    };

    // Add result if completed
    if (status === 'completed') {
      response.result = {
        score: Number(taskDetails.finalScoreBps),
        verdict: getVerdict(Number(taskDetails.finalScoreBps)),
        confidence: 0,
        evaluations: [],
      };
    }

    res.status(200).json(response);
  } catch (error: any) {
    logger.error('Error fetching verification result:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
});

/**
 * Helper: Get verdict from score
 */
function getVerdict(score: number): string {
  if (score >= 80) return 'reliable';
  if (score >= 50) return 'mixed';
  return 'unreliable';
}

/**
 * Helper: Calculate confidence from evaluations
 */
function calculateConfidence(evaluations: any[]): number {
  if (evaluations.length === 0) return 0;

  // Calculate standard deviation of scores
  const scores = evaluations.map((e: any) => Number(e.score));
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / scores.length;
  const stdDev = Math.sqrt(variance);

  // Lower std dev = higher confidence
  // Normalize to 0-1 range (assuming max std dev of 50)
  return Math.max(0, 1 - stdDev / 50);
}

export { router as verifyRoutes };
