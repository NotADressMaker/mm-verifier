import { createClient } from 'redis';
import { logger } from '../utils/logger';
import { apiMetrics } from '../observability/metrics';

let redisClient: ReturnType<typeof createClient>;

/**
 * Initialize Redis connection
 */
export async function initializeRedis() {
  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    redisClient = createClient({
      url: redisUrl,
    });

    redisClient.on('error', (err) => {
      logger.error('Redis client error:', err);
    });

    redisClient.on('connect', () => {
      logger.info('Redis client connected');
    });

    await redisClient.connect();
  } catch (error) {
    logger.error('Failed to initialize Redis:', error);
    throw error;
  }
}

/**
 * Get Redis client
 */
export function getRedisClient() {
  if (!redisClient) {
    throw new Error('Redis client not initialized');
  }
  return redisClient;
}

/**
 * Cache job result
 */
export async function cacheJobResult(jobId: string, result: any, ttl: number = 3600) {
  try {
    await redisClient.setEx(`job:${jobId}`, ttl, JSON.stringify(result));
  } catch (error) {
    logger.error('Failed to cache job result:', error);
  }
}

/**
 * Get cached job result
 */
export async function getCachedJobResult(jobId: string) {
  try {
    const cached = await redisClient.get(`job:${jobId}`);
    if (cached) {
      apiMetrics.metrics.cacheHitsTotal.labels('job').inc?.();
    } else {
      apiMetrics.metrics.cacheMissesTotal.labels('job').inc?.();
    }
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    logger.error('Failed to get cached job result:', error);
    return null;
  }
}

export { redisClient };
