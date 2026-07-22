import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { logger } from '../../utils/logger';
import { submitVerificationJob } from '../../services/blockchain';
import { queueVerificationJob } from '../../services/jobQueue';
import { resolveProgram } from '../../services/programRegistry';
import { normalizeUnixSeconds, resolveCommitDeadline, resolveRevealDeadline } from '../../utils/time';
import {
  VerifyResponse,
  VerifyRequest,
  TimingInfo,
} from '../../../../shared/httpSchemas';
import { CONSTANTS } from '../../../../shared/types';
import { getIdempotencyRecord, setIdempotencyRecord } from '../../services/idempotency';
import { createDebugTrace, endStage, startStage } from '../../../../shared/observability/debugTrace';
import { storeDebugTrace } from '../../services/debugTraceStore';
import { TraceContext } from '../../../../shared/observability/tracing';
import { validateAllusionOptions } from '../../../../shared/allusions';

const router = Router();

router.use((req, res, next) => {
  res.setHeader('X-MAMV-API-Version', '1');
  next();
});

const requestValidators = [
  body('prompt').optional().isString().notEmpty().withMessage('Prompt is required'),
  body('models').optional().isArray({ min: 1 }).withMessage('At least one model required'),
  body('models.*').optional().isString().withMessage('Model names must be strings'),
  body('task_type')
    .optional()
    .isIn(['factual-qa', 'math-proof', 'policy-compliance', 'citation-check', 'general'])
    .withMessage('Invalid task type'),
  body('deadline').optional().isInt({ min: 1 }).withMessage('Deadline must be positive integer'),
  body('commit_deadline_seconds')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Commit deadline seconds must be positive integer'),
  body('reveal_deadline_seconds')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Reveal deadline seconds must be positive integer'),
  body('reward_pool').optional().isNumeric().withMessage('Reward pool must be numeric'),
  body('program_id').optional().isString().withMessage('Program ID must be a string'),
  body('program_version').optional().isString().withMessage('Program version must be a string'),
  body('idempotency_key').optional().isString().withMessage('Idempotency key must be a string'),
  body('store_evidence').optional().isBoolean().withMessage('store_evidence must be a boolean'),
  body('allusions').optional().isObject().withMessage('allusions must be an object'),
  body('allusions.strategy').optional().isIn(['direct', 'structured_reasoning', 'self_consistency', 'self_refine']).withMessage('Invalid allusion strategy'),
  body('allusions.num_samples').optional().isInt({ min: 1, max: 5 }).withMessage('allusions.num_samples must be between 1 and 5'),
  body('allusions.max_refine_iterations').optional().isInt({ min: 0, max: 3 }).withMessage('allusions.max_refine_iterations must be between 0 and 3'),
];

function resolveRequest(body: any): VerifyRequest {
  return {
    prompt: body.prompt ?? body.prompt_text ?? body.promptText,
    models: body.models ?? [],
    task_type: body.task_type ?? body.taskType,
    deadline: body.deadline,
    commit_deadline_seconds: body.commit_deadline_seconds ?? body.commitDeadlineSeconds,
    reveal_deadline_seconds: body.reveal_deadline_seconds ?? body.revealDeadlineSeconds,
    reward_pool: body.reward_pool ?? body.rewardPool,
    program_id: body.program_id ?? body.programId,
    program_version: body.program_version ?? body.programVersion,
    idempotency_key: body.idempotency_key ?? body.idempotencyKey,
    store_evidence: body.store_evidence ?? body.storeEvidence,
    allusions: body.allusions,
  };
}

function verdictFromScore(scoreBps: number): boolean | 'unknown' {
  if (scoreBps >= CONSTANTS.RELIABLE_THRESHOLD) return true;
  if (scoreBps < CONSTANTS.MIXED_THRESHOLD) return false;
  return 'unknown';
}

function buildTimings(overrides?: Partial<TimingInfo>): TimingInfo {
  return {
    queue_ms: overrides?.queue_ms ?? null,
    llm_ms: overrides?.llm_ms ?? null,
    bundle_ms: overrides?.bundle_ms ?? null,
    chain_ms: overrides?.chain_ms ?? null,
    total_ms: overrides?.total_ms ?? null,
  };
}

/**
 * POST /v1/verify
 * Submit a new verification request
 */
