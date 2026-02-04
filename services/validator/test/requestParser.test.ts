import { parseValidationRequest } from '../src/requestParser';
import { hashCanonical } from '../../../shared/canonicalJson';

describe('request parser', () => {
  it('parses a valid request', () => {
    const request = {
      requestId: 'req-3',
      createdAt: new Date().toISOString(),
      plugin: 'deterministic',
      payload: {
        runner: 'bash',
        command: 'echo 42',
        inputHash: hashCanonical('input'),
      },
      workHash: hashCanonical('work'),
    };

    expect(parseValidationRequest(request).requestId).toBe('req-3');
  });

  it('rejects invalid request', () => {
    expect(() => parseValidationRequest({})).toThrow('Missing required request fields');
  });
});
