import { expect } from 'chai';
import {
  clearIdempotencyStore,
  getIdempotencyRecord,
  setIdempotencyRecord,
} from '../src/services/idempotency';

describe('Idempotency Store', () => {
  beforeEach(() => {
    clearIdempotencyStore();
  });

  it('Stores and retrieves responses by key', () => {
    const response = {
      task_id: '123',
      status: 'queued',
      verdict: 'unknown',
      score_bps: 0,
      evidence: { bundle_hash: null, bundle_uri: null },
      timings: {
        queue_ms: null,
        llm_ms: null,
        bundle_ms: null,
        chain_ms: null,
        total_ms: null,
      },
      errors: [],
    };

    setIdempotencyRecord('key-1', response);
    const record = getIdempotencyRecord('key-1');

    expect(record?.response).to.deep.equal(response);
  });
});
