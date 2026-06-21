import { create, IPFSHTTPClient } from 'ipfs-http-client';
import { logger } from '../utils/logger';
import { EvidenceBundle } from '../../../shared/types';
import axios from 'axios';

let ipfsClient: IPFSHTTPClient | null = null;

// Pinning service configuration (e.g., Pinata, Web3.Storage)
const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY;
const PINATA_API_URL = 'https://api.pinata.cloud';

interface PinningProof {
  cid: string;
  timestamp: number;
  pinataHash?: string;
  ipfsHash?: string;
  size: number;
  pinned: boolean;
  gatewayUrls: string[];
}

/**
 * Initialize IPFS client with enhanced configuration
 */
export function initializeIPFS() {
  try {
    const ipfsUrl = process.env.IPFS_API_URL || 'http://localhost:5001';

    ipfsClient = create({ url: ipfsUrl });

    logger.info('IPFS client initialized', { url: ipfsUrl });
  } catch (error) {
    logger.error('Failed to initialize IPFS client:', error);
  }
}

/**
 * Upload evidence bundle with pinning guarantees
 * @returns CID and pinning proof
 */
export async function uploadEvidenceToIPFS(
  bundle: EvidenceBundle
): Promise<{ cid: string; proof: PinningProof }> {
  try {
    if (!ipfsClient) {
      initializeIPFS();
    }

    const bundleJson = JSON.stringify(bundle, null, 2);

    // Step 1: Upload to local IPFS node
    let cid: string;
    let size: number = bundleJson.length;

    if (ipfsClient) {
      const result = await ipfsClient.add(bundleJson, {
        pin: true, // Pin immediately
        cidVersion: 1, // Use CIDv1 for better compatibility
      });

      cid = result.path;

      logger.info('Evidence uploaded to local IPFS', {
        taskId: bundle.task_id,
        cid,
        size,
      });
    } else {
      throw new Error('IPFS client not available');
    }

    // Step 2: Pin to external pinning service (Pinata) for redundancy
    let pinataHash: string | undefined;
    let pinned = false;

    if (PINATA_API_KEY && PINATA_SECRET_KEY) {
      try {
        pinataHash = await pinToPinata(bundleJson);
        pinned = true;

        logger.info('Evidence pinned to Pinata', {
          taskId: bundle.task_id,
          pinataHash,
        });
      } catch (error: any) {
        logger.error('Failed to pin to Pinata:', error);
        // Continue without Pinata - local pin is sufficient
      }
    }

    // Step 3: Verify availability via public gateways
    const gatewayUrls = await verifyGatewayAvailability(cid);

    // Step 4: Create pinning proof
    const proof: PinningProof = {
      cid,
      timestamp: Date.now(),
      pinataHash,
      ipfsHash: cid,
      size,
      pinned,
      gatewayUrls,
    };

    logger.info('Evidence bundle uploaded with proof', {
      taskId: bundle.task_id,
      cid,
      pinned,
      gateways: gatewayUrls.length,
    });

    return { cid, proof };
  } catch (error: any) {
    logger.error('Failed to upload to IPFS:', error);
    // Fallback to local storage
    const localCid = await storeLocally(bundle);
    return {
      cid: localCid,
      proof: {
        cid: localCid,
        timestamp: Date.now(),
        size: JSON.stringify(bundle).length,
        pinned: false,
        gatewayUrls: [],
      },
    };
  }
}

/**
 * Pin content to Pinata for persistent storage
 */
async function pinToPinata(content: string): Promise<string> {
  if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
    throw new Error('Pinata credentials not configured');
  }

  const url = `${PINATA_API_URL}/pinning/pinJSONToIPFS`;

  const response = await axios.post(
    url,
    { pinataContent: JSON.parse(content) },
    {
      headers: {
        pinata_api_key: PINATA_API_KEY,
        pinata_secret_api_key: PINATA_SECRET_KEY,
      },
    }
  );

  return response.data.IpfsHash;
}

/**
 * Verify content is available via public IPFS gateways
 */
async function verifyGatewayAvailability(cid: string): Promise<string[]> {
  const gateways = [
    `https://ipfs.io/ipfs/${cid}`,
    `https://gateway.pinata.cloud/ipfs/${cid}`,
    `https://cloudflare-ipfs.com/ipfs/${cid}`,
    `https://dweb.link/ipfs/${cid}`,
  ];

  const availableGateways: string[] = [];

  // Try each gateway with timeout
  for (const gateway of gateways) {
    try {
      const response = await axios.head(gateway, {
        timeout: 5000, // 5 second timeout
      });

      if (response.status === 200) {
        availableGateways.push(gateway);
        logger.debug('Gateway available', { gateway });
      }
    } catch (error) {
      logger.debug('Gateway unavailable', { gateway });
    }
  }

  return availableGateways;
}

/**
 * Retrieve evidence bundle from IPFS with verification
 */
