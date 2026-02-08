import { DebugTrace } from '../../../shared/observability/debugTrace';
import { redisClient } from './redis';

const inMemoryStore = new Map<string, DebugTrace>();

function getKey(jobId: string) {
  return `debug:trace:${jobId}`;
}

export async function storeDebugTrace(jobId: string, trace: DebugTrace): Promise<void> {
  if (!redisClient) {
    inMemoryStore.set(jobId, trace);
    return;
  }
  await redisClient.set(getKey(jobId), JSON.stringify(trace));
}

export async function getDebugTrace(jobId: string): Promise<DebugTrace | null> {
  if (!redisClient) {
    return inMemoryStore.get(jobId) ?? null;
  }
  const raw = await redisClient.get(getKey(jobId));
  return raw ? (JSON.parse(raw) as DebugTrace) : null;
}
