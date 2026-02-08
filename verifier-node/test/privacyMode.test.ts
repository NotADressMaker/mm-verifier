import { createECDH } from 'crypto';
import { decryptEvidenceBundle, encryptEvidenceBundle } from '../../shared/privacyMode';
import { EvidenceBundle } from '../../shared/types';

function buildBundle(): EvidenceBundle {
  const promptHash = ('0x' + '22'.repeat(32)) as `0x${string}`;
  const rubricHash = ('0x' + '33'.repeat(32)) as `0x${string}`;
  const inputHash = ('0x' + '55'.repeat(32)) as `0x${string}`;
  const outputHash = ('0x' + '66'.repeat(32)) as `0x${string}`;
  const responseHash = ('0x' + '44'.repeat(32)) as `0x${string}`;

  return {
    version: '1.1.0',
    task_id: 'privacy-task',
    bundle_version: '0.2',
    created_at: '2024-01-01T00:00:00Z',
    evaluator: {
      node_id: 'node-1',
      eth_address: '0x' + '11'.repeat(20),
      software: { name: 'verifier-node', ver: '0.1.0', commit: 'abc123' },
    },
    prompt_hash: promptHash,
    rubric_hash: rubricHash,
    model_runs: [
      {
        provider: 'openai',
        model: 'gpt-4',
        temperature: 0.1,
        raw_output: 'Sensitive output',
        output_hash: responseHash,
      },
    ],
    claims: [],
    metrics: {
      consensus: { agreement: 1, clusters: 1 },
      factuality: { supported_claim_ratio: 1 },
      citation_quality: { authority_score: 1 },
      bias: { sensitive_variance: 0 },
      stability: { reask_delta: 0 },
    },
    final_score_bps: 9000,
    explanation: 'ok',
    signatures: { bundle_sig_eip712: '0x' + '11'.repeat(65) },
    input: { content_type: 'text', content_hash: inputHash },
    output: { content_type: 'text', content_hash: outputHash },
    provenance: {
      model_runs: [
        {
          provider: 'openai',
          model: 'gpt-4',
          prompt_hash: promptHash,
          response_hash: responseHash,
          started_at: 1,
          finished_at: 2,
        },
      ],
    },
    scoring_trace: {
      rubric_hash: rubricHash,
      score_bps: 9000,
      verdict: 'reliable',
      breakdown: {},
      generated_at: 1,
    },
  };
}

describe('privacy mode encryption', () => {
  it('encrypts and decrypts bundle payload', () => {
    const ecdh = createECDH('secp256k1');
    ecdh.generateKeys();
    const recipientPubkey = `0x${ecdh.getPublicKey().toString('hex')}`;
    const recipientPrivkey = `0x${ecdh.getPrivateKey().toString('hex')}`;

    const bundle = buildBundle();
    const encrypted = encryptEvidenceBundle({
      bundle,
      recipients: [recipientPubkey],
    });

    const decrypted = decryptEvidenceBundle({
      encryptedBundle: encrypted.encryptedBundle,
      encryptedPayload: encrypted.encryptedPayload,
      recipientPrivateKey: recipientPrivkey,
    });

    expect(decrypted.task_id).toEqual(bundle.task_id);
    expect(decrypted.model_runs[0].raw_output).toEqual(bundle.model_runs[0].raw_output);
  });

  it('fails to decrypt with wrong recipient', () => {
    const ecdh = createECDH('secp256k1');
    ecdh.generateKeys();
    const recipientPubkey = `0x${ecdh.getPublicKey().toString('hex')}`;

    const bundle = buildBundle();
    const encrypted = encryptEvidenceBundle({
      bundle,
      recipients: [recipientPubkey],
    });

    const wrong = createECDH('secp256k1');
    wrong.generateKeys();
    const wrongPrivkey = `0x${wrong.getPrivateKey().toString('hex')}`;

    expect(() =>
      decryptEvidenceBundle({
        encryptedBundle: encrypted.encryptedBundle,
        encryptedPayload: encrypted.encryptedPayload,
        recipientPrivateKey: wrongPrivkey,
      })
    ).toThrow('No matching key envelope for recipient');
  });
});
