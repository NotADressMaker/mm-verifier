import fs from 'fs';
import path from 'path';
import os from 'os';
import { purgeEncryptedEvidence } from '../src/evidence/evidenceStorage';

describe('evidence retention', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mamv-evidence-'));

  beforeEach(() => {
    process.env.EVIDENCE_STORAGE_DIR = tmpDir;
  });

  afterEach(() => {
    fs.readdirSync(tmpDir).forEach((entry) => {
      fs.unlinkSync(path.join(tmpDir, entry));
    });
  });

  it('purges encrypted evidence older than the threshold', () => {
    const oldPayload = {
      stored_at: Date.now() - 9 * 24 * 60 * 60 * 1000,
      bundle_hash: `0x${'11'.repeat(32)}`,
      encryption: {
        version: 'v1',
        key_version: 'v1',
        alg: 'aes-256-gcm',
        iv: '00',
        tag: '00',
        ciphertext: 'AA==',
        bundle_hash: `0x${'11'.repeat(32)}`,
      },
    };
    const recentPayload = {
      ...oldPayload,
      stored_at: Date.now(),
      bundle_hash: `0x${'22'.repeat(32)}`,
    };

    fs.writeFileSync(path.join(tmpDir, 'old.json'), JSON.stringify(oldPayload));
    fs.writeFileSync(path.join(tmpDir, 'recent.json'), JSON.stringify(recentPayload));

    const result = purgeEncryptedEvidence({ older_than_ms: 7 * 24 * 60 * 60 * 1000 });
    expect(result.removed).toBe(1);
    expect(result.remaining).toBe(1);
  });
});
