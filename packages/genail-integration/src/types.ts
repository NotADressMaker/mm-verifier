/**
 * GenAI Language integration types for MAMV
 *
 * This module defines types for wrapping GenAIL runtime with metering,
 * verification receipts, and auditable evidence export.
 */

// ============================================================================
// Metering Types
// ============================================================================

/**
 * Tracks resource consumption during GenAIL script execution
 */
export interface MeteringState {
  /** Number of LLM generate calls made */
  llm_calls: number;

  /** Total tokens consumed (prompt + completion) */
  total_tokens: number;

  /** Execution time in milliseconds */
  execution_ms: number;

  /** Number of tool/retrieval calls */
  retrieval_calls: number;

  /** Timestamps for detailed tracking */
  started_at: number;
  ended_at?: number;

  /** Per-call breakdown */
  call_log: MeteringCallLog[];
}

/**
 * Individual call record for metering
 */
export interface MeteringCallLog {
  call_type: 'generate' | 'tool' | 'retrieve';
  timestamp: number;
  duration_ms: number;
  tokens_in?: number;
  tokens_out?: number;
  model?: string;
  tool_name?: string;
  success: boolean;
  error?: string;
}

/**
 * Limits that trigger warnings or errors when exceeded
 */
export interface MeteringLimits {
  max_llm_calls: number;
  max_total_tokens: number;
  max_execution_ms: number;
  max_retrieval_calls?: number;

  /** Behavior when limit exceeded: 'warn' logs warning, 'error' throws */
  on_exceed: 'warn' | 'error';
}

/**
 * Result of metering limit check
 */
export interface MeteringCheckResult {
  within_limits: boolean;
  exceeded: string[];
  warnings: string[];
  utilization: {
    llm_calls_pct: number;
    tokens_pct: number;
    execution_pct: number;
    retrieval_pct?: number;
  };
}

// ============================================================================
// GenAIL Program Types
// ============================================================================

/**
 * Parsed representation of a GenAIL script for fingerprinting
 */
export interface GenAILProgram {
  /** Original source code */
  source: string;

  /** SHA-256 hash of normalized source */
  source_hash: string;

  /** Extracted metadata */
  metadata: GenAILProgramMetadata;

  /** Abstract syntax tree (simplified) */
  ast?: GenAILAST;
}

/**
 * Metadata extracted from GenAIL script
 */
export interface GenAILProgramMetadata {
  /** Models referenced in the script */
  models: string[];

  /** Tools/functions called */
  tools: string[];

  /** Variables defined */
  variables: string[];

  /** Number of generate statements */
  generate_count: number;

  /** Number of message statements */
  message_count: number;

  /** Estimated complexity score */
  complexity_score: number;
}

/**
 * Simplified AST node for GenAIL
 */
export interface GenAILASTNode {
  type: 'model' | 'set' | 'message' | 'generate' | 'call' | 'if' | 'loop' | 'comment';
  line: number;
  content: string;
  children?: GenAILASTNode[];
}

export type GenAILAST = GenAILASTNode[];

// ============================================================================
// Execution Context Types
// ============================================================================

/**
 * Context passed to GenAIL runtime with MAMV hooks
 */
export interface MMVExecutionContext {
  /** Unique execution ID */
  execution_id: string;

  /** Program being executed */
  program: GenAILProgram;

  /** Metering state (updated during execution) */
  metering: MeteringState;

  /** Metering limits (if configured) */
  limits?: MeteringLimits;

  /** Input variables passed to script */
  inputs: Record<string, unknown>;

  /** Captured outputs */
  outputs: Record<string, unknown>;

  /** Model call history for provenance */
  model_calls: ModelCallRecord[];

  /** Whether to auto-verify on completion */
  auto_verify: boolean;

  /** MAMV API configuration */
  mamv_config?: MMVConfig;
}

/**
 * Record of a single model call for provenance
 */
export interface ModelCallRecord {
  call_id: string;
  timestamp: number;
  provider: string;
  model: string;
  prompt_hash: string;
  response_hash: string;
  tokens_in: number;
  tokens_out: number;
  duration_ms: number;
  temperature?: number;
  model_commitment_hash?: string;
}

/**
 * MAMV API configuration
 */
export interface MMVConfig {
  base_url: string;
  api_key?: string;
  auto_verify: boolean;
  min_score_threshold?: number;
}

// ============================================================================
// Verification Receipt Types (GenAIL-specific)
// ============================================================================

/**
 * Verification receipt with GenAIL-specific fields
 */
export interface GenAILVerificationReceipt {
  receipt_version: '1.0';
  execution_id: string;
  task_id?: string;

  /** Program information */
  program: {
    source_hash: string;
    fingerprint: string;
    metadata: GenAILProgramMetadata;
  };

  /** Input/output hashes */
  input_hash: string;
  output_hash: string;

  /** Verification result */
  score_bps: number;
  verdict: boolean;
  worthy: boolean;

  /** Metering summary */
  metering: {
    llm_calls: number;
    total_tokens: number;
    execution_ms: number;
    retrieval_calls: number;
  };

