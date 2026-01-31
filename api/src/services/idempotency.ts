import { VerifyResponse } from '../../../shared/httpSchemas';

interface IdempotencyRecord {
  response: VerifyResponse;
  createdAt: number;
}

const idempotencyStore = new Map<string, IdempotencyRecord>();

export function getIdempotencyRecord(key: string): IdempotencyRecord | undefined {
  return idempotencyStore.get(key);
}

export function setIdempotencyRecord(key: string, response: VerifyResponse): void {
  idempotencyStore.set(key, { response, createdAt: Date.now() });
}

export function clearIdempotencyStore(): void {
  idempotencyStore.clear();
}
