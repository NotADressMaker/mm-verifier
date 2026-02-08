export type JobRecord = {
  jobId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  prompt: string;
  promptHash: string;
  models: string[];
  taskType: string;
  programId?: string;
  programVersion?: string;
  statusHistory?: Array<{ status: string; timestamp: string }>;
  scoreBps?: number;
  verdict?: boolean;
};

export type Receipt = {
  task_id: string;
  score_bps: number;
  verdict: boolean;
  evidence: {
    bundle_hash: string;
    bundle_uri: string;
    bundle_version: string;
  };
  explain: {
    score_components: Array<{ name: string; score_bps: number; notes?: string }>;
    checks: Record<string, unknown>;
    contradictions_found: Array<{ summary: string }>;
    citation_checks: Array<{ claim: string; verdict: string; sources: string[] }>;
    model_disagreement: { models: string[]; agreement_rate: number };
  };
};

export type EvidenceBundle = {
  task_id: string;
  model_runs: Array<{ provider: string; model: string; raw_output: string }>;
  claims: Array<{
    claim_id: string;
    text: string;
    support: Array<{ url: string; snippet: string }>;
    contradictions: Array<{ url: string; snippet: string }>;
  }>;
  explanation: string;
  metrics: {
    consensus: { agreement: number };
    factuality: { supported_claim_ratio: number };
    citation_quality: { authority_score: number };
  };
};

export type DisputeEvent = {
  id: string;
  type: string;
  status: string;
  timestamp: string;
  summary: string;
};
