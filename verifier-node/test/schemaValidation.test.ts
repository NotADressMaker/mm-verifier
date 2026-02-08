import {
  validateEvidenceBundlePayload,
  validateEvidenceBundleV1,
  validateReceiptV1,
} from '../../shared/schemaValidation';

const validBundleV1 = {
  schema_version: '1',
  version: '1.0.0',
  task_id: 'task-1',
  bundle_version: '0.2',
  created_at: '2024-01-01T00:00:00Z',
  evaluator: {
    node_id: 'node-1',
    eth_address: '0x' + '11'.repeat(20),
    software: { name: 'verifier-node', ver: '0.1.0', commit: 'abc123' },
  },
  prompt_hash: '0x' + '22'.repeat(32),
  rubric_hash: '0x' + '33'.repeat(32),
  model_runs: [
    {
      provider: 'openai',
      model: 'gpt-4',
      temperature: 0.1,
      raw_output: 'hello',
      output_hash: '0x' + '44'.repeat(32),
    },
  ],
  claims: [],
  metrics: {
    consensus: { agreement: 0.9, clusters: 1 },
    factuality: { supported_claim_ratio: 0.9 },
    citation_quality: { authority_score: 0.9 },
    bias: { sensitive_variance: 0 },
    stability: { reask_delta: 0.1 },
  },
  final_score_bps: 9000,
  explanation: 'ok',
  signatures: { bundle_sig_eip712: '0x' + '11'.repeat(65) },
  input: { content_type: 'text', content_hash: '0x' + '55'.repeat(32) },
  output: { content_type: 'text', content_hash: '0x' + '66'.repeat(32) },
  provenance: {
    model_runs: [
      {
        provider: 'openai',
        model: 'gpt-4',
        prompt_hash: '0x' + '22'.repeat(32),
        response_hash: '0x' + '44'.repeat(32),
        started_at: 1,
        finished_at: 2,
      },
    ],
  },
  scoring_trace: {
    rubric_hash: '0x' + '33'.repeat(32),
    score_bps: 9000,
    verdict: 'reliable',
    breakdown: {},
    generated_at: 1,
  },
};

const validBundleV2 = {
  ...validBundleV1,
  version: '1.1.0',
  bundle_version: '0.3',
  replay: {
    model_identity: {
      model_name: 'gpt-4',
      provider: 'openai',
      model_version: '2024-01-01',
      model_commitment_hash: '0x' + '77'.repeat(32),
    },
    invocation: {
      temperature: 0.1,
      top_p: 1,
      max_tokens: 100,
      seed: 42,
      system_prompt_hash: '0x' + '88'.repeat(32),
      safety_modes: ['default'],
    },
    transcript: {
      canonicalization: {
        newline: 'lf',
        json: 'canonical',
      },
      messages: [
        { role: 'user', content: 'Hello' },
      ],
      outputs: [
        { content: 'World', timestamp: 1, request_id: 'req_1' },
      ],
    },
    replay_recipe: {
      provider: 'openai',
      endpoint_id: 'https://api.openai.com/v1/chat/completions',
      parameters: { temperature: 0.1 },
      messages: [{ role: 'user', content: 'Hello' }],
      replay_expected: {
        prompt_hash: '0x' + '22'.repeat(32),
        output_hash: '0x' + '44'.repeat(32),
      },
    },
  },
};

const validReceipt = {
  schema_version: '1',
  version: '1.0.0',
  receipt_version: '1.0.0',
  task_id: 'task-1',
  generated_at: 1700000000,
  input_hash: '0x' + '11'.repeat(32),
  output_hash: '0x' + '22'.repeat(32),
  score_bps: 9000,
  verdict: true,
  worthy: true,
  program: {
    id: 'factual-consensus',
    version: '1.0.0',
    hash: 'a'.repeat(64),
  },
  evidence: {
    bundle_hash: '0x' + '33'.repeat(32),
    bundle_uri: 'ipfs://bundle',
    bundle_version: '0.2',
  },
  provenance: {
    llm_provider: 'openai',
    llm_model: 'gpt-4',
  },
  explain: {
    version: '1.0.0',
    score_components: [],
    checks: {},
    checks_fired: [],
    uncertain_claims: [],
    score_adjustments: [],
    contradictions_found: [],
    citation_checks: [],
    model_disagreement: {
      models: [],
      agreement_rate: 0,
    },
  },
};

describe('Schema validation (verifier-node)', () => {
  it('accepts valid receipt', () => {
    const result = validateReceiptV1(validReceipt);
    expect(result.valid).toBe(true);
  });

  it('rejects invalid receipt hash', () => {
    const invalid = { ...validReceipt, input_hash: 'not-a-hash' };
    const result = validateReceiptV1(invalid);
    expect(result.valid).toBe(false);
  });

  it('accepts valid evidence bundle', () => {
    const result = validateEvidenceBundleV1(validBundleV1);
    expect(result.valid).toBe(true);
  });

  it('rejects bundle with wrong type', () => {
    const invalid = { ...validBundleV1, final_score_bps: 'oops' };
    const result = validateEvidenceBundleV1(invalid);
    expect(result.valid).toBe(false);
  });

  it('accepts valid v2 evidence bundle payload', () => {
    const result = validateEvidenceBundlePayload(validBundleV2);
    expect(result.valid).toBe(true);
  });
});
