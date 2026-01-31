import { Wallet } from 'ethers';
import { runDecisionGate } from '../src/services/decisionGate';
import { verifyMMVAttestationSignature } from '../src/services/mmvAttestation';
import { MMVVerificationResult } from '../../shared/types';

jest.mock('../src/services/mmvVerifier', () => ({
  verifyWithMMV: jest.fn(),
}));

const { verifyWithMMV } = jest.requireMock('../src/services/mmvVerifier');

describe('Decision gate integration', () => {
  beforeEach(() => {
    const wallet = new Wallet(
      '0x8b3a350cf5c34c9194ca3a545d1dfe54c4b7275a59b65e94a4cb6c1316a9f0f3'
    );
    process.env.MMV_SIGNER_PRIVATE_KEY = wallet.privateKey;
    process.env.MMV_CHAIN_ID = '42161';
    process.env.MMV_ATTESTATION_CONTRACT = '0x0000000000000000000000000000000000000002';
    process.env.MMV_MIN_PASS_SCORE = '70';
    process.env.MMV_MIN_CANDIDATE_SCORE = '60';
  });

  it('returns a signed attestation for passing verification', async () => {
    const mockResult: MMVVerificationResult = {
      taskId: '0x' + '11'.repeat(32),
      inputHash: '0x' + '22'.repeat(32),
      selectedIndex: 1,
      selectedOutputHash: '0x' + '33'.repeat(32),
      overallScore: 88,
      pass: true,
      candidateScores: [
        { index: 0, score: 70, confidence: 0.7, riskFlags: [], rationale: 'ok' },
        { index: 1, score: 90, confidence: 0.8, riskFlags: [], rationale: 'best' },
      ],
      rationale: {
        summary: 'good',
        checks: ['accuracy'],
        policyViolations: [],
        promptInjectionDetected: false,
      },
      verifier: {
        provider: 'openai',
        model: 'gpt-4-turbo',
        version: 'mmv-verifier@1.0.0',
        configHash: '0x' + '44'.repeat(32),
      },
      provenance: {
        provider: 'openai',
        model: 'gpt-4-turbo',
        prompt_hash: '0x' + '55'.repeat(32),
        response_hash: '0x' + '66'.repeat(32),
        started_at: 1700000000,
        finished_at: 1700000010,
        latency_ms: 10000,
        tokens_in: 120,
        tokens_out: 280,
      },
    };

    verifyWithMMV.mockResolvedValue(mockResult);

    const result = await runDecisionGate({
      taskId: 'task-1',
      input: 'input',
      candidates: ['a', 'b'],
      requesterId: 'tester',
    });

    const wallet = new Wallet(process.env.MMV_SIGNER_PRIVATE_KEY as string);
    const recovered = verifyMMVAttestationSignature(
      42161,
      process.env.MMV_ATTESTATION_CONTRACT as string,
      result.attestation,
      result.signature
    );

    expect(result.selectedOutput).toEqual('b');
    expect(recovered).toEqual(wallet.address);
  });
});