  /** Model provenance */
  model_calls: Array<{
    provider: string;
    model: string;
    model_commitment_hash: string;
  }>;

  /** Evidence bundle reference */
  evidence: {
    bundle_hash: string;
    bundle_uri?: string;
  };

  /** Timestamps */
  executed_at: number;
  verified_at?: number;

  /** Chain context (if on-chain) */
  chain_context?: {
    chain_id: number;
    tx_hash: string;
    block_number: number;
  };
}

// ============================================================================
// Evidence Export Types
// ============================================================================

/**
 * Auditable evidence bundle for GenAIL execution
 */
export interface GenAILEvidenceBundle {
  bundle_version: '0.3';
  bundle_type: 'genail_execution';

  /** Execution identification */
  execution_id: string;
  generated_at: number;

  /** Program as auditable artifact */
  program: {
    source_hash: string;
    fingerprint: string;
    /** Normalized source (whitespace-stripped, sorted) */
    normalized_source: string;
    metadata: GenAILProgramMetadata;
  };

  /** Input/output with hashes */
  io: {
    input_hash: string;
    output_hash: string;
    /** Redacted/summarized inputs (no secrets) */
    input_summary?: Record<string, string>;
    /** Redacted/summarized outputs */
    output_summary?: Record<string, string>;
  };

  /** Full metering log */
  metering: MeteringState;

  /** Model call provenance */
  model_provenance: ModelCallRecord[];

  /** Reasoning trace commitment (hash-based) */
  reasoning_trace?: {
    trace_hash: string;
    step_count: number;
    step_summaries?: string[];
  };

  /** Computed hashes for integrity */
  integrity: {
    bundle_hash: string;
    content_hash: string;
    signature?: string;
  };
}

/**
 * Options for evidence export
 */
export interface EvidenceExportOptions {
  /** Include normalized source in bundle */
  include_source: boolean;

  /** Include input/output summaries */
  include_summaries: boolean;

  /** Include full metering call log */
  include_call_log: boolean;

  /** Include reasoning trace hashes */
  include_reasoning_trace: boolean;

  /** Storage destination */
  storage?: 'local' | 'ipfs' | 'arweave';

  /** Sign the bundle */
  sign?: {
    signer_address: string;
    sign_fn: (hash: string) => Promise<string>;
  };
}

// ============================================================================
// Runtime Hook Types
// ============================================================================

/**
 * Hooks for intercepting GenAIL runtime events
 */
export interface GenAILRuntimeHooks {
  /** Called before each generate statement */
  beforeGenerate?: (ctx: MMVExecutionContext, prompt: string, model: string) => Promise<void>;

  /** Called after each generate statement */
  afterGenerate?: (
    ctx: MMVExecutionContext,
    prompt: string,
    response: string,
    model: string,
    tokens: { in: number; out: number }
  ) => Promise<void>;

  /** Called before each tool call */
  beforeToolCall?: (ctx: MMVExecutionContext, toolName: string, args: unknown) => Promise<void>;

  /** Called after each tool call */
  afterToolCall?: (ctx: MMVExecutionContext, toolName: string, result: unknown) => Promise<void>;

  /** Called when metering limit is approached (80%) */
  onMeteringWarning?: (ctx: MMVExecutionContext, check: MeteringCheckResult) => Promise<void>;

  /** Called when metering limit is exceeded */
  onMeteringExceeded?: (ctx: MMVExecutionContext, check: MeteringCheckResult) => Promise<void>;

  /** Called on execution completion */
  onComplete?: (ctx: MMVExecutionContext) => Promise<void>;

  /** Called on execution error */
  onError?: (ctx: MMVExecutionContext, error: Error) => Promise<void>;
}

// ============================================================================
// Wrapper Configuration Types
// ============================================================================

/**
 * Configuration for the MAMV-wrapped GenAIL runtime
 */
export interface MMVGenAILConfig {
  /** MAMV API configuration */
  mamv: MMVConfig;

  /** Metering limits */
  metering_limits?: MeteringLimits;

  /** Runtime hooks */
  hooks?: GenAILRuntimeHooks;

  /** Evidence export options */
  evidence?: EvidenceExportOptions;

  /** Auto-verify completed executions */
  auto_verify: boolean;

  /** Minimum score to consider execution "worthy" */
  worthy_threshold_bps?: number;
}

/**
 * Result of a GenAIL script execution with MAMV
 */
export interface MMVExecutionResult {
  /** Execution context with all captured data */
  context: MMVExecutionContext;

  /** Script outputs */
  outputs: Record<string, unknown>;

  /** Verification receipt (if auto_verify enabled) */
  receipt?: GenAILVerificationReceipt;

  /** Evidence bundle (if evidence export enabled) */
  evidence?: GenAILEvidenceBundle;

  /** Metering check result */
  metering_check: MeteringCheckResult;

  /** Whether execution completed successfully */
  success: boolean;

  /** Error if execution failed */
  error?: Error;
}
