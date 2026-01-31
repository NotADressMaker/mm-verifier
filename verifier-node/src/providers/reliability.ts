/**
 * Provider Reliability Infrastructure for MMV
 *
 * Handles unreliable LLM providers with:
 * - Circuit breakers (fast-fail when error rates spike)
 * - Exponential backoff with jitter
 * - Idempotency keys (prevent duplicate work on retries)
 * - Cost accounting per provider/model
 * - Health monitoring and automatic failover
 */

import crypto from 'crypto';

export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Fast-fail (too many errors)
  HALF_OPEN = 'HALF_OPEN' // Testing if provider recovered
}

interface ProviderConfig {
  name: string;
  maxRetries: number;
  baseDelay: number;        // Base delay for exponential backoff (ms)
  maxDelay: number;         // Max delay cap (ms)
  timeout: number;          // Request timeout (ms)
  circuitThreshold: number; // Errors before opening circuit
  circuitWindow: number;    // Time window for error tracking (ms)
  circuitRecovery: number;  // Time before testing recovery (ms)
  costPerToken: number;     // Cost per token in USD
}

interface RequestMetrics {
  timestamp: number;
  duration: number;
  success: boolean;
  tokens?: number;
  cost?: number;
  error?: string;
}

interface ProviderHealth {
  state: CircuitState;
  errorCount: number;
  lastError?: number;
  lastSuccess?: number;
  totalRequests: number;
  successfulRequests: number;
  totalTokens: number;
  totalCost: number;
  avgLatency: number;
}

export class ProviderReliability {
  private configs: Map<string, ProviderConfig> = new Map();
  private health: Map<string, ProviderHealth> = new Map();
  private metrics: Map<string, RequestMetrics[]> = new Map();
  private idempotencyCache: Map<string, any> = new Map();

  constructor() {
    // Default configurations for common providers
    this.registerProvider({
      name: 'openai',
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      timeout: 30000,
      circuitThreshold: 5,
      circuitWindow: 60000,
      circuitRecovery: 30000,
      costPerToken: 0.00003, // GPT-4 pricing
    });

    this.registerProvider({
      name: 'anthropic',
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      timeout: 30000,
      circuitThreshold: 5,
      circuitWindow: 60000,
      circuitRecovery: 30000,
      costPerToken: 0.000015, // Claude-3 pricing
    });

    this.registerProvider({
      name: 'google',
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      timeout: 30000,
      circuitThreshold: 5,
      circuitWindow: 60000,
      circuitRecovery: 30000,
      costPerToken: 0.0000125, // Gemini pricing
    });
  }

  /**
   * Register a provider with configuration
   */
  registerProvider(config: ProviderConfig): void {
    this.configs.set(config.name, config);
    this.health.set(config.name, {
      state: CircuitState.CLOSED,
      errorCount: 0,
      totalRequests: 0,
      successfulRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      avgLatency: 0,
    });
    this.metrics.set(config.name, []);
  }

