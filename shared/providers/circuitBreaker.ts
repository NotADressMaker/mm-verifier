export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export type CircuitBreakerOptions = {
  failure_threshold: number;
  window_ms: number;
  open_duration_ms: number;
  half_open_max_calls: number;
};

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureTimestamps: number[] = [];
  private openedAt?: number;
  private halfOpenCalls = 0;

  constructor(private options: CircuitBreakerOptions) {}

  getState(): CircuitState {
    this.updateState();
    return this.state;
  }

  canExecute(): boolean {
    this.updateState();
    if (this.state === 'OPEN') {
      return false;
    }
    if (this.state === 'HALF_OPEN' && this.halfOpenCalls >= this.options.half_open_max_calls) {
      return false;
    }
    if (this.state === 'HALF_OPEN') {
      this.halfOpenCalls += 1;
    }
    return true;
  }

  recordSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.close();
    }
  }

  recordFailure(): void {
    const now = Date.now();
    this.failureTimestamps.push(now);
    this.failureTimestamps = this.failureTimestamps.filter(
      (ts) => now - ts <= this.options.window_ms
    );

    if (this.state === 'HALF_OPEN' || this.failureTimestamps.length >= this.options.failure_threshold) {
      this.open();
    }
  }

  private open() {
    this.state = 'OPEN';
    this.openedAt = Date.now();
    this.halfOpenCalls = 0;
  }

  private close() {
    this.state = 'CLOSED';
    this.failureTimestamps = [];
    this.openedAt = undefined;
    this.halfOpenCalls = 0;
  }

  private updateState() {
    if (this.state !== 'OPEN' || !this.openedAt) {
      return;
    }
    if (Date.now() - this.openedAt > this.options.open_duration_ms) {
      this.state = 'HALF_OPEN';
      this.halfOpenCalls = 0;
    }
  }
}
