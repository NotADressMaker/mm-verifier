import { validateEvidenceBundleV1, validateReceiptV1 } from '../../shared/schemaValidation';

const validBundle = {
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

describe('Schema validation (API)', () => {
  it('accepts a valid receipt', () => {
    const result = validateReceiptV1(validReceipt);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects oversized task_id', () => {
    const invalid = { ...validReceipt, task_id: 'a'.repeat(129) };
    const result = validateReceiptV1(invalid);
    expect(result.valid).toBe(false);
  });

  it('accepts a valid evidence bundle', () => {
    const result = validateEvidenceBundleV1(validBundle);
    expect(result.valid).toBe(true);
  });

  it('rejects evidence bundle missing version', () => {
    const { version, ...invalid } = validBundle as any;
    const result = validateEvidenceBundleV1(invalid);
    expect(result.valid).toBe(false);
  });
});
