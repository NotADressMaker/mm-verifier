import { hashUtf8, hashCanonical } from './canonicalJson';
import { buildReceipt, ReceiptExplain, VerificationReceipt } from './receipt';
import { EvidenceBundle, EvidenceBundleV01, ModelRun, Claim, Metrics } from './types';

export type MockScenario = 'happy' | 'fail' | 'dispute';
export type MockJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export type MockStatusEvent = {
  status: MockJobStatus;
  timestamp: string;
};

export type MockDisputeEvent = {
  id: string;
  type: 'challenge_opened' | 'challenge_resolved' | 'appeal' | 'finalized';
  status: 'open' | 'resolved' | 'pending';
  timestamp: string;
  summary: string;
};

export type MockJobRecord = {
  jobId: string;
  status: MockJobStatus;
  createdAt: string;
  updatedAt: string;
  prompt: string;
  promptHash: string;
  models: string[];
  taskType: string;
  programId?: string;
  programVersion?: string;
  scenario: MockScenario;
  statusHistory: MockStatusEvent[];
  scoreBps?: number;
  verdict?: boolean;
  disputed?: boolean;
};

export const MOCK_REDIS_KEYS = {
  jobs: 'mock:jobs',
  job: (jobId: string) => `mock:job:${jobId}`,
  receipt: (jobId: string) => `mock:receipt:${jobId}`,
  bundle: (jobId: string) => `mock:bundle:${jobId}`,
  disputes: (jobId: string) => `mock:disputes:${jobId}`,
};

export function resolveMockScenario(value?: string): MockScenario {
  switch ((value || '').toLowerCase()) {
    case 'fail':
      return 'fail';
    case 'dispute':
      return 'dispute';
    case 'happy':
    default:
      return 'happy';
  }
}

export function deriveDeterministicScore(taskId: string, scenario: MockScenario): number {
  if (scenario === 'fail') {
    return 4200;
  }
  const hash = hashUtf8(taskId);
  const slice = Number.parseInt(hash.slice(2, 10), 16);
  const delta = slice % 2000;
  return Math.min(9500, 7000 + delta);
}

function buildMockModelRun(prompt: string): { modelRun: ModelRun; output: string } {
  const output = `Mock response for: ${prompt}`;
  const outputHash = hashUtf8(output);

  const modelRun: ModelRun = {
    provider: 'mock',
    model: 'mock-llm',
    temperature: 0.2,
    raw_output: output,
    output_hash: outputHash,
    timestamp: Math.floor(Date.now() / 1000),
    latency_ms: 12,
    tokens_used: Math.max(4, output.length / 4),
  };

  return { modelRun, output };
}

function buildMockClaims(output: string): Claim[] {
  const snippet = output.slice(0, 120);
  const quoteHash = hashUtf8(snippet);

  return [
    {
      claim_id: 'claim-1',
      text: `Verified: ${output}`,
      type: 'factual',
      support: [
        {
          url: 'https://example.com/mock-source',
          snippet,
          quote_hash: quoteHash,
          authority: 0.8,
          relevance: 0.9,
          title: 'Mock Source',
          domain: 'example.com',
          retrieved_at: Math.floor(Date.now() / 1000),
        },
      ],
      contradictions: [],
      confidence: 0.87,
      entities: ['Mock'],
      temporal: ['2024'],
    },
  ];
}

function buildMockMetrics(scoreBps: number): Metrics {
  const score = scoreBps / 10000;
  return {
    consensus: {
      agreement: score,
      clusters: 1,
      cluster_sizes: [1],
      outliers: 0,
    },
    factuality: {
      supported_claim_ratio: Math.min(1, score + 0.05),
      total_claims: 1,
      verified_claims: scoreBps >= 5000 ? 1 : 0,
      contradicted_claims: scoreBps >= 5000 ? 0 : 1,
    },
    citation_quality: {
      authority_score: Math.min(1, score + 0.1),
      source_count: 1,
      high_authority_ratio: 0.5,
      citation_density: 0.8,
    },
    bias: {
      sensitive_variance: 0.1,
      political_lean: 0,
      sentiment_variance: 0.2,
    },
    stability: {
      reask_delta: 0.05,
      length_variance: 0.1,
      token_variance: 0.2,
    },
  };
}

export function buildMockEvidenceBundle(params: {
  taskId: string;
  prompt: string;
  promptHash: string;
  rubricHash: string;
  scoreBps: number;
  nodeId?: string;
  evaluatorAddress?: string;
}): EvidenceBundleV01 {
  const { modelRun, output } = buildMockModelRun(params.prompt);
  const claims = buildMockClaims(output);

  return {
    schema_version: '1',
    version: '1.0.0',
    task_id: params.taskId,
    bundle_version: '0.1',
    created_at: new Date().toISOString(),
    evaluator: {
      node_id: params.nodeId ?? 'mock-node',
      eth_address: params.evaluatorAddress ?? '0x1111111111111111111111111111111111111111',
      software: {
        name: 'mock-verifier',
        ver: '0.1.0',
        commit: 'mock',
      },
    },
    prompt_hash: params.promptHash,
    rubric_hash: params.rubricHash,
    model_runs: [modelRun],
    claims,
    metrics: buildMockMetrics(params.scoreBps),
    final_score_bps: params.scoreBps,
    explanation: 'Mock verification run with deterministic scoring.',
    signatures: {
      bundle_sig_eip712: hashUtf8(`mock-signature:${params.taskId}`),
    },
  };
}

