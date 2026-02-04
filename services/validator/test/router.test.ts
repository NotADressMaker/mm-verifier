import { resolvePlugin } from '../src/plugins/router';
import { MmvValidationRequest } from '../../../shared/validationTypes';
import { hashCanonical } from '../../../shared/canonicalJson';

describe('plugin routing', () => {
  it('routes deterministic requests', () => {
    const request: MmvValidationRequest = {
      requestId: 'req-1',
      createdAt: new Date().toISOString(),
      plugin: 'deterministic',
      payload: {
        runner: 'bash',
        command: 'echo hello',
        inputHash: hashCanonical('input'),
        expectedOutputHash: hashCanonical('hello'),
      },
      workHash: hashCanonical('work'),
    };

    const plugin = resolvePlugin(request);
    expect(plugin?.name).toBe('deterministic');
  });

  it('routes test-suite requests', () => {
    const request: MmvValidationRequest = {
      requestId: 'req-2',
      createdAt: new Date().toISOString(),
      plugin: 'test-suite',
      payload: {
        workspacePath: '/tmp/project',
        testsCommand: 'npm test',
      },
      workHash: hashCanonical('work'),
    };

    const plugin = resolvePlugin(request);
    expect(plugin?.name).toBe('test-suite');
  });
});
