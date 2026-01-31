type RateLimitState = {
  windowStart: number;
  count: number;
};

const state = new Map<string, RateLimitState>();

export function assertWithinRateLimit(
  key: string,
  limitPerMinute: number,
  now: number = Date.now()
): void {
  const windowMs = 60_000;
  const existing = state.get(key);

  if (!existing || now - existing.windowStart >= windowMs) {
    state.set(key, { windowStart: now, count: 1 });
    return;
  }

  if (existing.count >= limitPerMinute) {
    throw new Error('MMV rate limit exceeded');
  }

  existing.count += 1;
}
