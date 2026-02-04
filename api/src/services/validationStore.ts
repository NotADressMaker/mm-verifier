import { v4 as uuidv4 } from 'uuid';
import { hashCanonical } from '../../../shared/canonicalJson';
import {
  MmvValidationRequest,
  ValidationReceipt,
  ValidatorSummary,
} from '../../../shared/validationTypes';

type ValidationStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

interface StoredRequest {
  request: MmvValidationRequest;
  status: ValidationStatus;
}

const requestStore = new Map<string, StoredRequest>();
const receiptStore = new Map<string, ValidationReceipt>();
const receiptHistory = new Map<string, ValidationReceipt[]>();
const validatorStats = new Map<string, ValidatorSummary>();

export function createValidationRequest(
  plugin: MmvValidationRequest['plugin'],
  payload: MmvValidationRequest['payload'],
  requesterId?: string,
  tags?: string[]
): MmvValidationRequest {
  const requestId = uuidv4();
  const createdAt = new Date().toISOString();
  const workHash = hashCanonical({ plugin, payload });
  const proofHash = 'proofHash' in payload ? payload.proofHash : undefined;

  const request: MmvValidationRequest = {
    requestId,
    createdAt,
    plugin,
    payload,
    workHash,
    proofHash,
    requesterId,
    tags,
  };

  requestStore.set(requestId, {
    request,
    status: 'PENDING',
  });

  return request;
}

export function listValidationRequests(status?: ValidationStatus, limit = 50): StoredRequest[] {
  const allRequests = Array.from(requestStore.values());
  const filtered = status
    ? allRequests.filter((item) => item.status === status)
    : allRequests;
  return filtered.slice(0, limit);
}

export function getValidationRequest(requestId: string): StoredRequest | null {
  return requestStore.get(requestId) ?? null;
}

export function recordValidationReceipt(receipt: ValidationReceipt): void {
  receiptStore.set(receipt.receiptId, receipt);

  const history = receiptHistory.get(receipt.requestId) ?? [];
  history.push(receipt);
  receiptHistory.set(receipt.requestId, history);

  const existing = validatorStats.get(receipt.validatorId);
  if (!existing) {
    validatorStats.set(receipt.validatorId, {
      validatorId: receipt.validatorId,
      firstSeenAt: receipt.timestamp,
      lastSeenAt: receipt.timestamp,
      totalValidations: 1,
      failureCount: receipt.verdict === 'FAIL' ? 1 : 0,
      passCount: receipt.verdict === 'PASS' ? 1 : 0,
      partialCount: receipt.verdict === 'PARTIAL' ? 1 : 0,
    });
  } else {
    validatorStats.set(receipt.validatorId, {
      ...existing,
      lastSeenAt: receipt.timestamp,
      totalValidations: existing.totalValidations + 1,
      failureCount: existing.failureCount + (receipt.verdict === 'FAIL' ? 1 : 0),
      passCount: existing.passCount + (receipt.verdict === 'PASS' ? 1 : 0),
      partialCount: existing.partialCount + (receipt.verdict === 'PARTIAL' ? 1 : 0),
    });
  }

  const request = requestStore.get(receipt.requestId);
  if (request) {
    requestStore.set(receipt.requestId, {
      ...request,
      status: receipt.verdict === 'FAIL' ? 'FAILED' : 'COMPLETED',
    });
  }
}

export function getReceipt(receiptId: string): ValidationReceipt | null {
  return receiptStore.get(receiptId) ?? null;
}

export function getReceiptHistory(requestId: string): ValidationReceipt[] {
  return receiptHistory.get(requestId) ?? [];
}

export function getLatestReceiptForRequest(requestId: string): ValidationReceipt | null {
  const history = receiptHistory.get(requestId);
  if (!history || history.length === 0) {
    return null;
  }
  return history[history.length - 1];
}

export function getValidatorSummary(validatorId: string): ValidatorSummary | null {
  return validatorStats.get(validatorId) ?? null;
}