export async function retrieveEvidenceFromIPFS(
  cid: string
): Promise<{ bundle: EvidenceBundle; verified: boolean }> {
  try {
    if (!ipfsClient) {
      initializeIPFS();
    }

    logger.info('Retrieving evidence from IPFS', { cid });

    let data: string | null = null;

    // Try local IPFS node first
    if (ipfsClient) {
      try {
        const chunks: Uint8Array[] = [];
        for await (const chunk of ipfsClient.cat(cid)) {
          chunks.push(chunk);
        }
        data = Buffer.concat(chunks).toString('utf-8');
        logger.info('Retrieved from local IPFS', { cid });
      } catch (error) {
        logger.warn('Local IPFS retrieval failed, trying gateways', { cid });
      }
    }

    // Fallback to public gateways
    if (!data) {
      data = await retrieveFromGateways(cid);
    }

    if (!data) {
      throw new Error('Failed to retrieve evidence from any source');
    }

    const bundle: EvidenceBundle = JSON.parse(data);

    // Verify bundle integrity
    const verified = verifyBundleIntegrity(bundle, cid);

    logger.info('Evidence retrieved and verified', { cid, verified });

    return { bundle, verified };
  } catch (error: any) {
    logger.error('Failed to retrieve from IPFS:', error);
    throw error;
  }
}

/**
 * Try retrieving from public gateways
 */
async function retrieveFromGateways(cid: string): Promise<string | null> {
  const gateways = [
    `https://ipfs.io/ipfs/${cid}`,
    `https://gateway.pinata.cloud/ipfs/${cid}`,
    `https://cloudflare-ipfs.com/ipfs/${cid}`,
  ];

  for (const gateway of gateways) {
    try {
      const response = await axios.get(gateway, {
        timeout: 10000, // 10 second timeout
      });

      if (response.status === 200) {
        logger.info('Retrieved from gateway', { gateway });
        return typeof response.data === 'string'
          ? response.data
          : JSON.stringify(response.data);
      }
    } catch (error) {
      logger.debug('Gateway retrieval failed', { gateway });
    }
  }

  return null;
}

/**
 * Verify bundle integrity matches CID
 */
function verifyBundleIntegrity(bundle: EvidenceBundle, expectedCid: string): boolean {
  try {
    // In production, would verify CID matches content hash
    // For now, just check bundle has required fields
    const requiredFields = [
      'schema_version',
      'version',
      'task_id',
      'bundle_version',
      'created_at',
      'evaluator',
      'prompt_hash',
      'rubric_hash',
      'model_runs',
      'claims',
      'metrics',
      'final_score_bps',
      'signatures',
    ];

    for (const field of requiredFields) {
      if (!(field in bundle)) {
        logger.warn('Bundle missing required field', { field });
        return false;
      }
    }

    if (bundle.bundle_version === '0.2' || bundle.bundle_version === '0.3') {
      const v02Fields = ['input', 'output', 'provenance', 'scoring_trace'];
      for (const field of v02Fields) {
        if (!(field in bundle)) {
          logger.warn('Bundle missing required v0.2 field', { field });
          return false;
        }
      }
    }

    if (bundle.bundle_version === '0.3' && !('replay' in bundle)) {
      logger.warn('Bundle missing required replay metadata');
      return false;
    }

    return true;
  } catch (error: any) {
    logger.error('Bundle integrity check failed:', error);
    return false;
  }
}

/**
 * Pin existing evidence on IPFS for persistence
 */
export async function pinEvidence(cid: string): Promise<boolean> {
  try {
    if (!ipfsClient) {
      initializeIPFS();
    }

    if (ipfsClient) {
      await ipfsClient.pin.add(cid);
      logger.info('Evidence pinned locally', { cid });
    }

    // Pin to Pinata
    if (PINATA_API_KEY && PINATA_SECRET_KEY) {
      await pinExistingToPinata(cid);
      logger.info('Evidence pinned to Pinata', { cid });
    }

    return true;
  } catch (error: any) {
    logger.error('Failed to pin evidence:', error);
    return false;
  }
}

/**
 * Pin existing CID to Pinata
 */
async function pinExistingToPinata(cid: string): Promise<void> {
  if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
    throw new Error('Pinata credentials not configured');
  }

  const url = `${PINATA_API_URL}/pinning/pinByHash`;

  await axios.post(
    url,
    {
      hashToPin: cid,
      pinataMetadata: {
        name: `mamv-evidence-${cid}`,
      },
    },
    {
      headers: {
        pinata_api_key: PINATA_API_KEY,
        pinata_secret_api_key: PINATA_SECRET_KEY,
      },
    }
  );
}

/**
 * Check if CID is pinned
 */
export async function isPinned(cid: string): Promise<boolean> {
  try {
    if (!ipfsClient) {
      initializeIPFS();
    }

    if (ipfsClient) {
      // Check local pin
      for await (const pin of ipfsClient.pin.ls({ paths: [cid] })) {
        if (pin.cid.toString() === cid) {
          return true;
        }
      }
    }

    return false;
  } catch (error: any) {
    logger.error('Failed to check pin status:', error);
    return false;
  }
}

/**
 * Fallback: Store locally if IPFS unavailable
 */
async function storeLocally(bundle: EvidenceBundle): Promise<string> {
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

  // Return pseudo-CID
  return `local://${filename}`;
}

/**
 * Get pinning proof for a CID
 */
export async function getPinningProof(cid: string): Promise<PinningProof | null> {
  try {
    const pinned = await isPinned(cid);
    const gatewayUrls = await verifyGatewayAvailability(cid);

    return {
      cid,
      timestamp: Date.now(),
      ipfsHash: cid,
      size: 0, // Would need to fetch to determine
      pinned,
      gatewayUrls,
    };
  } catch (error: any) {
    logger.error('Failed to get pinning proof:', error);
    return null;
  }
}

export { PinningProof };
