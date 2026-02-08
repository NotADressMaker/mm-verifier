import { calculateBackoffDelay, executeWithRetry } from '../../shared/providers/retry';

describe('retry policy', () => {
  it('applies exponential backoff with jitter bounds', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const delay = calculateBackoffDelay(1, {
      max_attempts: 3,
      base_delay_ms: 100,
      max_delay_ms: 1000,
      jitter: 0.25,
    });
    expect(delay).toBeGreaterThanOrEqual(150);
    expect(delay).toBeLessThanOrEqual(250);
    (Math.random as jest.Mock).mockRestore();
  });

  it('retries until success', async () => {
    let attempts = 0;
    const result = await executeWithRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error('retry');
        }
        return 'ok';
      },
      {
        max_attempts: 3,
        base_delay_ms: 0,
        max_delay_ms: 0,
        jitter: 0,
      },
      () => true
    );

    expect(result.result).toBe('ok');
    expect(attempts).toBe(3);
  });
});
