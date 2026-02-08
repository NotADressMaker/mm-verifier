import { createDebugTrace, endStage, startStage } from '../../shared/observability/debugTrace';

describe('debug trace stages', () => {
  it('records stages in order with durations', () => {
    const trace = createDebugTrace('job-1', 'trace-1');
    startStage(trace, 'ingest/validate');
    endStage(trace, 'ingest/validate', 'ok');
    startStage(trace, 'provider calls');
    endStage(trace, 'provider calls', 'ok');

    expect(trace.stages[0].name).toBe('ingest/validate');
    expect(trace.stages[1].name).toBe('provider calls');
    expect(trace.stages[0].duration_ms).toBeDefined();
  });
});
