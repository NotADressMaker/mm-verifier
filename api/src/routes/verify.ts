import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { submitVerificationJob } from '../services/blockchain';
import { queueVerificationJob } from '../services/jobQueue';

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
  ],
  async (req: Request, res: Response) => {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { prompt, models, taskType, deadline, rewardPool } = req.body;

      logger.info('Received verification request', {
        models,
        taskType,
        promptLength: prompt.length,
      });

      // Hash the prompt
      const { ethers } = require('ethers');
      const promptHash = ethers.keccak256(ethers.toUtf8Bytes(prompt));

      // Calculate deadline (default: 1 hour from now)
      const deadlineTimestamp = deadline || Math.floor(Date.now() / 1000) + 3600;

      // Default reward pool (0.01 ETH)
      const rewardPoolWei = rewardPool
        ? ethers.parseEther(rewardPool.toString())
        : ethers.parseEther('0.01');

      // Map task type to enum
      const taskTypeMap: { [key: string]: number } = {
        'factual-qa': 0,
        'math-proof': 1,
        'policy-compliance': 2,
        'citation-check': 3,
        'general': 4,
      };

      // Submit job to blockchain
      const jobId = await submitVerificationJob(
        promptHash,
        models,
        taskTypeMap[taskType],
        deadlineTimestamp,
        rewardPoolWei
      );

      // Queue job for verifier nodes
      await queueVerificationJob({
        jobId,
        prompt,
        promptHash,
        models,
        taskType,
        deadline: deadlineTimestamp,
      });

      logger.info('Verification job submitted', { jobId });

      // Return job info
      res.status(201).json({
        jobId,
        status: 'pending',
        promptHash,
        models,
        taskType,
        deadline: new Date(deadlineTimestamp * 1000).toISOString(),
        estimatedCompletion: new Date((deadlineTimestamp - 3600) * 1000).toISOString(),
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
    const { getJobDetails, getJobEvaluations } = require('../services/blockchain');
    const jobDetails = await getJobDetails(jobId);
    const evaluations = await getJobEvaluations(jobId);

    // Map status
    const statusMap = ['open', 'commit-phase', 'reveal-phase', 'completed', 'disputed', 'cancelled'];
    const status = statusMap[jobDetails.status];

    // Build response
    const response: any = {
      jobId,
      status,
      promptHash: jobDetails.promptHash,
      models: jobDetails.models,
      taskType: jobDetails.taskType,
      rewardPool: jobDetails.rewardPool.toString(),
      deadline: new Date(Number(jobDetails.deadline) * 1000).toISOString(),
    };

    // Add result if completed
    if (status === 'completed') {
      response.result = {
        score: Number(jobDetails.consensusScore),
        verdict: getVerdict(Number(jobDetails.consensusScore)),
        confidence: calculateConfidence(evaluations),
        verifiers: evaluations.map((e: any) => e.verifier),
        evaluations: evaluations.map((e: any) => ({
          verifier: e.verifier,
          score: Number(e.score),
          verdict: e.verdict,
          evidenceHash: e.evidenceHash,
        })),
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
