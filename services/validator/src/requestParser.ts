import { MmvValidationRequest } from '../../../shared/validationTypes';

export function parseValidationRequest(input: unknown): MmvValidationRequest {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid request payload');
  }

  const request = input as MmvValidationRequest;
  if (!request.requestId || !request.plugin || !request.payload || !request.workHash) {
    throw new Error('Missing required request fields');
  }
  return request;
}
