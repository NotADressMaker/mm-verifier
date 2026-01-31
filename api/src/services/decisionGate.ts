import { logger } from '../utils/logger';
import { MMVAttestation, MMVReceipt, MMVVerificationInput } from '../../../shared/types';
import { verifyWithMMV } from './mmvVerifier';
import { hashCanonical, normalizeBytes32 } from './mmvHasher';
import { hashVerifierVersion, signMMVAttestation } from './mmvAttestation';
import { loadMMVConfig } from './mmvConfig';
import { getChainIdFromEnv } from '../../../shared/env';
import { buildMMVReceipt } from './mmvReceipt';
import { writeMMVAuditRecord } from './mmvAudit';

export type DecisionGateRequest = {
  taskId: string;
  input: string;
  candidates: string[];
  evidence?: Record<string, unknown>;
  requesterId: string;
};

export type DecisionGateResult = {
  attestation: MMVAttestation;
  signature: string;
  selectedOutput: string;
  receipt: MMVReceipt;
};

export async function runDecisionGate(
  request: DecisionGateRequest
): Promise<DecisionGateResult> {
  const config = loadMMVConfig();
  const candidates = request.candidates.map((output, index) => ({
    index,
    output,
    outputHash: hashCanonical({ output }),
  }));

  const verificationInput: MMVVerificationInput = {
    taskId: normalizeBytes32(request.taskId),
    input: request.input,
    candidates,
    evidence: request.evidence,
  };

  const verification = await verifyWithMMV(verificationInput, request.requesterId);

  const selectedOutput = request.candidates[verification.selectedIndex];

  const passThresholdMet =
    verification.pass &&
    verification.overallScore >= config.minPassScore &&
    verification.candidateScores[verification.selectedIndex].score >= config.minCandidateScore;

  if (!passThresholdMet) {
    logger.warn('Decision gate blocked action', {
      taskId: request.taskId,
      overallScore: verification.overallScore,
      selectedScore: verification.candidateScores[verification.selectedIndex].score,
      pass: verification.pass,
    });
    throw new Error('MMV decision gate blocked action');
  }

  const chainId = getChainIdFromEnv();
  const verifyingContract = process.env.MMV_ATTESTATION_CONTRACT || '0x0000000000000000000000000000000000000000';
  const signerKey = process.env.MMV_SIGNER_PRIVATE_KEY;

  if (!signerKey) {
    throw new Error('MMV_SIGNER_PRIVATE_KEY not configured');
  }
  if (!chainId) {
    throw new Error('MMV_CHAIN_ID or CHAIN_ID must be configured');
  }

  const attestation: MMVAttestation = {
    taskId: verification.taskId,
    inputHash: verification.inputHash,
    selectedOutputHash: verification.selectedOutputHash,
    verifierVersionHash: hashVerifierVersion(config.version),
    configHash: verification.verifier.configHash,
    timestamp: Math.floor(Date.now() / 1000),
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    score: verification.overallScore,
    passed: verification.pass,
  };

  const signature = await signMMVAttestation(signerKey, chainId, verifyingContract, attestation);

  logger.info('Decision gate attestation signed', {
    taskId: request.taskId,
    selectedOutputHash: attestation.selectedOutputHash,
  });

  const receipt = buildMMVReceipt(verification, {
    attestation,
    signature,
    chainId,
    verifyingContract,
  });

  await writeMMVAuditRecord({
    type: 'mmv_attestation',
    taskId: request.taskId,
    inputHash: verification.inputHash,
    selectedOutputHash: attestation.selectedOutputHash,
    pass: attestation.passed,
    overallScore: attestation.score,
    configHash: verification.verifier.configHash,
    verifierVersionHash: attestation.verifierVersionHash,
    receipt,
    timestamp: new Date().toISOString(),
  });

  return {
    attestation,
    signature,
    selectedOutput,
    receipt,
  };
}
