import { MmvValidationRequest, MmvResult } from '../../../../shared/validationTypes';

export interface VerifierPlugin {
  name: string;
  canHandle(request: MmvValidationRequest): boolean;
  verify(request: MmvValidationRequest): Promise<MmvResult>;
}
