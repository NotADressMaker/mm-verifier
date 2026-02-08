import { describe, expect, it } from '@jest/globals';
import { apiMetrics } from '../src/observability/metrics';

describe('metrics registry', () => {
  it('exposes expected series', async () => {
    const metrics = await apiMetrics.register.metrics();
    expect(metrics).toContain('queue_depth');
    expect(metrics).toContain('active_jobs');
    expect(metrics).toContain('cache_hits_total');
    expect(metrics).toContain('cache_misses_total');
  });
});
