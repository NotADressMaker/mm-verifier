import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { VerifierPlugin } from './types';
import {
  MmvValidationRequest,
  MmvResult,
  TeeOrZkRequestPayload,
} from '../../../../shared/validationTypes';
import { config } from '../config';
import { hashDetails, hashOutput } from '../hash';

async function loadProof(proofURI: string): Promise<string> {
  if (proofURI.startsWith('file://')) {
    const filePath = proofURI.replace('file://', '');
    return fs.readFileSync(filePath, 'utf8');
  }
  if (proofURI.startsWith('http://') || proofURI.startsWith('https://')) {
    const response = await fetch(proofURI);
    return response.text();
  }
  if (fs.existsSync(proofURI)) {
    return fs.readFileSync(path.resolve(proofURI), 'utf8');
  }
  throw new Error('Unsupported proof URI');
}

export const teeOrZkPlugin: VerifierPlugin = {
  name: 'tee_or_zk',
  canHandle(request: MmvValidationRequest): boolean {
    return request.plugin === 'tee_or_zk';
  },
  async verify(request: MmvValidationRequest): Promise<MmvResult> {
    const payload = request.payload as TeeOrZkRequestPayload;
    const proofContent = await loadProof(payload.proofURI);
    const computedHash = hashOutput(proofContent);
    const hashMatches = computedHash === payload.proofHash;
    const keyMatches = config.verifierKeyId.length > 0 && config.verifierKeyId === payload.verifierKeyId;

    const verdict = hashMatches && keyMatches ? 'PARTIAL' : 'FAIL';
    const score = hashMatches && keyMatches ? 50 : 0;

    const details = {
      proofURI: payload.proofURI,
      attestationType: payload.attestationType,
      computedHash,
      hashMatches,
      verifierKeyId: payload.verifierKeyId,
      keyMatches,
    };

    const detailsHash = hashDetails(details);
    const receiptURI = `${config.receiptBaseUrl}/receipts/${request.requestId}`;

    return {
      score0to100: score,
      verdict,
      tag: 'tee_or_zk_stub',
      receiptURI,
      receiptHash: detailsHash,
      detailsHash,
    };
  },
};
