import { CircuitBreaker } from '../../shared/providers/circuitBreaker';

describe('circuit breaker', () => {
  it('transitions through open and half-open states', () => {
    jest.useFakeTimers();
    jest.setSystemTime(Date.now());

    const breaker = new CircuitBreaker({
      failure_threshold: 2,
      window_ms: 1000,
      open_duration_ms: 100,
      half_open_max_calls: 1,
    });

    breaker.recordFailure();
    expect(breaker.getState()).toBe('CLOSED');
    breaker.recordFailure();
    expect(breaker.getState()).toBe('OPEN');

    jest.advanceTimersByTime(150);
    expect(breaker.canExecute()).toBe(true);
    expect(breaker.getState()).toBe('HALF_OPEN');

    breaker.recordSuccess();
    expect(breaker.getState()).toBe('CLOSED');

    jest.useRealTimers();
  });
});
