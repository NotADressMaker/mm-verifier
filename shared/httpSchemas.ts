export type VerifyStatus = 'queued' | 'running' | 'finalized' | 'failed';

export type VerifyVerdict = true | false | 'unknown';

export type VerifyErrorCode =
  | 'INVALID_INPUT'
  | 'PROVIDER_ERROR'
  | 'CHAIN_REVERT'
  | 'TIMEOUT'
  | 'NOT_FOUND'
  | 'INTERNAL_ERROR';

export interface VerifyError {
  code: VerifyErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export interface EvidenceReference {
  bundle_hash: string | null;
  bundle_uri: string | null;
}

export interface TimingInfo {
  queue_ms: number | null;
  llm_ms: number | null;
  bundle_ms: number | null;
  chain_ms: number | null;
  total_ms: number | null;
}

export type ProgramStepType =
  | 'prompt'
  | 'retrieve'
  | 'cross-check'
  | 'score'
  | 'evidence'
  | 'consensus';

export interface ProgramStep {
  id?: string;
  type: ProgramStepType;
  description?: string;
  config?: Record<string, unknown>;
}

export interface ProgramIO {
  name: string;
  type: string;
  description?: string;
  required?: boolean;
}

export interface ProgramScoringComponent {
  id: string;
  description?: string;
  weight_bps: number;
}

export interface ProgramScoringDefinition {
  method: 'weighted_sum';
  components: ProgramScoringComponent[];
}

export interface ProgramThresholds {
  pass_bps: number;
  worthy_bps: number;
}

export interface ProgramReceiptDefinition {
  schema_version: '1';
  receipt_version: string;
  explain_version: string;
}

export interface ProgramDefinition {
  name: string;
  version: string;
  description?: string;
  inputs?: ProgramIO[];
  outputs?: ProgramIO[];
  steps: ProgramStep[];
  scoring: ProgramScoringDefinition;
  thresholds: ProgramThresholds;
  receipt: ProgramReceiptDefinition;
  /** The explicit distinctions and outcomes this program may use. */
  possibility_space?: import('./possibilitySpace').VerificationPossibilitySpace;
}

export interface ProgramSummary {
  id: string;
  version: string;
  description?: string;
  hash: string;
}

export interface VerifyRequest {
  prompt: string;
  models: string[];
  task_type: string;
  deadline?: number;
  commit_deadline_seconds?: number;
  reveal_deadline_seconds?: number;
  reward_pool?: number;
  program_id?: string;
  program_version?: string;
  idempotency_key?: string;
  store_evidence?: boolean;
  allusions?: import('./allusions').AllusionOptions;
  coherence?: import('./coherence').CoherenceConfig;
}

export interface VerifyResponse {
  task_id: string;
  status: VerifyStatus;
  verdict: VerifyVerdict;
  score_bps: number;
  evidence: EvidenceReference;
  timings: TimingInfo;
  errors: VerifyError[];
  program_id?: string;
  program_version?: string;
  program?: ProgramSummary;
}

export const ProgramIOSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'type'],
  properties: {
    name: { type: 'string' },
    type: { type: 'string' },
    description: { type: 'string' },
    required: { type: 'boolean' },
  },
} as const;

export const ProgramStepSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['type'],
  properties: {
    id: { type: 'string' },
    type: {
      type: 'string',
      enum: ['prompt', 'retrieve', 'cross-check', 'score', 'evidence', 'consensus'],
    },
    description: { type: 'string' },
    config: { type: 'object', additionalProperties: true },
  },
} as const;

export const ProgramScoringComponentSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'weight_bps'],
  properties: {
    id: { type: 'string' },
    description: { type: 'string' },
    weight_bps: { type: 'integer', minimum: 0, maximum: 10000 },
  },
} as const;

export const ProgramScoringSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['method', 'components'],
  properties: {
    method: { type: 'string', enum: ['weighted_sum'] },
    components: {
      type: 'array',
      minItems: 1,
      items: ProgramScoringComponentSchema,
    },
  },
} as const;

export const ProgramThresholdsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['pass_bps', 'worthy_bps'],
  properties: {
    pass_bps: { type: 'integer', minimum: 0, maximum: 10000 },
    worthy_bps: { type: 'integer', minimum: 0, maximum: 10000 },
  },
} as const;

export const ProgramReceiptSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['schema_version', 'receipt_version', 'explain_version'],
  properties: {
    schema_version: { type: 'string', enum: ['1'] },
    receipt_version: { type: 'string' },
    explain_version: { type: 'string' },
  },
} as const;

