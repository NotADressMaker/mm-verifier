import { createHash } from 'crypto';
import { getRedisClient } from './redis';
import { logger } from '../utils/logger';

/**
 * Request Deduplication Service
 *
 * Performance Benefits:
 * - Prevent duplicate verification work for identical requests
 * - Return cached results instantly for repeated queries
 * - Reduce API costs and LLM provider load
 * - Protect against accidental request floods
 * - Idempotency guarantees for verification requests
 */

interface DeduplicationResult {
  isDuplicate: boolean;
  existingJobId?: string;
  taskHash: string;
}

interface PendingRequest {
  jobId: string;
  status: 'pending' | 'processing' | 'completed';
  timestamp: number;
  requester: string;
}

/**
 * Generate task hash from prompt and response
 */
export function generateTaskHash(prompt: string, response: string): string {
  const hash = createHash('sha256');
  hash.update(`${prompt}:${response}`);
  return hash.digest('hex');
}

/**
 * Check if request is a duplicate and return existing job if so
 */
export async function checkDuplicateRequest(
  prompt: string,
  response: string,
  requester: string
): Promise<DeduplicationResult> {
  const taskHash = generateTaskHash(prompt, response);

  try {
    const redis = getRedisClient();

    // Check if this exact task is already being processed or completed
    const existingKey = await redis.get(`task:${taskHash}`);

    if (existingKey) {
      const existing: PendingRequest = JSON.parse(existingKey);

      logger.info('Duplicate request detected', {
        taskHash,
        existingJobId: existing.jobId,
        existingStatus: existing.status,
        age: Date.now() - existing.timestamp,
      });

      return {
        isDuplicate: true,
        existingJobId: existing.jobId,
        taskHash,
      };
    }

    return {
      isDuplicate: false,
      taskHash,
    };
  } catch (error: any) {
    logger.error('Failed to check duplicate request:', error);
    // If Redis fails, allow the request to proceed
    return {
      isDuplicate: false,
      taskHash,
    };
  }
}

/**
 * Register a new request to prevent duplicates
 */
export async function registerRequest(
  taskHash: string,
  jobId: string,
  requester: string,
  ttl: number = 3600 // 1 hour default
): Promise<void> {
  try {
    const redis = getRedisClient();

    const requestData: PendingRequest = {
      jobId,
      status: 'pending',
      timestamp: Date.now(),
      requester,
    };

    // Store with TTL
    await redis.setEx(
      `task:${taskHash}`,
      ttl,
      JSON.stringify(requestData)
    );

    logger.debug('Request registered for deduplication', {
      taskHash,
      jobId,
      ttl,
    });
  } catch (error: any) {
    logger.error('Failed to register request:', error);
    // Non-critical - don't throw
  }
}

/**
 * Update request status
 */
export async function updateRequestStatus(
  taskHash: string,
  status: 'pending' | 'processing' | 'completed'
): Promise<void> {
  try {
    const redis = getRedisClient();

    const existingKey = await redis.get(`task:${taskHash}`);
    if (!existingKey) {
      logger.warn('Attempted to update non-existent request', { taskHash });
      return;
    }

    const existing: PendingRequest = JSON.parse(existingKey);
    existing.status = status;

    // Get remaining TTL
    const ttl = await redis.ttl(`task:${taskHash}`);
    if (ttl > 0) {
      await redis.setEx(
        `task:${taskHash}`,
        ttl,
        JSON.stringify(existing)
      );
    }

    logger.debug('Request status updated', { taskHash, status });
  } catch (error: any) {
    logger.error('Failed to update request status:', error);
  }
}

/**
 * Remove request from deduplication cache
 */
export async function removeRequest(taskHash: string): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.del(`task:${taskHash}`);

    logger.debug('Request removed from deduplication cache', { taskHash });
  } catch (error: any) {
    logger.error('Failed to remove request:', error);
  }
}

/**
 * Get all pending requests for a requester
 */
export async function getRequesterPendingRequests(
  requester: string
): Promise<PendingRequest[]> {
  try {
    const redis = getRedisClient();

    // Scan for all task keys
    const keys: string[] = [];
    let cursor = 0;

    do {
      const result = await redis.scan(cursor, {
        MATCH: 'task:*',
        COUNT: 100,
      });

      cursor = result.cursor;
      keys.push(...result.keys);
    } while (cursor !== 0);

    // Filter by requester
    const pendingRequests: PendingRequest[] = [];

    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        const request: PendingRequest = JSON.parse(data);
        if (request.requester === requester && request.status !== 'completed') {
          pendingRequests.push(request);
        }
      }
    }

    return pendingRequests;
  } catch (error: any) {
    logger.error('Failed to get requester pending requests:', error);
    return [];
  }
}

/**
 * Rate limiting: Check if requester has exceeded concurrent request limit
 */
export async function checkRateLimit(
  requester: string,
  maxConcurrent: number = 5
): Promise<{ allowed: boolean; current: number; limit: number }> {
  try {
    const pendingRequests = await getRequesterPendingRequests(requester);
    const current = pendingRequests.length;
    const allowed = current < maxConcurrent;

    if (!allowed) {
      logger.warn('Rate limit exceeded', {
        requester,
        current,
        limit: maxConcurrent,
      });
    }

    return {
      allowed,
      current,
      limit: maxConcurrent,
    };
  } catch (error: any) {
    logger.error('Failed to check rate limit:', error);
    // On error, allow the request
    return {
      allowed: true,
      current: 0,
      limit: maxConcurrent,
    };
  }
}

/**
 * Clean up expired requests (for maintenance)
 */
export async function cleanupExpiredRequests(): Promise<number> {
  try {
    const redis = getRedisClient();

    let cleaned = 0;
    let cursor = 0;

    do {
      const result = await redis.scan(cursor, {
        MATCH: 'task:*',
        COUNT: 100,
      });

      cursor = result.cursor;

      for (const key of result.keys) {
        const ttl = await redis.ttl(key);
        if (ttl === -1) {
          // No TTL set, remove it
          await redis.del(key);
          cleaned++;
        }
      }
    } while (cursor !== 0);

    if (cleaned > 0) {
      logger.info('Cleaned up expired deduplication requests', { cleaned });
    }

    return cleaned;
  } catch (error: any) {
    logger.error('Failed to cleanup expired requests:', error);
    return 0;
  }
}

// Run cleanup every hour
setInterval(() => {
  cleanupExpiredRequests();
}, 60 * 60 * 1000);

export { PendingRequest, DeduplicationResult };
