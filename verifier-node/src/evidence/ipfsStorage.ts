import { create, IPFSHTTPClient } from 'ipfs-http-client';
import { logger } from '../utils/logger';
import { EvidenceBundle } from '../../../shared/types';

let ipfsClient: IPFSHTTPClient | null = null;

/**
 * Initialize IPFS client
 */
export function initializeIPFS() {
  try {
    const ipfsUrl = process.env.IPFS_API_URL || 'http://localhost:5001';

    ipfsClient = create({ url: ipfsUrl });

    logger.info('IPFS client initialized', { url: ipfsUrl });
  } catch (error) {
    logger.error('Failed to initialize IPFS client:', error);
    // Don't throw - IPFS is optional, can fall back to other storage
  }
}

/**
 * Upload evidence bundle to IPFS
 */
export async function uploadEvidenceToIPFS(
  bundle: EvidenceBundle
): Promise<string> {
  try {
    if (!ipfsClient) {
      initializeIPFS();
    }

    if (!ipfsClient) {
      throw new Error('IPFS client not available');
    }

    const bundleJson = JSON.stringify(bundle, null, 2);
    const result = await ipfsClient.add(bundleJson);

    const cid = result.path;

    logger.info('Evidence uploaded to IPFS', {
      taskId: bundle.task_id,
      cid,
      size: bundleJson.length,
    });

    return cid;
  } catch (error: any) {
    logger.error('Failed to upload to IPFS:', error);
    // Fall back to local storage
    return storeLocally(bundle);
  }
}

/**
 * Retrieve evidence bundle from IPFS
 */
export async function retrieveEvidenceFromIPFS(cid: string): Promise<EvidenceBundle> {
  try {
    if (!ipfsClient) {
      initializeIPFS();
    }

    if (!ipfsClient) {
      throw new Error('IPFS client not available');
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of ipfsClient.cat(cid)) {
      chunks.push(chunk);
    }

    const data = Buffer.concat(chunks).toString('utf-8');
    const bundle = JSON.parse(data);

    logger.info('Evidence retrieved from IPFS', { cid });

    return bundle;
  } catch (error: any) {
    logger.error('Failed to retrieve from IPFS:', error);
    throw error;
  }
}

/**
 * Fallback: Store locally if IPFS unavailable
 */
function storeLocally(bundle: EvidenceBundle): string {
  const fs = require('fs');
  const path = require('path');

  const storageDir = './evidence-storage';
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }

  const filename = `bundle-${bundle.task_id}-${Date.now()}.json`;
  const filepath = path.join(storageDir, filename);

  fs.writeFileSync(filepath, JSON.stringify(bundle, null, 2));

  logger.warn('Evidence stored locally (IPFS unavailable)', {
    taskId: bundle.task_id,
    filepath,
  });

  // Return local path as pseudo-CID
  return `local://${filename}`;
}

/**
 * Pin evidence on IPFS for persistence
 */
export async function pinEvidence(cid: string): Promise<void> {
  try {
    if (!ipfsClient) return;

    await ipfsClient.pin.add(cid);

    logger.info('Evidence pinned on IPFS', { cid });
  } catch (error: any) {
    logger.error('Failed to pin evidence:', error);
  }
}