export const ProgramDefinitionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'version', 'steps', 'scoring', 'thresholds', 'receipt'],
  properties: {
    name: { type: 'string' },
    version: { type: 'string' },
    description: { type: 'string' },
    inputs: {
      type: 'array',
      items: ProgramIOSchema,
    },
    outputs: {
      type: 'array',
      items: ProgramIOSchema,
    },
    steps: {
      type: 'array',
      minItems: 1,
      items: ProgramStepSchema,
    },
    scoring: ProgramScoringSchema,
    thresholds: ProgramThresholdsSchema,
    receipt: ProgramReceiptSchema,
    possibility_space: { type: 'object', additionalProperties: true },
  },
} as const;

export const VerifyRequestSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['prompt', 'models', 'task_type'],
  properties: {
    prompt: { type: 'string' },
    models: { type: 'array', items: { type: 'string' }, minItems: 1 },
    task_type: {
      type: 'string',
      enum: ['factual-qa', 'math-proof', 'policy-compliance', 'citation-check', 'general'],
    },
    deadline: { type: 'integer', minimum: 1 },
    commit_deadline_seconds: { type: 'integer', minimum: 1 },
    reveal_deadline_seconds: { type: 'integer', minimum: 1 },
    reward_pool: { type: 'number' },
    program_id: { type: 'string' },
    program_version: { type: 'string' },
    idempotency_key: { type: 'string' },
    store_evidence: { type: 'boolean' },
    allusions: {
      type: 'object', additionalProperties: false,
      properties: {
        enabled: { type: 'boolean' }, strategy: { type: 'string', enum: ['direct', 'structured_reasoning', 'self_consistency', 'self_refine'] },
        num_samples: { type: 'integer', minimum: 1, maximum: 5 }, max_refine_iterations: { type: 'integer', minimum: 0, maximum: 3 },
        verify_sources: { type: 'boolean' }, include_philosophical_allusions: { type: 'boolean' }, minimum_detection_confidence: { type: 'number', minimum: 0, maximum: 1 }, expose_reasoning_summaries: { type: 'boolean' },
      },
    },
    coherence: {
      type: 'object', additionalProperties: false,
      properties: { enabled: { type: 'boolean' }, analyze_fragmentation: { type: 'boolean' }, analyze_integration: { type: 'boolean' }, analyze_path_dependence: { type: 'boolean' }, analyze_boundaries: { type: 'boolean' }, calculate_score: { type: 'boolean' }, include_in_receipt: { type: 'boolean' }, max_paths: { type: 'integer', minimum: 1, maximum: 4 }, max_perturbations: { type: 'integer', minimum: 0, maximum: 5 }, integration_budget: { type: 'number', minimum: 0, maximum: 1 }, minimum_material_change: { type: 'number', minimum: 0, maximum: 1 } },
    },
  },
} as const;

export const VerifyErrorSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['code', 'message'],
  properties: {
    code: {
      type: 'string',
      enum: ['INVALID_INPUT', 'PROVIDER_ERROR', 'CHAIN_REVERT', 'TIMEOUT', 'NOT_FOUND', 'INTERNAL_ERROR'],
    },
    message: { type: 'string' },
    details: { type: 'object', additionalProperties: true },
  },
} as const;

export const VerifyResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['task_id', 'status', 'verdict', 'score_bps', 'evidence', 'timings', 'errors'],
  properties: {
    task_id: { type: 'string' },
    status: { type: 'string', enum: ['queued', 'running', 'finalized', 'failed'] },
    verdict: { oneOf: [{ type: 'boolean' }, { type: 'string', enum: ['unknown'] }] },
    score_bps: { type: 'integer', minimum: 0, maximum: 10000 },
    evidence: {
      type: 'object',
      additionalProperties: false,
      required: ['bundle_hash', 'bundle_uri'],
      properties: {
        bundle_hash: { type: ['string', 'null'] },
        bundle_uri: { type: ['string', 'null'] },
      },
    },
    timings: {
      type: 'object',
      additionalProperties: false,
      required: ['queue_ms', 'llm_ms', 'bundle_ms', 'chain_ms', 'total_ms'],
      properties: {
        queue_ms: { type: ['number', 'null'], minimum: 0 },
        llm_ms: { type: ['number', 'null'], minimum: 0 },
        bundle_ms: { type: ['number', 'null'], minimum: 0 },
        chain_ms: { type: ['number', 'null'], minimum: 0 },
        total_ms: { type: ['number', 'null'], minimum: 0 },
      },
    },
    errors: {
      type: 'array',
      items: VerifyErrorSchema,
    },
    program_id: { type: 'string' },
    program_version: { type: 'string' },
    program: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'version', 'hash'],
      properties: {
        id: { type: 'string' },
        version: { type: 'string' },
        description: { type: 'string' },
        hash: { type: 'string' },
      },
    },
  },
} as const;
