import fetch from 'node-fetch';
import { MmvValidationRequest, ValidationReceipt } from '../../../shared/validationTypes';
import { config } from './config';

export interface PendingRequestResponse {
  requests: Array<{
    request: MmvValidationRequest;
    status: string;
  }>;
}

export async function fetchPendingRequests(): Promise<MmvValidationRequest[]> {
  const response = await fetch(`${config.apiBaseUrl}/api/validation/requests?status=PENDING&limit=50`);
  if (!response.ok) {
    throw new Error(`Failed to fetch requests: ${response.statusText}`);
  }
  const data = (await response.json()) as PendingRequestResponse;
  return data.requests.map((item) => item.request);
}

export async function postReceipt(requestId: string, receipt: ValidationReceipt): Promise<void> {
  const response = await fetch(`${config.apiBaseUrl}/api/validation/requests/${requestId}/results`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-validator-id': receipt.validatorId,
    },
    body: JSON.stringify({ receipt }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to post receipt: ${response.status} ${text}`);
  }
}