router.post('/', requestValidators, async (req: Request, res: Response) => {
  const requestStart = Date.now();
  const traceContext = (req as Request & { traceContext?: TraceContext }).traceContext;
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        errors: [
          {
            code: 'INVALID_INPUT',
            message: 'Request validation failed',
            details: { errors: errors.array() },
          },
        ],
      });
    }

    const requestPayload = resolveRequest(req.body);
    const allusionErrors = validateAllusionOptions(requestPayload.allusions);
    if (allusionErrors.length) return res.status(400).json({ errors: allusionErrors.map(message => ({ code: 'INVALID_INPUT', message })) });
    const idempotencyKey = req.header('Idempotency-Key') || requestPayload.idempotency_key;

    if (idempotencyKey) {
      const existing = getIdempotencyRecord(idempotencyKey);
      if (existing) {
        return res.status(200).json(existing.response);
      }
    }

    const {
      prompt,
      models,
      task_type,
      deadline,
      commit_deadline_seconds,
      reveal_deadline_seconds,
      reward_pool,
      program_id,
      program_version,
    } = requestPayload;

    const hashedOnlyDefault = process.env.HASHED_ONLY_DEFAULT !== 'false';
    const shouldStoreEvidence =
      typeof requestPayload.store_evidence === 'boolean'
        ? requestPayload.store_evidence
        : !hashedOnlyDefault;

    if (!prompt || !models?.length || !task_type) {
      return res.status(400).json({
        errors: [
          {
            code: 'INVALID_INPUT',
            message: 'prompt, models, and task_type are required',
          },
        ],
      });
    }

    let resolvedProgramId = program_id;
    let resolvedProgramVersion = program_version;
    let resolvedProgramHash: string | undefined;

    try {
      const record = resolveProgram(program_id, program_version);
      resolvedProgramId = record.id;
      resolvedProgramVersion = record.version;
      resolvedProgramHash = record.hash;
    } catch (error: any) {
      return res.status(400).json({
        errors: [
          {
            code: 'INVALID_INPUT',
            message: error.message || 'Program not found',
          },
        ],
      });
    }

    logger.info('Received verification request', {
      models,
      taskType: task_type,
      promptLength: prompt.length,
      programId: resolvedProgramId,
      programVersion: resolvedProgramVersion,
    });

    const { ethers } = require('ethers');
    const promptHash = ethers.keccak256(ethers.toUtf8Bytes(prompt));

    const ingestTrace = createDebugTrace('pending', traceContext?.trace_id);
    startStage(ingestTrace, 'ingest/validate', {
      models,
      taskType: task_type,
      program_id: resolvedProgramId,
      program_version: resolvedProgramVersion,
    });

    const nowSeconds = Math.floor(Date.now() / 1000);
    const normalizedDeadline = deadline ? normalizeUnixSeconds(deadline, 'deadline') : undefined;
    const commitDeadline = resolveCommitDeadline({
      nowSeconds,
      deadline: normalizedDeadline,
      commitDeadlineSeconds: commit_deadline_seconds,
    });
    const revealDeadline = resolveRevealDeadline({
      commitDeadline,
      revealDeadlineSeconds: reveal_deadline_seconds,
    });
    const disputeWindowSeconds = parseInt(process.env.DISPUTE_WINDOW_SECONDS || '3600', 10);
    const minEvals = parseInt(process.env.MIN_EVALS || '1', 10);
    const maxEvals = parseInt(process.env.MAX_EVALS || '3', 10);

    const feePoolWei = reward_pool
      ? ethers.parseEther(reward_pool.toString())
      : ethers.parseEther('0.01');

    const rubricHash = ethers.keccak256(
      ethers.toUtf8Bytes(JSON.stringify({ taskType: task_type, models }))
    );

    const submitStart = Date.now();
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
    const chainMs = Date.now() - submitStart;

    ingestTrace.task_id = taskId;
    endStage(ingestTrace, 'ingest/validate', 'ok', {
      prompt_hash: promptHash,
      task_id: taskId,
    });

    startStage(ingestTrace, 'enqueue', { queue: 'verification-jobs' });

    const queueStart = Date.now();
      await queueVerificationJob({
        jobId: taskId,
        prompt,
        promptHash,
        models,
        taskType: task_type,
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
    const queueMs = Date.now() - queueStart;

    endStage(ingestTrace, 'enqueue', 'ok', { duration_ms: queueMs });
    await storeDebugTrace(taskId, ingestTrace);

    const response: VerifyResponse = {
      task_id: taskId,
      status: 'queued',
      verdict: 'unknown',
      score_bps: 0,
      evidence: {
        bundle_hash: null,
        bundle_uri: null,
      },
      timings: buildTimings({
        queue_ms: queueMs,
        chain_ms: chainMs,
        total_ms: Date.now() - requestStart,
      }),
      errors: [],
      program_id: resolvedProgramId,
      program_version: resolvedProgramVersion,
      program: resolvedProgramId
        ? {
            id: resolvedProgramId,
            version: resolvedProgramVersion ?? 'unknown',
            hash: resolvedProgramHash ?? '',
          }
        : undefined,
    };

    if (idempotencyKey) {
      setIdempotencyRecord(idempotencyKey, response);
    }

    res.status(201).json(response);
  } catch (error: any) {
    logger.error('Error submitting verification request:', error);
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

/**
 * GET /v1/verify/:taskId
 * Backward-compatible alias for task status
 */
router.get('/:taskId', async (req: Request, res: Response) => {
  res.redirect(307, `/v1/tasks/${req.params.taskId}`);
});

export { router as verifyV1Routes, verdictFromScore, buildTimings };
