import { MMVAttestation, MMVReceipt, MMVVerificationResult } from '../../../shared/types';

type AttestationPayload = {
  attestation: MMVAttestation;
  signature: string;
  chainId: number;
  verifyingContract: string;
};

export function buildMMVReceipt(
  result: MMVVerificationResult,
  attestationPayload?: AttestationPayload
): MMVReceipt {
  if (!result.provenance) {
    throw new Error('MMV provenance data is required to build receipt');
  }

  return {
    receipt_version: '0.1',
    generated_at: new Date().toISOString(),
    task_id: result.taskId,
    input_hash: result.inputHash,
    selected_output_hash: result.selectedOutputHash,
    decision: {
      pass: result.pass,
      overall_score: result.overallScore,
      selected_index: result.selectedIndex,
      candidate_scores: result.candidateScores,
    },
    verifier: {
      provider: result.verifier.provider,
      model: result.verifier.model,
      version: result.verifier.version,
      config_hash: result.verifier.configHash,
    },
    provenance: result.provenance,
    attestation: attestationPayload
      ? {
          chain_id: attestationPayload.chainId,
          verifying_contract: attestationPayload.verifyingContract,
          signature: attestationPayload.signature,
          attestation: attestationPayload.attestation,
        }
      : undefined,
  };
}
