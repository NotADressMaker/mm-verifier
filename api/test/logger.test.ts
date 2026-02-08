import winston from 'winston';
import { Writable } from 'stream';
import { describe, expect, it } from '@jest/globals';
import { createLogger, runWithLogContext } from '../../shared/observability/logger';

describe('logger', () => {
  it('emits JSON with context fields', async () => {
    let output = '';
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });

    const logger = createLogger({
      service: 'test-service',
      transports: [new winston.transports.Stream({ stream })],
    });

    runWithLogContext(
      {
        request_id: 'req-123',
        task_id: 'task-456',
        job_id: 'job-789',
      },
      () => {
        logger.info('hello', { provider_id: 'openai' });
      }
    );

    await new Promise((resolve) => setImmediate(resolve));
    const parsed = JSON.parse(output.trim());
    expect(parsed.message).toBe('hello');
    expect(parsed.request_id).toBe('req-123');
    expect(parsed.task_id).toBe('task-456');
    expect(parsed.job_id).toBe('job-789');
    expect(parsed.provider_id).toBe('openai');
    expect(parsed.service).toBe('test-service');
  });
});
