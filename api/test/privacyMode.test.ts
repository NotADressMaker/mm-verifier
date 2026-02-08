import { describe, expect, it } from '@jest/globals';
import { buildMockJobRecord } from '../../shared/mockVerifier';

describe('privacy defaults', () => {
  it('omits plaintext prompt in hashed-only mode', () => {
    const record = buildMockJobRecord({
      jobId: 'job-1',
      prompt: 'Sensitive prompt',
      promptHash: '0x' + '11'.repeat(32),
      models: ['gpt-4'],
      taskType: 'factual-qa',
      scenario: 'happy',
      includePrompt: false,
      storageMode: 'hashed-only',
    });

    expect(record.prompt).toBeUndefined();
    expect(record.storage_mode).toBe('hashed-only');
  });
});
