import { createClient } from 'redis';
import { DebugTrace } from '../../../shared/observability/debugTrace';
import { logger } from '../utils/logger';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const inMemoryStore = new Map<string, DebugTrace>();

let client: ReturnType<typeof createClient> | null = null;

async function getClient() {
  if (client) {
    return client;
  }
  try {
    client = createClient({ url: REDIS_URL });
    client.on('error', (err) => logger.error('Debug trace redis error', { error: err }));
    await client.connect();
  } catch (error) {
    logger.warn('Falling back to in-memory debug trace store', { error });
    client = null;
  }
  return client;
}

function getKey(jobId: string) {
  return `debug:trace:${jobId}`;
}

export async function storeDebugTrace(jobId: string, trace: DebugTrace): Promise<void> {
  const redis = await getClient();
  if (!redis) {
    inMemoryStore.set(jobId, trace);
    return;
  }
  await redis.set(getKey(jobId), JSON.stringify(trace));
}

export async function getDebugTrace(jobId: string): Promise<DebugTrace | null> {
  const redis = await getClient();
  if (!redis) {
    return inMemoryStore.get(jobId) ?? null;
  }
  const raw = await redis.get(getKey(jobId));
  return raw ? (JSON.parse(raw) as DebugTrace) : null;
}
