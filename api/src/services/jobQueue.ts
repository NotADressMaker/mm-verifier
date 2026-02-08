import Queue from 'bull';
import { logger } from '../utils/logger';
import { apiMetrics } from '../observability/metrics';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Create job queue
export const verificationQueue = new Queue('verification-jobs', REDIS_URL);

/**
 * Queue a verification job for processing
 */
export async function queueVerificationJob(jobData: {
  jobId: string;
  prompt: string;
  promptHash: string;
  models: string[];
  taskType: string;
  deadline: number;
  programId?: string;
  programVersion?: string;
  storeEvidence?: boolean;
  requestId?: string;
  traceContext?: {
    trace_id: string;
    span_id: string;
    request_id?: string;
  };
  enqueuedAt?: number;
}) {
  try {
    const job = await verificationQueue.add('verify', jobData, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: false,
      removeOnFail: false,
    });

    logger.info('Job queued for verification', {
      jobId: jobData.jobId,
      queueJobId: job.id,
    });

    apiMetrics.metrics.queueDepth.labels('verification-jobs').set?.(
      await verificationQueue.getWaitingCount()
    );

    return job;
  } catch (error) {
    logger.error('Failed to queue verification job:', error);
    throw error;
  }
}

/**
 * Process verification jobs
 * Note: This would typically run in the verifier node, not the API
 */
verificationQueue.process('verify', async (job) => {
  logger.info('Processing verification job', { jobId: job.data.jobId });

  // This is a placeholder - actual processing happens in verifier nodes
  // The API just queues the jobs

  return { status: 'queued', jobId: job.data.jobId };
});

// Queue event handlers
verificationQueue.on('completed', (job, result) => {
  logger.info('Job completed', { jobId: job.id, result });
});

verificationQueue.on('failed', (job, err) => {
  logger.error('Job failed', { jobId: job?.id, error: err.message });
});

verificationQueue.on('error', (error) => {
  logger.error('Queue error:', error);
});

setInterval(async () => {
  try {
    const [waiting, active] = await Promise.all([
      verificationQueue.getWaitingCount(),
      verificationQueue.getActiveCount(),
    ]);
    apiMetrics.metrics.queueDepth.labels('verification-jobs').set?.(waiting);
    apiMetrics.metrics.activeJobs.set?.(active);
  } catch (error) {
    logger.error('Failed to collect queue metrics', { error });
  }
}, 5000);
