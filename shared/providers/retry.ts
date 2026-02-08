export type RetryOptions = {
  max_attempts: number;
  base_delay_ms: number;
  max_delay_ms: number;
  jitter?: number;
};

export function calculateBackoffDelay(attempt: number, options: RetryOptions): number {
  const exponent = Math.min(
    options.base_delay_ms * Math.pow(2, attempt),
    options.max_delay_ms
  );
  const jitterFactor = options.jitter ?? 0.25;
  const delta = exponent * jitterFactor;
  const min = exponent - delta;
  const max = exponent + delta;
  return Math.floor(min + Math.random() * (max - min));
}

export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
  isRetryable: (error: unknown) => boolean,
  onRetry?: (attempt: number, delayMs: number, error: unknown) => void
): Promise<{ result: T; attempts: number }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < options.max_attempts; attempt++) {
    try {
      const result = await fn();
      return { result, attempts: attempt + 1 };
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === options.max_attempts - 1) {
        throw error;
      }
      const delayMs = calculateBackoffDelay(attempt, options);
      onRetry?.(attempt + 1, delayMs, error);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}
