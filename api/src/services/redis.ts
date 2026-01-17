import { createClient } from 'redis';
import { createHash } from 'crypto';
import { logger } from '../utils/logger';

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
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    logger.error('Failed to get cached job result:', error);
    return null;
  }
}

/**
 * Generic query result caching with automatic key generation
 *
 * Performance Benefits:
 * - Cache frequently accessed database queries
 * - Reduce database load
 * - Faster response times for repeated queries
 * - Automatic cache invalidation with TTL
 */

/**
 * Generate cache key from query parameters
 */
function generateCacheKey(namespace: string, params: any): string {
  const hash = createHash('sha256');
  hash.update(JSON.stringify(params));
  return `cache:${namespace}:${hash.digest('hex')}`;
}

/**
 * Cached query executor
 * Wraps a database query with Redis caching
 */
export async function cachedQuery<T>(
  namespace: string,
  params: any,
  queryFn: () => Promise<T>,
  ttl: number = 300 // 5 minutes default
): Promise<T> {
  const cacheKey = generateCacheKey(namespace, params);

  try {
    // Try to get from cache first
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      logger.debug('Cache hit', { namespace, cacheKey });
      return JSON.parse(cached);
    }

    logger.debug('Cache miss', { namespace, cacheKey });

    // Execute query
    const result = await queryFn();

    // Store in cache
    await redisClient.setEx(cacheKey, ttl, JSON.stringify(result));

    return result;
  } catch (error) {
    logger.error('Cached query failed:', error);
    // Fallback to direct query on cache error
    return await queryFn();
  }
}

/**
 * Invalidate cache by namespace
 */
export async function invalidateCache(namespace: string): Promise<void> {
  try {
    let cursor = 0;
    let deleted = 0;

    do {
      const result = await redisClient.scan(cursor, {
        MATCH: `cache:${namespace}:*`,
        COUNT: 100,
      });

      cursor = result.cursor;

      if (result.keys.length > 0) {
        await redisClient.del(result.keys);
        deleted += result.keys.length;
      }
    } while (cursor !== 0);

    if (deleted > 0) {
      logger.info('Cache invalidated', { namespace, deleted });
    }
  } catch (error) {
    logger.error('Failed to invalidate cache:', error);
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  keys: number;
  memory: string;
  hitRate?: number;
}> {
  try {
    const info = await redisClient.info('stats');
    const keyspace = await redisClient.info('keyspace');

    // Parse keyspace info to count keys
    const keyspaceMatch = keyspace.match(/keys=(\d+)/);
    const keys = keyspaceMatch ? parseInt(keyspaceMatch[1]) : 0;

    // Parse memory info
    const memoryMatch = info.match(/used_memory_human:([^\r\n]+)/);
    const memory = memoryMatch ? memoryMatch[1] : 'unknown';

    return { keys, memory };
  } catch (error) {
    logger.error('Failed to get cache stats:', error);
    return { keys: 0, memory: 'unknown' };
  }
}

export { redisClient };
