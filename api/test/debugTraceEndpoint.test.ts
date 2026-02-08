import express from 'express';
import request from 'supertest';
import { describe, expect, it } from '@jest/globals';
import { jobRoutes } from '../src/routes/jobs';
import { storeDebugTrace } from '../src/services/debugTraceStore';
import { createDebugTrace, endStage, startStage } from '../../shared/observability/debugTrace';

describe('debug trace endpoint', () => {
  it('returns stored trace stages', async () => {
    const trace = createDebugTrace('job-trace', 'trace-123');
    startStage(trace, 'ingest/validate');
    endStage(trace, 'ingest/validate', 'ok');
    await storeDebugTrace('job-trace', trace);

    const app = express();
    app.use('/api/jobs', jobRoutes);

    const response = await request(app).get('/api/jobs/job-trace/trace');
    expect(response.status).toBe(200);
    expect(response.body.trace.trace_id).toBe('trace-123');
    expect(response.body.trace.stages).toHaveLength(1);
  });
});
