import { decryptEvidenceBlob, encryptEvidenceBlob } from '../../shared/evidenceEncryption';

describe('evidence encryption', () => {
  it('round-trips encrypted evidence blobs', () => {
    const plaintext = Buffer.from(JSON.stringify({ payload: 'secret' }), 'utf8');
    const masterKey = Buffer.from('a'.repeat(32), 'utf8');
    const bundleHash = `0x${'11'.repeat(32)}`;
    const blob = encryptEvidenceBlob({
      plaintext,
      master_key: masterKey,
      bundle_hash: bundleHash,
      key_version: 'v1',
    });
    const decrypted = decryptEvidenceBlob({ blob, master_key: masterKey });
    expect(decrypted.toString('utf8')).toBe(plaintext.toString('utf8'));
  });
});
