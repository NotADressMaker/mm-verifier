/**
 * Records Service - Fetches and builds VerifiedOutputRecords from on-chain events
 *
 * This service derives records from existing VerificationMarketplace events:
 * - Revealed(taskId, evaluator, scoreBps, bundleHash, bundleURI)
 * - Finalized(taskId, finalScoreBps, feePool)
 *
 * No new contracts needed - records are derived from existing event logs.
 */

import { ethers, Contract, EventLog, Log } from 'ethers';
import { logger } from '../utils/logger';
import { getRpcUrl } from '../../../shared/env';
import { MARKETPLACE_ABI } from './blockchain';
import {
  VerifiedOutputRecord,
  RevealedEventData,
  FinalizedEventData,
  OnChainTaskData,
  RecordQueryFilter,
  buildRecordFromChainData,
  matchesFilter,
  paginateRecords,
  WORTHY_MIN_BPS,
} from '../../../shared/verifiedOutput';

// ============================================================================
// Configuration
// ============================================================================

let provider: ethers.JsonRpcProvider | null = null;
let marketplaceContract: Contract | null = null;
let chainId: number = 0;
let contractAddress: string = '';

// In-memory cache for records (lightweight indexer)
const recordCache: Map<string, VerifiedOutputRecord> = new Map();
let lastIndexedBlock: number = 0;
let cacheInitialized = false;

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the records service
 */
export async function initializeRecordsService(): Promise<void> {
  try {
    const rpcUrl = getRpcUrl();
    if (!rpcUrl) {
      logger.warn('RecordsService: No RPC URL configured, on-chain features disabled');
      return;
    }

    provider = new ethers.JsonRpcProvider(rpcUrl);
    const network = await provider.getNetwork();
    chainId = Number(network.chainId);

    contractAddress = process.env.MARKETPLACE_ADDRESS || '';
    if (!contractAddress) {
      logger.warn('RecordsService: No MARKETPLACE_ADDRESS configured');
      return;
    }

    marketplaceContract = new ethers.Contract(
      contractAddress,
      MARKETPLACE_ABI,
      provider
    );

    logger.info('RecordsService initialized', {
      chainId,
      contractAddress,
    });
  } catch (error) {
    logger.error('RecordsService initialization failed', error);
  }
}

// ============================================================================
// Event Fetching
// ============================================================================

/**
 * Fetch Revealed events from a block range
 */
async function fetchRevealedEvents(
  fromBlock: number,
  toBlock: number | 'latest'
): Promise<RevealedEventData[]> {
  if (!marketplaceContract) return [];

  try {
    const filter = marketplaceContract.filters.Revealed();
    const logs = await marketplaceContract.queryFilter(filter, fromBlock, toBlock);

    return logs.map((log) => {
      const eventLog = log as EventLog;
      return {
        taskId: eventLog.args[0].toString(),
        evaluator: eventLog.args[1],
        scoreBps: Number(eventLog.args[2]),
        bundleHash: eventLog.args[3],
        bundleUri: eventLog.args[4],
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash,
      };
    });
  } catch (error) {
    logger.error('Failed to fetch Revealed events', error);
    return [];
  }
}

/**
 * Fetch Finalized events from a block range
 */
async function fetchFinalizedEvents(
  fromBlock: number,
  toBlock: number | 'latest'
): Promise<FinalizedEventData[]> {
  if (!marketplaceContract || !provider) return [];

  try {
    const filter = marketplaceContract.filters.Finalized();
    const logs = await marketplaceContract.queryFilter(filter, fromBlock, toBlock);

    const events: FinalizedEventData[] = [];

    for (const log of logs) {
      const eventLog = log as EventLog;
      const block = await provider.getBlock(log.blockNumber);

      events.push({
        taskId: eventLog.args[0].toString(),
        finalScoreBps: Number(eventLog.args[1]),
        feePool: eventLog.args[2].toString(),
        blockNumber: log.blockNumber,
        blockTimestamp: block?.timestamp,
        transactionHash: log.transactionHash,
      });
    }

    return events;
  } catch (error) {
    logger.error('Failed to fetch Finalized events', error);
    return [];
  }
}

/**
 * Fetch events for a specific task ID
 */
async function fetchTaskEvents(taskId: string): Promise<{
  revealed: RevealedEventData[];
  finalized: FinalizedEventData | null;
}> {
  if (!marketplaceContract || !provider) {
    return { revealed: [], finalized: null };
  }

  try {
    // Fetch Revealed events for this task
    const revealedFilter = marketplaceContract.filters.Revealed(taskId);
    const revealedLogs = await marketplaceContract.queryFilter(revealedFilter);

    const revealed: RevealedEventData[] = revealedLogs.map((log) => {
      const eventLog = log as EventLog;
      return {
        taskId: eventLog.args[0].toString(),
        evaluator: eventLog.args[1],
        scoreBps: Number(eventLog.args[2]),
        bundleHash: eventLog.args[3],
        bundleUri: eventLog.args[4],
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash,
      };
    });

    // Fetch Finalized event for this task
    const finalizedFilter = marketplaceContract.filters.Finalized(taskId);
    const finalizedLogs = await marketplaceContract.queryFilter(finalizedFilter);

    let finalized: FinalizedEventData | null = null;
    if (finalizedLogs.length > 0) {
      const log = finalizedLogs[0];
      const eventLog = log as EventLog;
      const block = await provider.getBlock(log.blockNumber);

      finalized = {
        taskId: eventLog.args[0].toString(),
        finalScoreBps: Number(eventLog.args[1]),
        feePool: eventLog.args[2].toString(),
        blockNumber: log.blockNumber,
        blockTimestamp: block?.timestamp,
        transactionHash: log.transactionHash,
      };
    }

    return { revealed, finalized };
  } catch (error) {
    logger.error('Failed to fetch task events', { taskId, error });
    return { revealed: [], finalized: null };
  }
}

