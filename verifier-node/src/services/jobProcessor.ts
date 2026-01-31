import Queue from 'bull';
import { logger } from '../utils/logger';
import { queryMultipleModels } from '../llm-providers/modelRouter';
import { scoreVerification } from '../scoring/scorer';
import { createEvidenceBundle } from '../evidence/evidenceBundler';
import { hashEvidenceBundle } from '../evidence/evidenceBundlerV2';
import { uploadEvidenceToIPFS } from '../evidence/ipfsStorage';
import {
  commitEvaluation,
  revealEvaluation,
  generateCommitHash,
  generateSalt,
  wallet,
} from './blockchain';
import { toScoreBps } from '../utils/score';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Job queue
const jobQueue = new Queue('verification-jobs', REDIS_URL);

// Store commit data for reveal phase
const commitStore = new Map<
  string,
  {
    salt: string;
    scoreBps: number;
    bundleHash: string;
    bundleURI: string;
  }
>();

/**
 * Start job processor
 */
export async function startJobProcessor() {
  logger.info('Starting job processor');

  // Process verification jobs
  jobQueue.process('verify', async (job) => {
    const { jobId, prompt, promptHash, models, taskType } = job.data;
    const jobStart = Date.now();

    logger.info('Processing verification job', {
      jobId,
      models,
      taskType,
    });

    try {
      // Step 1: Query all models
      logger.info('Querying models', { jobId, models });
      const queryStart = Date.now();
      const responses = await queryMultipleModels(prompt, models);
      logger.info('Timing: model queries', {
        jobId,
        durationMs: Date.now() - queryStart,
      });

      logger.info('Model queries completed', {
        jobId,
        responseCount: responses.length,
      });

      // Step 2: Score the verification
      logger.info('Scoring verification', { jobId });
      const scoringStart = Date.now();
      const scoringResult = await scoreVerification(prompt, responses, taskType);
      logger.info('Timing: scoring', {
        jobId,
        durationMs: Date.now() - scoringStart,
      });

      logger.info('Scoring completed', {
        jobId,
        score: scoringResult.score,
        verdict: scoringResult.verdict,
      });

      // Step 3: Create evidence bundle
      logger.info('Creating evidence bundle', { jobId });
      const bundleStart = Date.now();
      const nodeId = process.env.VERIFIER_NODE_ID || 'default';
      const marketplaceAddress = process.env.MARKETPLACE_ADDRESS || '';
      const evidenceBundle = await createEvidenceBundle({
        taskId: jobId,
        nodeId,
        ethAddress: wallet.address,
        promptHash,
        responses,
        scoringResult,
        wallet,
        marketplaceAddress,
      });
      logger.info('Timing: evidence bundle', {
        jobId,
        durationMs: Date.now() - bundleStart,
      });

      // Step 4: Upload evidence to IPFS
      logger.info('Uploading evidence to IPFS', { jobId });
      const uploadStart = Date.now();
      const evidenceCid = await uploadEvidenceToIPFS(evidenceBundle);
      const { signatures, ...bundleWithoutSig } = evidenceBundle;
      const bundleHash = hashEvidenceBundle(bundleWithoutSig);
      logger.info('Timing: ipfs upload', {
        jobId,
        durationMs: Date.now() - uploadStart,
      });

      logger.info('Evidence uploaded', {
        jobId,
        cid: evidenceCid,
        hash: bundleHash,
      });

      // Step 5: Generate commitment
      const commitPrepStart = Date.now();
      const salt = generateSalt();
      const scoreBps = toScoreBps(scoringResult.score);
      const commitHash = generateCommitHash(
        jobId,
        wallet.address,
        scoreBps,
        bundleHash,
        salt
      );
      logger.info('Timing: commitment prep', {
        jobId,
        durationMs: Date.now() - commitPrepStart,
      });

      // Store commit data for reveal
      commitStore.set(jobId, {
        salt,
        scoreBps,
        bundleHash,
        bundleURI: evidenceCid,
      });

      logger.info('Generated commitment', { jobId, commitHash });

      // Step 6: Submit commitment to blockchain
      logger.info('Submitting commitment', { jobId });
      const commitTxStart = Date.now();
      await commitEvaluation(jobId, commitHash);
      logger.info('Timing: commit tx', {
        jobId,
        durationMs: Date.now() - commitTxStart,
      });

      logger.info('Commitment submitted successfully', { jobId });

      // Schedule reveal (after commit phase ends)
      // In production, this would listen to blockchain events
      // For now, we'll wait a fixed period
      const revealDelay = parseInt(process.env.REVEAL_DELAY_MS || '3700000'); // ~1 hour

      logger.info('Scheduling reveal', { jobId, delayMs: revealDelay });

      setTimeout(async () => {
        await revealEvaluationForJob(jobId);
      }, revealDelay);

      logger.info('Timing: job total', {
        jobId,
        durationMs: Date.now() - jobStart,
      });

      return {
        success: true,
        jobId,
        scoreBps,
        bundleHash,
        bundleURI: evidenceCid,
        commitHash,
      };
    } catch (error: any) {
      logger.error('Job processing failed', { jobId, error: error.message });
      throw error;
    }
  });

  // Event handlers
  jobQueue.on('completed', (job, result) => {
    logger.info('Job completed', { jobId: job.id, result });
  });

  jobQueue.on('failed', (job, error) => {
    logger.error('Job failed', { jobId: job?.id, error: error.message });
  });

  logger.info('Job processor started and listening for jobs');
}

/**
 * Reveal evaluation for a job
 */
async function revealEvaluationForJob(jobId: string) {
  try {
    const revealStart = Date.now();
    const commitData = commitStore.get(jobId);

    if (!commitData) {
      logger.error('No commit data found for reveal', { jobId });
      return;
    }

    logger.info('Revealing evaluation', {
      jobId,
      scoreBps: commitData.scoreBps,
    });

    await revealEvaluation(
      jobId,
      commitData.scoreBps,
      commitData.bundleHash,
      commitData.bundleURI,
      commitData.salt
    );

    logger.info('Timing: reveal tx', {
      jobId,
      durationMs: Date.now() - revealStart,
    });

    logger.info('Evaluation revealed successfully', { jobId });

    // Clean up commit store
    commitStore.delete(jobId);
  } catch (error: any) {
    logger.error('Failed to reveal evaluation', { jobId, error: error.message });
  }
}

export { jobQueue };
