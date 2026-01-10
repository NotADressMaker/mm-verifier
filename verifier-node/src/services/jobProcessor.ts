import Queue from 'bull';
import { logger } from '../utils/logger';
import { queryMultipleModels } from '../llm-providers/modelRouter';
import { scoreVerification } from '../scoring/scorer';
import { createEvidenceBundle } from '../evidence/evidenceBundler';
import { uploadEvidenceToIPFS } from '../evidence/ipfsStorage';
import {
  commitEvaluation,
  revealEvaluation,
  generateCommitHash,
  generateSalt,
  wallet,
} from './blockchain';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Job queue
const jobQueue = new Queue('verification-jobs', REDIS_URL);

// Store commit data for reveal phase
const commitStore = new Map<
  string,
  {
    salt: string;
    score: number;
    verdict: string;
    evidenceHash: string;
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

    logger.info('Processing verification job', {
      jobId,
      models,
      taskType,
    });

    try {
      // Step 1: Query all models
      logger.info('Querying models', { jobId, models });
      const responses = await queryMultipleModels(prompt, models);

      logger.info('Model queries completed', {
        jobId,
        responseCount: responses.length,
      });

      // Step 2: Score the verification
      logger.info('Scoring verification', { jobId });
      const scoringResult = await scoreVerification(prompt, responses, taskType);

      logger.info('Scoring completed', {
        jobId,
        score: scoringResult.score,
        verdict: scoringResult.verdict,
      });

      // Step 3: Create evidence bundle
      logger.info('Creating evidence bundle', { jobId });
      const evidenceBundle = createEvidenceBundle(
        jobId,
        wallet.address,
        prompt,
        promptHash,
        models,
        taskType,
        responses,
        scoringResult
      );

      // Step 4: Upload evidence to IPFS
      logger.info('Uploading evidence to IPFS', { jobId });
      const evidenceCid = await uploadEvidenceToIPFS(evidenceBundle);
      const evidenceHash = `0x${evidenceBundle.bundleHash}`;

      logger.info('Evidence uploaded', {
        jobId,
        cid: evidenceCid,
        hash: evidenceHash,
      });

      // Step 5: Generate commitment
      const salt = generateSalt();
      const commitHash = generateCommitHash(
        jobId,
        wallet.address,
        salt,
        scoringResult.score,
        scoringResult.verdict,
        evidenceHash
      );

      // Store commit data for reveal
      commitStore.set(jobId, {
        salt,
        score: scoringResult.score,
        verdict: scoringResult.verdict,
        evidenceHash,
      });

      logger.info('Generated commitment', { jobId, commitHash });

      // Step 6: Submit commitment to blockchain
      logger.info('Submitting commitment', { jobId });
      await commitEvaluation(jobId, commitHash);

      logger.info('Commitment submitted successfully', { jobId });

      // Schedule reveal (after commit phase ends)
      // In production, this would listen to blockchain events
      // For now, we'll wait a fixed period
      const revealDelay = parseInt(process.env.REVEAL_DELAY_MS || '3700000'); // ~1 hour

      logger.info('Scheduling reveal', { jobId, delayMs: revealDelay });

      setTimeout(async () => {
        await revealEvaluationForJob(jobId);
      }, revealDelay);

      return {
        success: true,
        jobId,
        score: scoringResult.score,
        verdict: scoringResult.verdict,
        evidenceHash,
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
    const commitData = commitStore.get(jobId);

    if (!commitData) {
      logger.error('No commit data found for reveal', { jobId });
      return;
    }

    logger.info('Revealing evaluation', {
      jobId,
      score: commitData.score,
      verdict: commitData.verdict,
    });

    await revealEvaluation(
      jobId,
      commitData.score,
      commitData.verdict,
      commitData.evidenceHash,
      commitData.salt
    );

    logger.info('Evaluation revealed successfully', { jobId });

    // Clean up commit store
    commitStore.delete(jobId);
  } catch (error: any) {
    logger.error('Failed to reveal evaluation', { jobId, error: error.message });
  }
}

export { jobQueue };