// ============================================================================
// Record Building
// ============================================================================

/**
 * Build a VerifiedOutputRecord for a task from on-chain events
 */
export async function getRecordForTask(taskId: string): Promise<VerifiedOutputRecord | null> {
  // Check cache first
  if (recordCache.has(taskId)) {
    return recordCache.get(taskId)!;
  }

  const { revealed, finalized } = await fetchTaskEvents(taskId);

  if (!finalized) {
    logger.debug('Task not finalized', { taskId });
    return null;
  }

  // Use the first revealed event for bundle info
  // (In case of multiple evaluators, we use the consensus score from Finalized)
  const revealedEvent = revealed[0];
  if (!revealedEvent) {
    logger.warn('No Revealed event found for finalized task', { taskId });
    return null;
  }

  const taskData: OnChainTaskData = {
    taskId,
    finalScoreBps: finalized.finalScoreBps,
    bundleHash: revealedEvent.bundleHash,
    bundleUri: revealedEvent.bundleUri,
    evaluator: revealedEvent.evaluator,
    finalizedAt: finalized.blockTimestamp || Math.floor(Date.now() / 1000),
    blockNumber: finalized.blockNumber,
    txHash: finalized.transactionHash,
  };

  const record = buildRecordFromChainData({
    taskData,
    chainId,
    contractAddress,
  });

  // Cache the record
  recordCache.set(taskId, record);

  return record;
}

/**
 * Index new records from recent blocks
 */
async function indexNewRecords(): Promise<void> {
  if (!provider) return;

  try {
    const currentBlock = await provider.getBlockNumber();
    const fromBlock = lastIndexedBlock > 0 ? lastIndexedBlock + 1 : Math.max(0, currentBlock - 10000);

    if (fromBlock > currentBlock) return;

    logger.debug('Indexing records', { fromBlock, toBlock: currentBlock });

    const finalizedEvents = await fetchFinalizedEvents(fromBlock, currentBlock);

    for (const finalized of finalizedEvents) {
      if (!recordCache.has(finalized.taskId)) {
        await getRecordForTask(finalized.taskId);
      }
    }

    lastIndexedBlock = currentBlock;
  } catch (error) {
    logger.error('Failed to index new records', error);
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Get a single record by task ID
 */
export async function getRecord(taskId: string): Promise<VerifiedOutputRecord | null> {
  if (!cacheInitialized) {
    await indexNewRecords();
    cacheInitialized = true;
  }

  return getRecordForTask(taskId);
}

/**
 * List records with filtering and pagination
 * Returns "worthy" records by default (score >= WORTHY_MIN_BPS)
 */
export async function listRecords(
  filter: RecordQueryFilter = {}
): Promise<{
  records: VerifiedOutputRecord[];
  total: number;
  has_more: boolean;
}> {
  // Ensure cache is populated
  if (!cacheInitialized) {
    await indexNewRecords();
    cacheInitialized = true;
  }

  // Default to worthy-only if not specified
  const effectiveFilter: RecordQueryFilter = {
    worthy_only: true, // Default: only worthy records
    ...filter,
  };

  // Filter records
  const allRecords = Array.from(recordCache.values());
  const filtered = allRecords
    .filter((record) => matchesFilter(record, effectiveFilter))
    .sort((a, b) => b.finalized_at - a.finalized_at); // Most recent first

  // Paginate
  const limit = filter.limit ?? 50;
  const offset = filter.offset ?? 0;

  return paginateRecords(filtered, limit, offset);
}

/**
 * Refresh the record cache by re-indexing from chain
 */
export async function refreshRecords(): Promise<void> {
  await indexNewRecords();
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  recordCount: number;
  lastIndexedBlock: number;
  cacheInitialized: boolean;
} {
  return {
    recordCount: recordCache.size,
    lastIndexedBlock,
    cacheInitialized,
  };
}

/**
 * Verify a record exists on-chain (for SDK verification)
 * Checks that the Finalized event exists for the given task
 */
export async function verifyRecordOnChain(taskId: string): Promise<{
  verified: boolean;
  blockNumber?: number;
  txHash?: string;
}> {
  const { finalized } = await fetchTaskEvents(taskId);

  if (!finalized) {
    return { verified: false };
  }

  return {
    verified: true,
    blockNumber: finalized.blockNumber,
    txHash: finalized.transactionHash,
  };
}
