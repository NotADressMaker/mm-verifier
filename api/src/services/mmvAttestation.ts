import { Wallet, keccak256, toUtf8Bytes, verifyTypedData } from 'ethers';
import {
  MMVAttestation,
  MMV_EIP712_TYPES,
  getMmvEip712Domain,
} from '../../../shared/types';

export function hashVerifierVersion(version: string): string {
  return keccak256(toUtf8Bytes(version));
}

export async function signMMVAttestation(
  privateKey: string,
  chainId: number,
  verifyingContract: string,
  attestation: MMVAttestation
): Promise<string> {
  const wallet = new Wallet(privateKey);

  const domain = getMmvEip712Domain(chainId, verifyingContract);

  return wallet.signTypedData(domain, MMV_EIP712_TYPES, {
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

export function verifyMMVAttestationSignature(
  chainId: number,
  verifyingContract: string,
  attestation: MMVAttestation,
  signature: string
): string {
  const domain = getMmvEip712Domain(chainId, verifyingContract);

  return verifyTypedData(domain, MMV_EIP712_TYPES, attestation, signature);
}
