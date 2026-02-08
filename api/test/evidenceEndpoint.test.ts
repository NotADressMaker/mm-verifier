import express from 'express';
import request from 'supertest';
import { describe, expect, it, jest } from '@jest/globals';
import { jobRoutes } from '../src/routes/jobs';

jest.mock('../src/services/mockVerifier', () => ({
  getMockJob: jest.fn(),
  getMockBundle: jest.fn(),
  getMockReceipt: jest.fn(),
  getMockDisputes: jest.fn(),
  listMockJobs: jest.fn(),
}));

jest.mock('../src/utils/mockMode', () => ({
  isMockVerifierEnabled: () => true,
}));

const { getMockJob } = jest.requireMock('../src/services/mockVerifier') as {
  getMockJob: jest.MockedFunction<(jobId: string) => Promise<unknown>>;
};

describe('evidence endpoint privacy', () => {
  it('returns not stored for hashed-only jobs', async () => {
    getMockJob.mockResolvedValue({ jobId: 'job-1', storage_mode: 'hashed-only' });
    const app = express();
    app.use('/api/jobs', jobRoutes);

    const response = await request(app).get('/api/jobs/job-1/bundle');
    expect(response.status).toBe(404);
    expect(response.body.message).toMatch(/hashed-only/i);
  });
});
