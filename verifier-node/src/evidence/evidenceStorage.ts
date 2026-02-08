import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';
import { EvidenceBundle } from '../../../shared/types';
import { EncryptedEvidenceBlob, encryptEvidenceBlob } from '../../../shared/evidenceEncryption';

export type StoredEvidencePayload = {
  stored_at: number;
  bundle_hash: string;
  encryption: EncryptedEvidenceBlob;
};

export type StoredEvidenceRecord = {
  uri: string;
  stored_at: number;
  bundle_hash: string;
  key_version: string;
};

function getMasterKey(): Buffer {
  const key = process.env.EVIDENCE_MASTER_KEY_BASE64;
  if (!key) {
    throw new Error('EVIDENCE_MASTER_KEY_BASE64 is required for encrypted evidence storage');
  }
  return Buffer.from(key, 'base64');
}

function getKeyVersion(): string {
  return process.env.EVIDENCE_KEY_VERSION || 'v1';
}

function getStorageMode(): 'local' | 'ipfs' {
  return process.env.EVIDENCE_STORAGE_MODE === 'ipfs' ? 'ipfs' : 'local';
}

function getStorageDir(): string {
  return process.env.EVIDENCE_STORAGE_DIR || './evidence-storage/encrypted';
}

export async function storeEncryptedEvidenceBundle(params: {
  bundle: EvidenceBundle;
  bundle_hash: string;
}): Promise<StoredEvidenceRecord> {
  const plaintext = Buffer.from(JSON.stringify(params.bundle), 'utf8');
  const keyVersion = getKeyVersion();
  const encryption = encryptEvidenceBlob({
    plaintext,
    master_key: getMasterKey(),
    bundle_hash: params.bundle_hash,
    key_version: keyVersion,
  });

  const payload: StoredEvidencePayload = {
    stored_at: Date.now(),
    bundle_hash: params.bundle_hash,
    encryption,
  };

  if (getStorageMode() === 'ipfs') {
    const { uploadEncryptedEvidenceToIPFS } = await import('./ipfsStorage');
    const cid = await uploadEncryptedEvidenceToIPFS(payload);
    return {
      uri: `encrypted+ipfs://${cid}`,
      stored_at: payload.stored_at,
      bundle_hash: params.bundle_hash,
      key_version: keyVersion,
    };
  }

  const storageDir = getStorageDir();
  fs.mkdirSync(storageDir, { recursive: true });
  const filename = `bundle-${params.bundle_hash.slice(2, 10)}-${payload.stored_at}.json`;
  const filepath = path.join(storageDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(payload, null, 2));

  logger.info('Encrypted evidence stored locally', {
    bundleHash: params.bundle_hash,
    filepath,
  });

  return {
    uri: `encrypted+local://${filename}`,
    stored_at: payload.stored_at,
    bundle_hash: params.bundle_hash,
    key_version: keyVersion,
  };
}

export function purgeEncryptedEvidence(params: { older_than_ms: number }): {
  removed: number;
  remaining: number;
} {
  const storageDir = getStorageDir();
  if (!fs.existsSync(storageDir)) {
    return { removed: 0, remaining: 0 };
  }

  const entries = fs.readdirSync(storageDir);
  const now = Date.now();
  let removed = 0;
  let remaining = 0;

  entries.forEach((entry) => {
    const filepath = path.join(storageDir, entry);
    try {
      const raw = fs.readFileSync(filepath, 'utf8');
      const payload = JSON.parse(raw) as StoredEvidencePayload;
      const age = now - payload.stored_at;
      if (age > params.older_than_ms) {
        fs.unlinkSync(filepath);
        removed += 1;
      } else {
        remaining += 1;
      }
    } catch (error) {
      logger.warn('Skipping unreadable evidence payload', { filepath, error });
      remaining += 1;
    }
  });

  return { removed, remaining };
}

export function parseDurationToMs(input: string): number {
  const match = input.trim().match(/^(\d+)(d|h|m|s)$/i);
  if (!match) {
    throw new Error('Duration must be formatted like 7d, 12h, 30m, or 45s');
  }
  const value = Number.parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multiplier = unit === 'd' ? 86400000 : unit === 'h' ? 3600000 : unit === 'm' ? 60000 : 1000;
  return value * multiplier;
}
