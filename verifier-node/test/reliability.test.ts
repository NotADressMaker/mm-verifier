/**
 * Provider Reliability Tests
 *
 * Tests the circuit breaker and reliability infrastructure including:
 * - Circuit breaker state transitions
 * - Exponential backoff with jitter
 * - Idempotency key handling
 * - Cost accounting
 * - Health monitoring
 * - Retry logic
 */

import { expect } from 'chai';
import { ProviderReliability, CircuitState, ProviderConfig } from '../src/providers/reliability';

describe('ProviderReliability', () => {
  let reliability: ProviderReliability;

  beforeEach(() => {
    reliability = new ProviderReliability();
  });

  // ============================================================================
  // CIRCUIT BREAKER TESTS
  // ============================================================================

  describe('Circuit Breaker', () => {
    it('Should start in CLOSED state', () => {
      const health = reliability.getHealth('openai');
      expect(health.state).to.equal(CircuitState.CLOSED);
    });

    it('Should open circuit after threshold failures', async () => {
      // Trigger 5 consecutive failures
      for (let i = 0; i < 5; i++) {
        try {
          await reliability.execute('openai', async () => {
            throw new Error('Provider error');
          });
        } catch (e) {
          // Expected
        }
      }

      const health = reliability.getHealth('openai');
      expect(health.state).to.equal(CircuitState.OPEN);
    });

    it('Should reject requests when circuit is OPEN', async () => {
      // Force circuit open
      for (let i = 0; i < 5; i++) {
        try {
          await reliability.execute('openai', async () => {
            throw new Error('Provider error');
          });
        } catch (e) {}
      }

      // Next request should be rejected immediately
      await expect(
        reliability.execute('openai', async () => 'success')
      ).to.be.rejectedWith('Circuit breaker OPEN');
    });

    it('Should transition to HALF_OPEN after cooldown', async function () {
      this.timeout(3000);

      // Open circuit
      for (let i = 0; i < 5; i++) {
        try {
          await reliability.execute('openai', async () => {
            throw new Error('Provider error');
          });
        } catch (e) {}
      }

      // Wait for cooldown (default: 60s, but test with shorter)
      // Note: In practice, configure shorter cooldown for tests
      reliability.updateConfig('openai', { cooldownMs: 100 });

      await new Promise((resolve) => setTimeout(resolve, 150));

      reliability['updateCircuitState']('openai'); // Force state update

      const health = reliability.getHealth('openai');
      expect(health.state).to.equal(CircuitState.HALF_OPEN);
    });

    it('Should close circuit after successful request in HALF_OPEN', async () => {
      // Open circuit
      for (let i = 0; i < 5; i++) {
        try {
          await reliability.execute('openai', async () => {
            throw new Error('Provider error');
          });
        } catch (e) {}
      }

      // Force HALF_OPEN
      reliability.updateConfig('openai', { cooldownMs: 0 });
      reliability['updateCircuitState']('openai');

      // Successful request
      await reliability.execute('openai', async () => 'success');

      const health = reliability.getHealth('openai');
      expect(health.state).to.equal(CircuitState.CLOSED);
    });

    it('Should reopen circuit on failure in HALF_OPEN', async () => {
      // Open circuit
      for (let i = 0; i < 5; i++) {
        try {
          await reliability.execute('openai', async () => {
            throw new Error('Provider error');
          });
        } catch (e) {}
      }

      // Force HALF_OPEN
      reliability.updateConfig('openai', { cooldownMs: 0 });
      reliability['updateCircuitState']('openai');

      // Failed request
      try {
        await reliability.execute('openai', async () => {
          throw new Error('Still failing');
        });
      } catch (e) {}

      const health = reliability.getHealth('openai');
      expect(health.state).to.equal(CircuitState.OPEN);
    });
  });

  // ============================================================================
  // RETRY LOGIC TESTS
  // ============================================================================

  describe('Retry Logic', () => {
    it('Should retry on transient failures', async () => {
      let attempts = 0;

      const result = await reliability.execute('openai', async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Transient error');
        }
        return 'success';
      });

      expect(result).to.equal('success');
      expect(attempts).to.equal(3);
    });

    it('Should respect maxRetries config', async () => {
      reliability.updateConfig('openai', { maxRetries: 2 });

      let attempts = 0;

      try {
        await reliability.execute('openai', async () => {
          attempts++;
          throw new Error('Always fails');
        });
      } catch (e) {
        // Expected
      }

      expect(attempts).to.equal(3); // Initial + 2 retries
    });

    it('Should not retry on non-retryable errors', async () => {
      let attempts = 0;

      try {
        await reliability.execute('openai', async () => {
          attempts++;
          const error: any = new Error('Unauthorized');
          error.statusCode = 401;
          throw error;
        });
      } catch (e) {
        // Expected
      }

      expect(attempts).to.equal(1); // No retries for 401
    });

    it('Should use exponential backoff', async function () {
      this.timeout(5000);

      reliability.updateConfig('openai', { baseDelay: 100, maxRetries: 3 });

      const timestamps: number[] = [];

      try {
        await reliability.execute('openai', async () => {
          timestamps.push(Date.now());
          throw new Error('Retry me');
        });
      } catch (e) {}

      // Check delays are increasing
      for (let i = 1; i < timestamps.length; i++) {
        const delay = timestamps[i] - timestamps[i - 1];
        const expectedMin = 100 * Math.pow(2, i - 1) * 0.75; // Min with jitter

        expect(delay).to.be.greaterThan(expectedMin);
      }
    });

    it('Should apply jitter to backoff', async function () {
      this.timeout(5000);

      reliability.updateConfig('openai', { baseDelay: 100, maxRetries: 2 });

      const delays: number[] = [];

      for (let run = 0; run < 3; run++) {
        const timestamps: number[] = [];

        try {
          await reliability.execute('openai', async () => {
            timestamps.push(Date.now());
            throw new Error('Retry me');
          });
        } catch (e) {}

        if (timestamps.length > 1) {
          delays.push(timestamps[1] - timestamps[0]);
        }
      }

      // Delays should vary due to jitter
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).to.be.greaterThan(1);
    });

    it('Should cap backoff at maxDelay', async function () {
      this.timeout(10000);

      reliability.updateConfig('openai', { baseDelay: 1000, maxDelay: 2000, maxRetries: 5 });

      const timestamps: number[] = [];

      try {
        await reliability.execute('openai', async () => {
          timestamps.push(Date.now());
          throw new Error('Retry me');
        });
      } catch (e) {}

      // Check no delay exceeds maxDelay * 1.25 (accounting for jitter)
      for (let i = 1; i < timestamps.length; i++) {
        const delay = timestamps[i] - timestamps[i - 1];
        expect(delay).to.be.lessThan(2000 * 1.25 + 100); // maxDelay + jitter + margin
      }
    });
  });

  // ============================================================================
  // IDEMPOTENCY TESTS
  // ============================================================================

  describe('Idempotency', () => {
    it('Should return cached result for same idempotency key', async () => {
      let executions = 0;

      const fn = async () => {
        executions++;
        return `result-${executions}`;
      };

      const result1 = await reliability.execute('openai', fn, {
        idempotencyKey: 'key-123',
      });

      const result2 = await reliability.execute('openai', fn, {
        idempotencyKey: 'key-123',
      });

      expect(result1).to.equal('result-1');
      expect(result2).to.equal('result-1'); // Cached
      expect(executions).to.equal(1); // Only executed once
    });

    it('Should execute different idempotency keys separately', async () => {
      let executions = 0;

      const fn = async () => {
        executions++;
        return `result-${executions}`;
      };

      const result1 = await reliability.execute('openai', fn, {
        idempotencyKey: 'key-1',
      });

      const result2 = await reliability.execute('openai', fn, {
        idempotencyKey: 'key-2',
      });

      expect(result1).to.equal('result-1');
      expect(result2).to.equal('result-2');
      expect(executions).to.equal(2);
    });

    it('Should expire idempotency cache after TTL', async function () {
      this.timeout(2000);

      let executions = 0;

      const fn = async () => {
        executions++;
        return `result-${executions}`;
      };

      // First execution
      await reliability.execute('openai', fn, {
        idempotencyKey: 'key-expire',
      });

      // Wait for TTL (default 1 hour, but configure shorter for test)
      reliability['idempotencyCache'].set('key-expire', {
        result: 'result-1',
        expiresAt: Date.now() + 100, // 100ms TTL
      });

      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should execute again
      await reliability.execute('openai', fn, {
        idempotencyKey: 'key-expire',
      });

      expect(executions).to.equal(2);
    });
  });

  // ============================================================================
  // COST ACCOUNTING TESTS
  // ============================================================================

  describe('Cost Accounting', () => {
    it('Should track token usage', async () => {
      await reliability.execute(
        'openai',
        async () => 'success',
        { estimatedTokens: 1000 }
      );

      const health = reliability.getHealth('openai');
      expect(health.totalTokens).to.equal(1000);
    });

    it('Should accumulate token usage', async () => {
      await reliability.execute(
        'openai',
        async () => 'success',
        { estimatedTokens: 500 }
      );

      await reliability.execute(
        'openai',
        async () => 'success',
        { estimatedTokens: 1500 }
      );

      const health = reliability.getHealth('openai');
      expect(health.totalTokens).to.equal(2000);
    });

    it('Should calculate cost per provider', async () => {
      reliability.updateConfig('openai', {
        costPer1kTokens: 0.03, // GPT-4 pricing
      });

      await reliability.execute(
        'openai',
        async () => 'success',
        { estimatedTokens: 10000 }
      );

      const health = reliability.getHealth('openai');
      expect(health.totalCost).to.be.closeTo(0.30, 0.01); // $0.30 for 10k tokens
    });

    it('Should track average cost per request', async () => {
      reliability.updateConfig('openai', {
        costPer1kTokens: 0.03,
      });

      await reliability.execute(
        'openai',
        async () => 'success',
        { estimatedTokens: 1000 }
      );

      await reliability.execute(
        'openai',
        async () => 'success',
        { estimatedTokens: 3000 }
      );

      const health = reliability.getHealth('openai');
      const avgCost = health.totalCost / health.totalRequests;

      expect(avgCost).to.be.closeTo(0.06, 0.01); // (0.03 + 0.09) / 2
    });
  });

  // ============================================================================
  // HEALTH MONITORING TESTS
  // ============================================================================

  describe('Health Monitoring', () => {
    it('Should track total requests', async () => {
      await reliability.execute('openai', async () => 'success');
      await reliability.execute('openai', async () => 'success');

      const health = reliability.getHealth('openai');
      expect(health.totalRequests).to.equal(2);
    });

    it('Should track successful requests', async () => {
      await reliability.execute('openai', async () => 'success');

      try {
        await reliability.execute('openai', async () => {
          throw new Error('fail');
        });
      } catch (e) {}

      const health = reliability.getHealth('openai');
      expect(health.successfulRequests).to.equal(1);
    });

    it('Should track failed requests', async () => {
      try {
        await reliability.execute('openai', async () => {
          throw new Error('fail');
        });
      } catch (e) {}

      const health = reliability.getHealth('openai');
      expect(health.failedRequests).to.equal(1);
    });

    it('Should calculate success rate', async () => {
      await reliability.execute('openai', async () => 'success');
      await reliability.execute('openai', async () => 'success');

      try {
        await reliability.execute('openai', async () => {
          throw new Error('fail');
        });
      } catch (e) {}

      const health = reliability.getHealth('openai');
      expect(health.successRate).to.be.closeTo(0.67, 0.01); // 2/3
    });

    it('Should track average latency', async () => {
      await reliability.execute('openai', async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return 'success';
      });

      const health = reliability.getHealth('openai');
      expect(health.avgLatency).to.be.greaterThan(90);
      expect(health.avgLatency).to.be.lessThan(200);
    });

    it('Should track recent errors', async () => {
      try {
        await reliability.execute('openai', async () => {
          throw new Error('Test error message');
        });
      } catch (e) {}

      const health = reliability.getHealth('openai');
      expect(health.recentErrors).to.have.lengthOf(1);
      expect(health.recentErrors[0]).to.include('Test error message');
    });

    it('Should limit recent errors to 10', async () => {
      for (let i = 0; i < 15; i++) {
        try {
          await reliability.execute('openai', async () => {
            throw new Error(`Error ${i}`);
          });
        } catch (e) {}
      }

      const health = reliability.getHealth('openai');
      expect(health.recentErrors).to.have.lengthOf(10);
    });
  });

  // ============================================================================
  // TIMEOUT TESTS
  // ============================================================================

  describe('Timeout', () => {
    it('Should timeout long-running requests', async function () {
      this.timeout(3000);

      reliability.updateConfig('openai', { timeout: 100 });

      await expect(
        reliability.execute('openai', async () => {
          await new Promise((resolve) => setTimeout(resolve, 500));
          return 'success';
        })
      ).to.be.rejectedWith('timeout');
    });

    it('Should not timeout fast requests', async () => {
      reliability.updateConfig('openai', { timeout: 1000 });

      const result = await reliability.execute('openai', async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return 'success';
      });

      expect(result).to.equal('success');
    });
  });

  // ============================================================================
  // MULTI-PROVIDER TESTS
  // ============================================================================

  describe('Multi-Provider Support', () => {
    it('Should track providers independently', async () => {
      await reliability.execute('openai', async () => 'openai-success');
      await reliability.execute('anthropic', async () => 'anthropic-success');

      const openaiHealth = reliability.getHealth('openai');
      const anthropicHealth = reliability.getHealth('anthropic');

      expect(openaiHealth.totalRequests).to.equal(1);
      expect(anthropicHealth.totalRequests).to.equal(1);
    });

    it('Should maintain separate circuit states', async () => {
      // Fail openai
      for (let i = 0; i < 5; i++) {
        try {
          await reliability.execute('openai', async () => {
            throw new Error('openai error');
          });
        } catch (e) {}
      }

      // Succeed anthropic
      await reliability.execute('anthropic', async () => 'success');

      const openaiHealth = reliability.getHealth('openai');
      const anthropicHealth = reliability.getHealth('anthropic');

      expect(openaiHealth.state).to.equal(CircuitState.OPEN);
      expect(anthropicHealth.state).to.equal(CircuitState.CLOSED);
    });

    it('Should allow failover between providers', async () => {
      // OpenAI fails
      for (let i = 0; i < 5; i++) {
        try {
          await reliability.execute('openai', async () => {
            throw new Error('openai down');
          });
        } catch (e) {}
      }

      // Fallback to Anthropic
      const result = await reliability.execute('anthropic', async () => 'anthropic-success');

      expect(result).to.equal('anthropic-success');
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe('Edge Cases', () => {
    it('Should handle requests that succeed after multiple retries', async () => {
      let attempts = 0;

      const result = await reliability.execute('openai', async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Not yet');
        }
        return 'finally!';
      });

      expect(result).to.equal('finally!');
    });

    it('Should handle null/undefined results', async () => {
      const result1 = await reliability.execute('openai', async () => null);
      const result2 = await reliability.execute('openai', async () => undefined);

      expect(result1).to.be.null;
      expect(result2).to.be.undefined;
    });

    it('Should handle errors with no message', async () => {
      try {
        await reliability.execute('openai', async () => {
          throw new Error();
        });
      } catch (e) {
        // Expected
      }

      const health = reliability.getHealth('openai');
      expect(health.recentErrors).to.have.lengthOf(1);
    });

    it('Should handle very high concurrency', async function () {
      this.timeout(5000);

      const promises = [];

      for (let i = 0; i < 100; i++) {
        promises.push(
          reliability.execute('openai', async () => {
            await new Promise((resolve) => setTimeout(resolve, Math.random() * 10));
            return i;
          })
        );
      }

      const results = await Promise.all(promises);

      expect(results).to.have.lengthOf(100);

      const health = reliability.getHealth('openai');
      expect(health.totalRequests).to.equal(100);
    });
  });

  // ============================================================================
  // CONFIGURATION TESTS
  // ============================================================================

  describe('Configuration', () => {
    it('Should allow custom configuration per provider', () => {
      reliability.updateConfig('openai', {
        maxRetries: 5,
        baseDelay: 2000,
        timeout: 30000,
      });

      reliability.updateConfig('anthropic', {
        maxRetries: 2,
        baseDelay: 500,
        timeout: 10000,
      });

      // Configurations are provider-specific
      const openaiConfig = reliability['getProviderConfig']('openai');
      const anthropicConfig = reliability['getProviderConfig']('anthropic');

      expect(openaiConfig.maxRetries).to.equal(5);
      expect(anthropicConfig.maxRetries).to.equal(2);
    });

    it('Should use default configuration for unconfigured providers', () => {
      const config = reliability['getProviderConfig']('new-provider');

      expect(config).to.have.property('maxRetries');
      expect(config).to.have.property('timeout');
    });
  });
});
