import { CircuitBreaker } from '../../../shared/providers/circuitBreaker';
import { executeWithRetry, RetryOptions } from '../../../shared/providers/retry';
import { ProviderCallResult } from '../../../shared/providers/interface';
import { logger } from '../utils/logger';
import { verifierMetrics } from '../observability/metrics';

const circuitBreakers = new Map<string, CircuitBreaker>();

function getBreakerKey(provider: string, model: string) {
  return `${provider}:${model}`;
}

function resolveCircuitBreaker(provider: string, model: string): CircuitBreaker {
  const key = getBreakerKey(provider, model);
  if (circuitBreakers.has(key)) {
    return circuitBreakers.get(key)!;
  }
  const breaker = new CircuitBreaker({
    failure_threshold: parseInt(process.env.PROVIDER_CIRCUIT_THRESHOLD || '5', 10),
    window_ms: parseInt(process.env.PROVIDER_CIRCUIT_WINDOW_MS || '60000', 10),
    open_duration_ms: parseInt(process.env.PROVIDER_CIRCUIT_OPEN_MS || '30000', 10),
    half_open_max_calls: parseInt(process.env.PROVIDER_CIRCUIT_HALF_OPEN || '2', 10),
  });
  circuitBreakers.set(key, breaker);
  return breaker;
}

export function classifyProviderError(error: unknown): { type: string; code?: string } {
  const err = error as any;
  const message = err?.message?.toLowerCase?.() ?? '';
  const status = err?.status ?? err?.statusCode ?? err?.response?.status;
  if (message.includes('timeout') || err?.code === 'ETIMEDOUT') {
    return { type: 'timeout' };
  }
  if (status === 429 || message.includes('rate limit')) {
    return { type: 'rate_limit', code: String(status ?? '429') };
  }
  if (status && status >= 500) {
    return { type: 'server_error', code: String(status) };
  }
  if (status === 401 || status === 403) {
    return { type: 'auth_error', code: String(status) };
  }
  return { type: 'unknown', code: status ? String(status) : undefined };
}

function isRetryable(error: unknown): boolean {
  const { type } = classifyProviderError(error);
  return ['timeout', 'rate_limit', 'server_error'].includes(type);
}

export async function executeProviderCall(
  providerId: string,
  model: string,
  call: () => Promise<ProviderCallResult>
): Promise<ProviderCallResult> {
  const breaker = resolveCircuitBreaker(providerId, model);
  if (!breaker.canExecute()) {
    return {
      provider_id: providerId,
      model_name: model,
      normalized_text: '',
      latency_ms: 0,
      status: 'error',
      error: 'Circuit breaker open',
      error_type: 'circuit_open',
    };
  }

  const retryOptions: RetryOptions = {
    max_attempts: parseInt(process.env.PROVIDER_MAX_ATTEMPTS || '3', 10),
    base_delay_ms: parseInt(process.env.PROVIDER_RETRY_BASE_MS || '500', 10),
    max_delay_ms: parseInt(process.env.PROVIDER_RETRY_MAX_MS || '10000', 10),
    jitter: 0.25,
  };

  try {
    const { result, attempts } = await executeWithRetry(
      call,
      retryOptions,
      isRetryable,
      (attempt, delayMs, error) => {
        const { type, code } = classifyProviderError(error);
        logger.warn('Retrying provider call', {
          provider_id: providerId,
          model,
          attempt,
          delay_ms: delayMs,
          error_type: type,
          error_code: code,
        });
      }
    );

    breaker.recordSuccess();
    return {
      ...result,
      retries: Math.max(0, attempts - 1),
    };
  } catch (error) {
    breaker.recordFailure();
    const { type, code } = classifyProviderError(error);
    verifierMetrics.metrics.providerErrorsTotal.labels(providerId, model, code ?? type).inc();
    return {
      provider_id: providerId,
      model_name: model,
      normalized_text: '',
      latency_ms: 0,
      status: 'error',
      error: (error as Error).message ?? 'Provider call failed',
      error_type: type,
    };
  }
}
