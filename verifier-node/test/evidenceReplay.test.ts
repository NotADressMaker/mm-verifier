import fs from 'fs';
import path from 'path';
import { keccak256, toUtf8Bytes } from 'ethers';
import { canonicalize } from '../../shared/canonicalJson';
import { computeModelCommitment } from '../../shared/transparency';
import { canonicalizeBundle, computeBundleHash, verifyTranscript } from '../../shared/evidenceReplay';
import { EvidenceBundle } from '../../shared/types';

function buildReplayBundle(): EvidenceBundle {
  const rawOutput = 'The sum is 4.';
  const outputHash = keccak256(toUtf8Bytes(rawOutput)) as `0x${string}`;
  const messages: Array<{ role: 'user'; content: string }> = [
    { role: 'user', content: 'What is 2+2?' },
  ];
  const messagesHash = keccak256(toUtf8Bytes(canonicalize(messages))) as `0x${string}`;

  const promptHash = ('0x' + '22'.repeat(32)) as `0x${string}`;
  const rubricHash = ('0x' + '33'.repeat(32)) as `0x${string}`;
  const inputHash = ('0x' + '55'.repeat(32)) as `0x${string}`;
  const outputContentHash = ('0x' + '66'.repeat(32)) as `0x${string}`;
  const modelCommitmentHash = ('0x' + '77'.repeat(32)) as `0x${string}`;
  const systemPromptHash = ('0x' + '88'.repeat(32)) as `0x${string}`;

  return {
    version: '1.1.0',
    task_id: 'task-replay',
    bundle_version: '0.3',
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
        raw_output: rawOutput,
        output_hash: outputHash,
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
    output: { content_type: 'text', content_hash: outputContentHash },
    provenance: {
      model_runs: [
        {
          provider: 'openai',
          model: 'gpt-4',
          prompt_hash: promptHash,
          response_hash: outputHash,
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
    replay: {
      model_identity: {
        model_name: 'gpt-4',
        provider: 'openai',
        model_version: '2024-01-01',
        model_commitment_hash: modelCommitmentHash,
      },
      invocation: {
        temperature: 0.1,
        top_p: 1,
        max_tokens: 64,
        seed: 42,
        system_prompt_hash: systemPromptHash,
        safety_modes: ['default'],
      },
      transcript: {
        canonicalization: {
          newline: 'lf',
          json: 'canonical',
        },
        messages,
        outputs: [{ content: rawOutput }],
        message_hashes: {
          messages_hash: messagesHash as `0x${string}`,
        },
      },
      replay_recipe: {
        provider: 'openai',
        parameters: { temperature: 0.1 },
        messages,
        replay_expected: {
          prompt_hash: promptHash,
          output_hash: outputHash,
        },
      },
    },
  };
}

describe('evidence replay utilities', () => {
  it('canonicalizes bundle deterministically', () => {
    const bundle = buildReplayBundle();
    const canonical = canonicalizeBundle(bundle);
    const hash = computeBundleHash(bundle, 'keccak256');

    expect(canonical.length).toBeGreaterThan(0);
    expect(hash).toMatch(/^0x[0-9a-fA-F]{64}$/);
  });

  it('verifies transcript hashes and output hashes', () => {
    const bundle = buildReplayBundle();
    const result = verifyTranscript(bundle);
    expect(result.valid).toBe(true);
  });

  it('verifies replayable fixture bundle', () => {
    const fixturePath = path.join(__dirname, 'fixtures', 'replayable-bundle.json');
    const raw = fs.readFileSync(fixturePath, 'utf8');
    const bundle = JSON.parse(raw) as EvidenceBundle;
    const result = verifyTranscript(bundle);
    expect(result.valid).toBe(true);
  });

  it('changes model commitment when model version changes', () => {
    const base = computeModelCommitment({
      provider: 'openai',
      model: 'gpt-4',
      version: '2024-01-01',
      inference_config: { temperature: 0.1 },
    });
    const changed = computeModelCommitment({
      provider: 'openai',
      model: 'gpt-4',
      version: '2024-02-01',
      inference_config: { temperature: 0.1 },
    });

    expect(base.model_commitment_hash).not.toEqual(changed.model_commitment_hash);
  });

  it('changes bundle hash when replay params change', () => {
    const bundle = buildReplayBundle();
    const baseHash = computeBundleHash(bundle, 'keccak256');
    if (bundle.bundle_version !== '0.3' || !bundle.replay) {
      throw new Error('Expected v0.3 bundle with replay metadata');
    }
    bundle.replay.invocation.seed = 99;
    const updatedHash = computeBundleHash(bundle, 'keccak256');
    expect(baseHash).not.toEqual(updatedHash);
  });
});
