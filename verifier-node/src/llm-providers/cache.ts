import { createHash } from 'crypto';
import { logger } from '../utils/logger';

/**
 * In-memory LRU cache for LLM responses
 *
 * Performance Benefits:
 * - Avoid redundant API calls for identical prompts
 * - Reduce latency for repeated queries
 * - Lower API costs
 * - Configurable TTL and max size
 */

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
}

export class LLMCache<T> {
  private cache: Map<string, CacheEntry<T>>;
  private maxSize: number;
  private ttl: number; // Time to live in milliseconds
  private hits: number = 0;
  private misses: number = 0;

  constructor(maxSize: number = 1000, ttlSeconds: number = 3600) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttlSeconds * 1000;
  }

  /**
   * Generate cache key from prompt and model
   */
  private generateKey(prompt: string, model: string): string {
    const hash = createHash('sha256');
    hash.update(`${prompt}:${model}`);
    return hash.digest('hex');
  }

  /**
   * Get cached response
   */
  get(prompt: string, model: string): T | null {
    const key = this.generateKey(prompt, model);
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    // Check if expired
    const now = Date.now();
    if (now - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    // Update access stats
    entry.accessCount++;
    entry.lastAccessed = now;
    this.hits++;

    logger.debug('LLM cache hit', {
      model,
      promptLength: prompt.length,
      age: Math.round((now - entry.timestamp) / 1000),
    });

    return entry.value;
  }

  /**
   * Set cached response
   */
  set(prompt: string, model: string, value: T): void {
    const key = this.generateKey(prompt, model);

    // Evict oldest entries if cache is full
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    const now = Date.now();
    this.cache.set(key, {
      value,
      timestamp: now,
      accessCount: 1,
      lastAccessed: now,
    });

    logger.debug('LLM cache set', {
      model,
      promptLength: prompt.length,
      cacheSize: this.cache.size,
    });
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      logger.debug('LLM cache evicted LRU entry');
    }
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    logger.info('LLM cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const hitRate = this.hits + this.misses > 0
      ? this.hits / (this.hits + this.misses)
      : 0;

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: Math.round(hitRate * 100) / 100,
    };
  }

  /**
   * Remove expired entries
   */
  prune(): void {
    const now = Date.now();
    let pruned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
        pruned++;
      }
    }

    if (pruned > 0) {
      logger.info('LLM cache pruned', { pruned, remaining: this.cache.size });
    }
  }
}

// Global cache instance
const llmCache = new LLMCache(
  parseInt(process.env.LLM_CACHE_SIZE || '1000'),
  parseInt(process.env.LLM_CACHE_TTL || '3600')
);

// Prune expired entries every 5 minutes
setInterval(() => {
  llmCache.prune();
}, 5 * 60 * 1000);

export { llmCache };
