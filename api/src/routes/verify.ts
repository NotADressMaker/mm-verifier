import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { logger } from '../utils/logger';
import { submitVerificationJob } from '../services/blockchain';
import { queueVerificationJob } from '../services/jobQueue';
import { resolveProgram } from '../services/programRegistry';
import { CONSTANTS } from '../../../shared/types';
import { normalizeUnixSeconds, resolveCommitDeadline, resolveRevealDeadline } from '../utils/time';
import { formatTaskStatus } from '../utils/taskStatus';
import { createMockJob } from '../services/mockVerifier';
import { getMockScenario, isMockVerifierEnabled } from '../utils/mockMode';
import { hashUtf8 } from '../../../shared/canonicalJson';
import { getMockJob, getMockReceipt } from '../services/mockVerifier';
import { createDebugTrace, endStage, startStage } from '../../../shared/observability/debugTrace';
import { storeDebugTrace } from '../services/debugTraceStore';
import { TraceContext } from '../../../shared/observability/tracing';
import { validateAllusionOptions } from '../../../shared/allusions';

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
    body('taskType')
      .isIn(['factual-qa', 'math-proof', 'policy-compliance', 'citation-check', 'general'])
      .withMessage('Invalid task type'),
    body('deadline').optional().isInt({ min: 1 }).withMessage('Deadline must be positive integer'),
    body('commitDeadlineSeconds')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Commit deadline seconds must be positive integer'),
    body('revealDeadlineSeconds')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Reveal deadline seconds must be positive integer'),
    body('rewardPool').optional().isNumeric().withMessage('Reward pool must be numeric'),
    body('programId').optional().isString().withMessage('Program ID must be a string'),
    body('programVersion').optional().isString().withMessage('Program version must be a string'),
    body('store_evidence').optional().isBoolean().withMessage('store_evidence must be a boolean'),
    body('allusions').optional().isObject().withMessage('allusions must be an object'),
    body('allusions.strategy').optional().isIn(['direct', 'structured_reasoning', 'self_consistency', 'self_refine']).withMessage('Invalid allusion strategy'),
    body('allusions.num_samples').optional().isInt({ min: 1, max: 5 }).withMessage('allusions.num_samples must be between 1 and 5'),
    body('allusions.max_refine_iterations').optional().isInt({ min: 0, max: 3 }).withMessage('allusions.max_refine_iterations must be between 0 and 3'),
  ],
  async (req: Request, res: Response) => {
    const requestStart = Date.now();
    const traceContext = (req as Request & { traceContext?: TraceContext }).traceContext;
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
        commitDeadlineSeconds,
        revealDeadlineSeconds,
        rewardPool,
        programId,
        programVersion,
        store_evidence,
        allusions,
      }: {
        prompt: string;
        models: string[];
        taskType: string;
        deadline?: number;
        commitDeadlineSeconds?: number;
        revealDeadlineSeconds?: number;
        rewardPool?: number;
        programId?: string;
        programVersion?: string;
        store_evidence?: boolean;
        allusions?: import('../../../shared/allusions').AllusionOptions;
      } = req.body;

      const allusionErrors = validateAllusionOptions(allusions);
      if (allusionErrors.length) return res.status(400).json({ errors: allusionErrors.map(message => ({ msg: message, path: 'allusions' })) });

      let resolvedProgramId = programId;
      let resolvedProgramVersion = programVersion;
      let resolvedProgramHash: string | undefined;

      try {
        const record = resolveProgram(programId, programVersion);
        resolvedProgramId = record.id;
        resolvedProgramVersion = record.version;
        resolvedProgramHash = record.hash;
      } catch (error: any) {
        return res.status(400).json({
          error: 'Invalid program',
          message: error.message || 'Program not found',
        });
      }

      logger.info('Received verification request', {
        models,
        taskType,
        promptLength: prompt.length,
        programId: resolvedProgramId,
        programVersion: resolvedProgramVersion,
      });

      // Hash the prompt
      const { ethers } = require('ethers');
      const promptHash = ethers.keccak256(ethers.toUtf8Bytes(prompt));

      const ingestTrace = createDebugTrace('pending', traceContext?.trace_id);
      startStage(ingestTrace, 'ingest/validate', {
        models,
        taskType,
        program_id: resolvedProgramId,
        program_version: resolvedProgramVersion,
      });

      // Calculate deadline (default: 1 hour from now)
      const nowSeconds = Math.floor(Date.now() / 1000);
      const normalizedDeadline = deadline ? normalizeUnixSeconds(deadline, 'deadline') : undefined;
      const commitDeadline = resolveCommitDeadline({
        nowSeconds,
        deadline: normalizedDeadline,
        commitDeadlineSeconds,
      });
      const revealDeadline = resolveRevealDeadline({
        commitDeadline,
        revealDeadlineSeconds,
      });
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

      const hashedOnlyDefault = process.env.HASHED_ONLY_DEFAULT !== 'false';
      const shouldStoreEvidence =
        typeof store_evidence === 'boolean' ? store_evidence : !hashedOnlyDefault;

      let taskId: string;
      if (isMockVerifierEnabled()) {
        const mockId = hashUtf8(`${prompt}-${Date.now()}`).slice(2, 10);
        taskId = `mock_${mockId}`;
        await createMockJob({
          jobId: taskId,
          prompt,
          promptHash,
          models,
          taskType,
          programId: resolvedProgramId,
          programVersion: resolvedProgramVersion,
          scenario: getMockScenario(),
          storeEvidence: shouldStoreEvidence,
        });
        logger.info('Mock verification job created', { jobId: taskId });
      } else {
        // Submit task to blockchain
        const submitStart = Date.now();
        taskId = await submitVerificationJob({
          promptHash,
          rubricHash,
          commitDeadline,
          revealDeadline,
          disputeWindowSeconds,
          minEvals,
          maxEvals,
          feePoolWei,
        });
        logger.info('Timing: blockchain submit', {
          jobId: taskId,
          durationMs: Date.now() - submitStart,
        });
      }

      ingestTrace.task_id = taskId;
      endStage(ingestTrace, 'ingest/validate', 'ok', {
        prompt_hash: promptHash,
        task_id: taskId,
      });

      startStage(ingestTrace, 'enqueue', {
        queue: 'verification-jobs',
      });

      // Queue job for verifier nodes
      const queueStart = Date.now();
      await queueVerificationJob({
        jobId: taskId,
        prompt,
        promptHash,
        models,
        taskType,
        deadline: commitDeadline,
        programId: resolvedProgramId,
        programVersion: resolvedProgramVersion,
        storeEvidence: shouldStoreEvidence,
        requestId: traceContext?.request_id,
        traceContext: traceContext
          ? {
              trace_id: traceContext.trace_id,
              span_id: traceContext.span_id,
              request_id: traceContext.request_id,
            }
          : undefined,
        enqueuedAt: Date.now(),
      });
      logger.info('Timing: job enqueue', {
        jobId: taskId,
        durationMs: Date.now() - queueStart,
      });

      endStage(ingestTrace, 'enqueue', 'ok', {
        duration_ms: Date.now() - queueStart,
      });

      await storeDebugTrace(taskId, ingestTrace);

      logger.info('Verification task submitted', { taskId });
      logger.info('Timing: api verify total', {
        jobId: taskId,
        durationMs: Date.now() - requestStart,
      });

      // Return job info
      res.status(201).json({
        jobId: taskId,
        status: isMockVerifierEnabled() ? 'queued' : 'pending',
        promptHash,
        models,
        taskType,
        deadline: new Date(commitDeadline * 1000).toISOString(),
        estimatedCompletion: new Date(revealDeadline * 1000).toISOString(),
        programId: resolvedProgramId,
        programVersion: resolvedProgramVersion,
        program: resolvedProgramId
          ? { id: resolvedProgramId, version: resolvedProgramVersion, hash: resolvedProgramHash }
          : undefined,
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

    if (isMockVerifierEnabled()) {
      const record = await getMockJob(jobId);
      if (!record) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Mock job not found',
        });
      }

      const receipt = await getMockReceipt(jobId);

      const rubricHash = hashUtf8(JSON.stringify({ taskType: record.taskType, models: record.models }));

      return res.status(200).json({
        jobId,
        status: record.status,
        promptHash: record.promptHash,
        rubricHash,
        rewardPool: '0',
        deadline: record.createdAt,
        models: record.models,
        taskType: record.taskType,
        timestamp: record.createdAt,
        result: receipt
          ? {
              score: record.scoreBps ?? 0,
              verdict: record.verdict ?? false,
              finalScoreBps: record.scoreBps ?? 0,
              receipt,
            }
          : undefined,
      });
    }

    // Get job from blockchain
    const { getTaskDetails } = require('../services/blockchain');
    const taskDetails = await getTaskDetails(jobId);

    // Map status
    const status = formatTaskStatus(taskDetails.state);

    // Build response
    const response: any = {
      jobId,
      status,
      promptHash: taskDetails.promptHash,
      rubricHash: taskDetails.rubricHash,
      rewardPool: taskDetails.feePool.toString(),
      deadline: new Date(Number(taskDetails.commitDeadline) * 1000).toISOString(),
      models: taskDetails.models,
      taskType: taskDetails.taskType,
      timestamp: new Date(Number(taskDetails.createdAt) * 1000).toISOString(),
    };

    if (status === 'finalized') {
      response.result = {
        score: Number(taskDetails.finalScoreBps),
        verdict: Number(taskDetails.finalScoreBps) >= CONSTANTS.MIXED_THRESHOLD,
        finalScoreBps: Number(taskDetails.finalScoreBps),
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

export { router as verifyRoutes };
