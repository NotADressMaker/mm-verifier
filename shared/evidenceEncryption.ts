import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

export type EncryptedEvidenceBlob = {
  version: 'v1';
  key_version: string;
  alg: 'aes-256-gcm';
  iv: string;
  tag: string;
  ciphertext: string;
  bundle_hash: string;
};

export function deriveEvidenceKey(params: {
  master_key: Buffer;
  bundle_hash: string;
  key_version: string;
}): Buffer {
  const salt = Buffer.from(params.bundle_hash.replace(/^0x/, ''), 'hex');
  const info = Buffer.from(`mmv-evidence:${params.key_version}`, 'utf8');
  return Buffer.from(hkdfSync('sha256', params.master_key, salt, info, 32));
}

export function encryptEvidenceBlob(params: {
  plaintext: Buffer;
  master_key: Buffer;
  bundle_hash: string;
  key_version: string;
}): EncryptedEvidenceBlob {
  const key = deriveEvidenceKey({
    master_key: params.master_key,
    bundle_hash: params.bundle_hash,
    key_version: params.key_version,
  });
  const iv = randomBytes(12);
  const encryptor = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([encryptor.update(params.plaintext), encryptor.final()]);
  const tag = encryptor.getAuthTag();
  return {
    version: 'v1',
    key_version: params.key_version,
    alg: 'aes-256-gcm',
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    ciphertext: ciphertext.toString('base64'),
    bundle_hash: params.bundle_hash,
  };
}

export function decryptEvidenceBlob(params: {
  blob: EncryptedEvidenceBlob;
  master_key: Buffer;
}): Buffer {
  const key = deriveEvidenceKey({
    master_key: params.master_key,
    bundle_hash: params.blob.bundle_hash,
    key_version: params.blob.key_version,
  });
  const iv = Buffer.from(params.blob.iv, 'hex');
  const tag = Buffer.from(params.blob.tag, 'hex');
  const ciphertext = Buffer.from(params.blob.ciphertext, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
