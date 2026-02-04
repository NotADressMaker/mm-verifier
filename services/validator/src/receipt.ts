import { hashCanonical } from '../../../shared/canonicalJson';
import {
  MmvResult,
  MmvValidationRequest,
  ValidationReceipt,
} from '../../../shared/validationTypes';
import { config } from './config';

export function buildReceipt(
  request: MmvValidationRequest,
  result: MmvResult,
  logsHash: string,
  environmentHash: string
): ValidationReceipt {
  const receiptId = `${request.requestId}-${Date.now()}`;
  const receipt: ValidationReceipt = {
    receiptId,
    requestId: request.requestId,
    plugin: request.plugin,
    timestamp: new Date().toISOString(),
    verdict: result.verdict,
    score: result.score0to100,
    tag: result.tag,
    receiptHash: '',
    logsHash,
    environmentHash,
    validatorId: config.validatorId,
    workHash: request.workHash,
    proofHash: request.proofHash,
    receiptURI: `${config.receiptBaseUrl}/receipts/${receiptId}`,
  };

  const receiptHash = hashCanonical({
    ...receipt,
    receiptHash: undefined,
  });

  receipt.receiptHash = receiptHash;
  return receipt;
}
