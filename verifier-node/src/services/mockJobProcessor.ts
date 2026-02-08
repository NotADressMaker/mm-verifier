import Queue from 'bull';
import { createClient } from 'redis';
import { logger } from '../utils/logger';
import {
  buildMockDisputeEvents,
  buildMockEvidenceBundle,
  buildMockReceipt,
  computeMockBundleHash,
  deriveDeterministicScore,
  resolveMockScenario,
  MockJobRecord,
  MockJobStatus,
  MOCK_REDIS_KEYS,
} from '../../../shared/mockVerifier';
import { hashUtf8 } from '../../../shared/canonicalJson';
import { validateEvidenceBundlePayload, validateReceiptPayload } from '../../../shared/schemaValidation';
import { encryptEvidenceBlob } from '../../../shared/evidenceEncryption';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const jobQueue = new Queue('verification-jobs', REDIS_URL);

const redisClient = createClient({ url: REDIS_URL });

async function updateJobStatus(
  jobId: string,
  status: MockJobStatus,
  extras?: Partial<MockJobRecord>
): Promise<void> {
  const raw = await redisClient.get(MOCK_REDIS_KEYS.job(jobId));
  if (!raw) {
    logger.warn('Mock job missing from store', { jobId });
    return;
  }

  const record = JSON.parse(raw) as MockJobRecord;
  const now = new Date().toISOString();
  const statusHistory = [...record.statusHistory, { status, timestamp: now }];
  const updated: MockJobRecord = {
    ...record,
    status,
    updatedAt: now,
    statusHistory,
    ...extras,
  };

  await redisClient.set(MOCK_REDIS_KEYS.job(jobId), JSON.stringify(updated));
}

async function storeMockArtifacts(params: {
  jobId: string;
  receipt: unknown;
  bundle: unknown;
  disputes: unknown[];
  encryptedEvidence?: unknown;
}): Promise<void> {
  await redisClient.set(MOCK_REDIS_KEYS.receipt(params.jobId), JSON.stringify(params.receipt));
  if (params.encryptedEvidence) {
    await redisClient.set(
      MOCK_REDIS_KEYS.bundle(params.jobId),
      JSON.stringify(params.encryptedEvidence)
    );
  }
  await redisClient.set(MOCK_REDIS_KEYS.disputes(params.jobId), JSON.stringify(params.disputes));
}

export async function startMockJobProcessor(): Promise<void> {
  await redisClient.connect();
  logger.info('Mock job processor connected to Redis');

  jobQueue.process('verify', async (job) => {
    const { jobId, prompt, promptHash, models, taskType, storeEvidence } = job.data as {
      jobId: string;
      prompt: string;
      promptHash: string;
      models: string[];
      taskType: string;
      storeEvidence?: boolean;
    };

    const scenario = resolveMockScenario(process.env.MOCK_SCENARIO);
    const delayMs = Number.parseInt(process.env.MOCK_VERIFIER_DELAY_MS || '150', 10);

    logger.info('Mock verifier processing job', { jobId, scenario, taskType, models });

    await updateJobStatus(jobId, 'running');

    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const rubricHash = hashUtf8(JSON.stringify({ taskType, models }));
    const scoreBps = deriveDeterministicScore(jobId, scenario);
    const nodeId = process.env.VERIFIER_NODE_ID || 'mock-node';
    const evaluatorAddress = process.env.VERIFIER_ADDRESS || '0x1111111111111111111111111111111111111111';

    const bundle = buildMockEvidenceBundle({
      taskId: jobId,
      prompt,
      promptHash,
      rubricHash,
      scoreBps,
      nodeId,
      evaluatorAddress,
    });

    const bundleValidation = validateEvidenceBundlePayload(bundle);
    if (!bundleValidation.valid) {
      logger.error('Mock evidence bundle schema invalid', {
        jobId,
        errors: bundleValidation.errors,
      });
      await updateJobStatus(jobId, 'failed');
      return { success: false };
    }

    const bundleHash = computeMockBundleHash(bundle);
    const hashedOnlyDefault = process.env.HASHED_ONLY_DEFAULT !== 'false';
    const shouldStoreEvidence = typeof storeEvidence === 'boolean' ? storeEvidence : !hashedOnlyDefault;
    const bundleUri = shouldStoreEvidence ? `encrypted+mock://bundle/${jobId}` : `hash-only://${bundleHash}`;
    const outputHash = bundle.model_runs[0]?.output_hash as `0x${string}`;

    const receipt = buildMockReceipt({
      taskId: jobId,
      inputHash: promptHash as `0x${string}`,
      outputHash,
      bundleHash,
      bundleUri,
      scoreBps,
      scenario,
      nodeId,
    });

    const receiptValidation = validateReceiptPayload(receipt);
    if (!receiptValidation.valid) {
      logger.error('Mock receipt schema invalid', {
        jobId,
        errors: receiptValidation.errors,
      });
      await updateJobStatus(jobId, 'failed');
      return { success: false };
    }

    const disputes = buildMockDisputeEvents({ taskId: jobId, scenario });

    let encryptedEvidence: Record<string, unknown> | undefined;
    if (shouldStoreEvidence) {
      const masterKey = process.env.EVIDENCE_MASTER_KEY_BASE64;
      if (!masterKey) {
        throw new Error('EVIDENCE_MASTER_KEY_BASE64 is required for encrypted evidence storage');
      }
      const blob = encryptEvidenceBlob({
        plaintext: Buffer.from(JSON.stringify(bundle), 'utf8'),
        master_key: Buffer.from(masterKey, 'base64'),
        bundle_hash: bundleHash,
        key_version: process.env.EVIDENCE_KEY_VERSION || 'v1',
      });
      encryptedEvidence = {
        stored_at: Date.now(),
        bundle_hash: bundleHash,
        encryption: blob,
      };
    }

    await storeMockArtifacts({
      jobId,
      receipt,
      bundle,
      disputes,
      encryptedEvidence,
    });

    const finalStatus: MockJobStatus = scenario === 'fail' ? 'failed' : 'completed';
    await updateJobStatus(jobId, finalStatus, {
      scoreBps,
      verdict: receipt.verdict,
      disputed: disputes.length > 0,
    });

    logger.info('Mock verifier completed job', { jobId, scoreBps });

    return {
      success: true,
      jobId,
      scoreBps,
      bundleHash,
      bundleUri,
    };
  });

  jobQueue.on('completed', (job, result) => {
    logger.info('Mock job completed', { jobId: job?.data?.jobId, result });
  });

  jobQueue.on('failed', (job, error) => {
    logger.error('Mock job failed', { jobId: job?.data?.jobId, error: error.message });
  });

  logger.info('Mock job processor started');
}
