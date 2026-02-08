import { getRedisClient } from './redis';
import { logger } from '../utils/logger';
import {
  buildMockJobRecord,
  MockJobRecord,
  MockJobStatus,
  MockStatusEvent,
  MOCK_REDIS_KEYS,
} from '../../../shared/mockVerifier';

export async function createMockJob(params: {
  jobId: string;
  prompt: string;
  promptHash: string;
  models: string[];
  taskType: string;
  programId?: string;
  programVersion?: string;
  scenario: MockJobRecord['scenario'];
  storeEvidence?: boolean;
}): Promise<MockJobRecord> {
  const client = getRedisClient();
  const allowPlaintext = process.env.ALLOW_PLAINTEXT_STORAGE === 'true';
  const hashedOnlyDefault = process.env.HASHED_ONLY_DEFAULT !== 'false';
  const shouldStoreEvidence =
    typeof params.storeEvidence === 'boolean' ? params.storeEvidence : !hashedOnlyDefault;
  const record = buildMockJobRecord({
    ...params,
    includePrompt: allowPlaintext && shouldStoreEvidence,
    storageMode: shouldStoreEvidence ? 'encrypted' : 'hashed-only',
  });

  await client.set(MOCK_REDIS_KEYS.job(params.jobId), JSON.stringify(record));
  await client.rPush(MOCK_REDIS_KEYS.jobs, params.jobId);

  logger.info('Mock job created', { jobId: params.jobId, scenario: params.scenario });

  return record;
}

export async function updateMockJobStatus(
  jobId: string,
  status: MockJobStatus,
  extras?: Partial<MockJobRecord>
): Promise<MockJobRecord | null> {
  const record = await getMockJob(jobId);
  if (!record) {
    return null;
  }

  const now = new Date().toISOString();
  const statusHistory: MockStatusEvent[] = [...record.statusHistory, { status, timestamp: now }];

  const updated: MockJobRecord = {
    ...record,
    status,
    updatedAt: now,
    statusHistory,
    ...extras,
  };

  const client = getRedisClient();
  await client.set(MOCK_REDIS_KEYS.job(jobId), JSON.stringify(updated));

  return updated;
}

export async function getMockJob(jobId: string): Promise<MockJobRecord | null> {
  const client = getRedisClient();
  const raw = await client.get(MOCK_REDIS_KEYS.job(jobId));
  return raw ? (JSON.parse(raw) as MockJobRecord) : null;
}

export async function listMockJobs(): Promise<MockJobRecord[]> {
  const client = getRedisClient();
  const ids = await client.lRange(MOCK_REDIS_KEYS.jobs, 0, -1);
  const records = await Promise.all(ids.map((id) => getMockJob(id)));
  return records.filter((record): record is MockJobRecord => Boolean(record));
}

export async function storeMockReceipt(jobId: string, receipt: unknown): Promise<void> {
  const client = getRedisClient();
  await client.set(MOCK_REDIS_KEYS.receipt(jobId), JSON.stringify(receipt));
}

export async function getMockReceipt(jobId: string): Promise<unknown | null> {
  const client = getRedisClient();
  const raw = await client.get(MOCK_REDIS_KEYS.receipt(jobId));
  return raw ? JSON.parse(raw) : null;
}

export async function storeMockBundle(jobId: string, bundle: unknown): Promise<void> {
  const client = getRedisClient();
  await client.set(MOCK_REDIS_KEYS.bundle(jobId), JSON.stringify(bundle));
}

export async function getMockBundle(jobId: string): Promise<unknown | null> {
  const client = getRedisClient();
  const raw = await client.get(MOCK_REDIS_KEYS.bundle(jobId));
  return raw ? JSON.parse(raw) : null;
}

export async function storeMockDisputes(jobId: string, disputes: unknown): Promise<void> {
  const client = getRedisClient();
  await client.set(MOCK_REDIS_KEYS.disputes(jobId), JSON.stringify(disputes));
}

export async function getMockDisputes(jobId: string): Promise<unknown[] | null> {
  const client = getRedisClient();
  const raw = await client.get(MOCK_REDIS_KEYS.disputes(jobId));
  return raw ? (JSON.parse(raw) as unknown[]) : null;
}