  /**
   * Execute a request with reliability features
   */
  async execute<T>(
    provider: string,
    requestFn: () => Promise<T>,
    options: {
      idempotencyKey?: string;
      estimatedTokens?: number;
    } = {}
  ): Promise<T> {
    const config = this.configs.get(provider);
    const health = this.health.get(provider);

    if (!config || !health) {
      throw new Error(`Unknown provider: ${provider}`);
    }

    // Check idempotency cache
    if (options.idempotencyKey) {
      const cached = this.idempotencyCache.get(options.idempotencyKey);
      if (cached) {
        console.log(`✓ Returning cached result for ${options.idempotencyKey}`);
        return cached;
      }
    }

    // Check circuit breaker
    this.updateCircuitState(provider);

    if (health.state === CircuitState.OPEN) {
      throw new Error(`Circuit breaker OPEN for provider: ${provider}`);
    }

    // Execute with retries
    let lastError: Error | null = null;
    const startTime = Date.now();

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        // Add timeout
        const result = await this.withTimeout(requestFn(), config.timeout);

        // Record success
        this.recordSuccess(provider, Date.now() - startTime, options.estimatedTokens);

        // Cache result if idempotency key provided
        if (options.idempotencyKey) {
          this.idempotencyCache.set(options.idempotencyKey, result);
          // Clean cache after 1 hour
          setTimeout(() => {
            this.idempotencyCache.delete(options.idempotencyKey!);
          }, 3600000);
        }

        return result;

      } catch (error: any) {
        lastError = error;

        // Record failure
        this.recordFailure(provider, Date.now() - startTime, error.message);

        // Don't retry on certain errors
        if (this.isNonRetryableError(error)) {
          throw error;
        }

        // Calculate backoff delay
        if (attempt < config.maxRetries) {
          const delay = this.calculateBackoff(attempt, config);
          console.log(`⚠️  Retry ${attempt + 1}/${config.maxRetries} for ${provider} after ${delay}ms`);
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error(`Failed after ${config.maxRetries} retries`);
  }

  /**
   * Calculate exponential backoff with jitter
   */
  private calculateBackoff(attempt: number, config: ProviderConfig): number {
    const exponential = Math.min(
      config.baseDelay * Math.pow(2, attempt),
      config.maxDelay
    );

    // Add jitter (±25%)
    const jitter = exponential * (0.75 + Math.random() * 0.5);

    return Math.floor(jitter);
  }

  /**
   * Add timeout to promise
   */
  private withTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), timeout)
      ),
    ]);
  }

  /**
   * Check if error should not be retried
   */
  private isNonRetryableError(error: any): boolean {
    const message = error.message?.toLowerCase() || '';

    // Don't retry on:
    // - Authentication errors
    // - Invalid request errors
    // - Resource not found
    return (
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('invalid') ||
      message.includes('not found') ||
      error.status === 401 ||
      error.status === 403 ||
      error.status === 404
    );
  }

  /**
   * Record successful request
   */
  private recordSuccess(provider: string, duration: number, tokens?: number): void {
    const health = this.health.get(provider)!;
    const config = this.configs.get(provider)!;
    const metrics = this.metrics.get(provider)!;

    health.totalRequests++;
    health.successfulRequests++;
    health.lastSuccess = Date.now();
    health.errorCount = Math.max(0, health.errorCount - 1); // Decay error count

    if (tokens) {
      health.totalTokens += tokens;
      health.totalCost += tokens * config.costPerToken;
    }

    // Update average latency
    health.avgLatency =
      (health.avgLatency * (health.successfulRequests - 1) + duration) /
      health.successfulRequests;

    // Record metrics
    metrics.push({
      timestamp: Date.now(),
      duration,
      success: true,
      tokens,
      cost: tokens ? tokens * config.costPerToken : undefined,
    });

    // Limit metrics history (keep last 1000)
    if (metrics.length > 1000) {
      metrics.shift();
    }
  }

  /**
   * Record failed request
   */
  private recordFailure(provider: string, duration: number, error: string): void {
    const health = this.health.get(provider)!;
    const metrics = this.metrics.get(provider)!;

    health.totalRequests++;
    health.errorCount++;
    health.lastError = Date.now();

    metrics.push({
      timestamp: Date.now(),
      duration,
      success: false,
      error,
    });

    if (metrics.length > 1000) {
      metrics.shift();
    }
  }

  /**
   * Update circuit breaker state
   */
  private updateCircuitState(provider: string): void {
    const config = this.configs.get(provider)!;
    const health = this.health.get(provider)!;
    const now = Date.now();

    // Check if circuit should open
    if (health.state === CircuitState.CLOSED) {
      // Count recent errors
      const recentErrors = this.metrics
        .get(provider)!
        .filter(m => !m.success && now - m.timestamp < config.circuitWindow)
        .length;

      if (recentErrors >= config.circuitThreshold) {
        health.state = CircuitState.OPEN;
        console.log(`⚠️  Circuit breaker OPEN for ${provider} (${recentErrors} errors)`);
      }
    }

    // Check if circuit should transition to half-open
    else if (health.state === CircuitState.OPEN) {
      if (health.lastError && now - health.lastError > config.circuitRecovery) {
        health.state = CircuitState.HALF_OPEN;
        console.log(`🔄 Circuit breaker HALF_OPEN for ${provider} (testing recovery)`);
      }
    }

    // Check if circuit should close
    else if (health.state === CircuitState.HALF_OPEN) {
      if (health.lastSuccess && health.lastSuccess > (health.lastError || 0)) {
        health.state = CircuitState.CLOSED;
        health.errorCount = 0;
        console.log(`✓ Circuit breaker CLOSED for ${provider} (recovered)`);
      }
    }
  }

  /**
   * Get provider health status
   */
  getHealth(provider: string): ProviderHealth | null {
    return this.health.get(provider) || null;
  }

  /**
   * Get all provider health statuses
   */
  getAllHealth(): Map<string, ProviderHealth> {
    return new Map(this.health);
  }

  /**
   * Get cost statistics
   */
  getCostStats(): Record<string, {
    totalCost: number;
    totalTokens: number;
    avgCostPerRequest: number;
  }> {
    const stats: any = {};

    for (const [provider, health] of this.health.entries()) {
      stats[provider] = {
        totalCost: health.totalCost,
        totalTokens: health.totalTokens,
        avgCostPerRequest:
          health.successfulRequests > 0
            ? health.totalCost / health.successfulRequests
            : 0,
      };
    }

    return stats;
  }

  /**
   * Reset circuit breaker for a provider
   */
  resetCircuit(provider: string): void {
    const health = this.health.get(provider);
    if (health) {
      health.state = CircuitState.CLOSED;
      health.errorCount = 0;
      console.log(`✓ Circuit reset for ${provider}`);
    }
  }

  /**
   * Generate idempotency key
   */
  static generateIdempotencyKey(payload: any): string {
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(payload));
    return hash.digest('hex');
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Print health dashboard
   */
  printHealthDashboard(): void {
    console.log('\n' + '='.repeat(80));
    console.log('🏥 PROVIDER HEALTH DASHBOARD');
    console.log('='.repeat(80) + '\n');

    for (const [provider, health] of this.health.entries()) {
      const successRate =
        health.totalRequests > 0
          ? (health.successfulRequests / health.totalRequests) * 100
          : 0;

      const stateEmoji = {
        [CircuitState.CLOSED]: '🟢',
        [CircuitState.HALF_OPEN]: '🟡',
        [CircuitState.OPEN]: '🔴',
      }[health.state];

      console.log(`${provider.toUpperCase()}:`);
      console.log(`  State:         ${stateEmoji} ${health.state}`);
      console.log(`  Requests:      ${health.totalRequests} (${health.successfulRequests} successful)`);
      console.log(`  Success Rate:  ${successRate.toFixed(1)}%`);
      console.log(`  Avg Latency:   ${health.avgLatency.toFixed(0)}ms`);
      console.log(`  Total Cost:    $${health.totalCost.toFixed(4)}`);
      console.log(`  Total Tokens:  ${health.totalTokens.toLocaleString()}`);
      console.log('');
    }

    console.log('='.repeat(80) + '\n');
  }
}

export default ProviderReliability;
