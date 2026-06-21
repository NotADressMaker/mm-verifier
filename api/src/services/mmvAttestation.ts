import { Wallet, keccak256, toUtf8Bytes, verifyTypedData } from 'ethers';
import {
  MAMVAttestation,
  MAMV_EIP712_TYPES,
  getMmvEip712Domain,
} from '../../../shared/types';

export function hashVerifierVersion(version: string): string {
  return keccak256(toUtf8Bytes(version));
}

export async function signMAMVAttestation(
  privateKey: string,
  chainId: number,
  verifyingContract: string,
  attestation: MAMVAttestation
): Promise<string> {
  const wallet = new Wallet(privateKey);

  const domain = getMmvEip712Domain(chainId, verifyingContract);

  return wallet.signTypedData(domain, MAMV_EIP712_TYPES, {
    taskId: attestation.taskId,
    inputHash: attestation.inputHash,
    selectedOutputHash: attestation.selectedOutputHash,
    verifierVersionHash: attestation.verifierVersionHash,
    configHash: attestation.configHash,
    timestamp: attestation.timestamp,
    expiresAt: attestation.expiresAt,
    score: attestation.score,
    passed: attestation.passed,
  });
}

export function verifyMAMVAttestationSignature(
  chainId: number,
  verifyingContract: string,
  attestation: MAMVAttestation,
  signature: string
): string {
  const domain = getMmvEip712Domain(chainId, verifyingContract);

  return verifyTypedData(domain, MAMV_EIP712_TYPES, attestation, signature);
}