export function computeMockBundleHash(bundle: EvidenceBundle): `0x${string}` {
  const { signatures, ...bundleWithoutSig } = bundle as EvidenceBundle;
  return hashCanonical(bundleWithoutSig) as `0x${string}`;
}

export function buildMockExplain(params: {
  scoreBps: number;
  scenario: MockScenario;
}): ReceiptExplain {
  const contradictions =
    params.scenario === 'fail'
      ? [
          {
            type: 'mock-contradiction',
            severity: 'high',
            summary: 'Mock contradiction triggered for fail scenario.',
            evidence_refs: ['claim-1'],
          },
        ]
      : [];

  return {
    version: '1.0.0',
    score_components: [
      {
        name: 'mock_consensus',
        score_bps: params.scoreBps,
        weight_bps: 10000,
        notes: 'Deterministic mock score for developer mode.',
      },
    ],
    checks: {
      mock_mode: true,
      scenario: params.scenario,
      schema_validated: true,
    },
    checks_fired:
      params.scenario === 'fail'
        ? [
            {
              id: 'mock-contradiction',
              severity: 'high',
              summary: 'Mock contradiction triggered for fail scenario.',
              claim_id: 'claim-1',
            },
          ]
        : [],
    uncertain_claims: [
      {
        claim_id: 'claim-1',
        text: 'Mock claim verified',
        confidence: params.scoreBps >= 5000 ? 0.9 : 0.4,
        reason: params.scoreBps >= 5000 ? 'mock_confidence_high' : 'mock_confidence_low',
      },
    ],
    score_adjustments: [
      {
        component: 'mock_consensus',
        score_bps: params.scoreBps,
        weight_bps: 10000,
        contribution_bps: params.scoreBps,
        direction: params.scoreBps >= 5000 ? 'up' : 'down',
        reason: 'deterministic mock adjustment',
      },
    ],
    contradictions_found: contradictions,
    citation_checks: [
      {
        claim: 'Mock claim verified',
        sources: ['https://example.com/mock-source'],
        verdict: params.scoreBps >= 5000 ? 'pass' : 'fail',
        notes: 'Mock citation check',
      },
    ],
    model_disagreement: {
      models: ['mock-llm'],
      agreement_rate: 1,
      clusters: [{ label: 'mock', size: 1 }],
    },
  };
}

export function buildMockReceipt(params: {
  taskId: string;
  inputHash: `0x${string}`;
  outputHash: `0x${string}`;
  bundleHash: `0x${string}`;
  bundleUri: string;
  scoreBps: number;
  scenario: MockScenario;
  nodeId?: string;
}): VerificationReceipt {
  return buildReceipt({
    task_id: params.taskId,
    input_hash: params.inputHash,
    output_hash: params.outputHash,
    score_bps: params.scoreBps,
    bundle_hash: params.bundleHash,
    bundle_uri: params.bundleUri,
    bundle_version: '0.1',
    llm_provider: 'mock',
    llm_model: 'mock-llm',
    verifier_node: params.nodeId ?? 'mock-node',
    software_version: '0.1.0',
    explain: buildMockExplain({ scoreBps: params.scoreBps, scenario: params.scenario }),
    metering: {
      llm_calls: 1,
      total_tokens: 42,
      execution_ms: 25,
      retrieval_calls: 0,
      bundle_size_bytes: 512,
    },
  });
}

export function buildMockDisputeEvents(params: {
  taskId: string;
  scenario: MockScenario;
}): MockDisputeEvent[] {
  if (params.scenario !== 'dispute') {
    return [];
  }

  const now = Date.now();
  return [
    {
      id: `${params.taskId}-challenge`,
      type: 'challenge_opened',
      status: 'open',
      timestamp: new Date(now - 60_000).toISOString(),
      summary: 'Mock dispute opened for review.',
    },
    {
      id: `${params.taskId}-appeal`,
      type: 'appeal',
      status: 'pending',
      timestamp: new Date(now - 30_000).toISOString(),
      summary: 'Mock appeal queued for auditor committee.',
    },
    {
      id: `${params.taskId}-resolved`,
      type: 'challenge_resolved',
      status: 'resolved',
      timestamp: new Date(now - 5_000).toISOString(),
      summary: 'Mock dispute resolved in favor of verifier.',
    },
  ];
}

export function buildMockJobRecord(params: {
  jobId: string;
  prompt: string;
  promptHash: string;
  models: string[];
  taskType: string;
  programId?: string;
  programVersion?: string;
  scenario: MockScenario;
}): MockJobRecord {
  const now = new Date().toISOString();
  return {
    jobId: params.jobId,
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    prompt: params.prompt,
    promptHash: params.promptHash,
    models: params.models,
    taskType: params.taskType,
    programId: params.programId,
    programVersion: params.programVersion,
    scenario: params.scenario,
    statusHistory: [{ status: 'queued', timestamp: now }],
  };
}
