/**
 * Shared types for LLM Verifier
 * Used across contracts, API, and verifier nodes
 */

// ============================================================================
// Evidence Bundle Structure (Specification v0.1)
// ============================================================================

export interface EvidenceBundleV01 {
  // Metadata
  task_id: number | string;
  bundle_version: '0.1';
  created_at: string;              // ISO 8601 timestamp

  // Evaluator information
  evaluator: {
    node_id: string;               // "node:abcd"
    eth_address: string;           // "0x..."
    software: {
      name: string;                // "verifier-node"
      ver: string;                 // "0.1.0"
      commit: string;              // Git commit SHA
    };
  };

  // Prompt and rubric
  prompt_hash: string;             // "0x..." - keccak256 of prompt
  rubric_hash: string;             // "0x..." - keccak256 of scoring rubric

  // Model executions
  model_runs: ModelRun[];

  // Extracted claims
  claims: Claim[];

  // Computed metrics
  metrics: Metrics;

  // Final evaluation
  final_score_bps: number;         // 0-10000 basis points
  explanation: string;             // Human-readable reasoning

  // Cryptographic proof
  signatures: {
    bundle_sig_eip712: string;     // "0x..." - EIP-712 signature
  };
}

// ============================================================================
// Evidence Bundle Structure (Specification v0.2)
// ============================================================================

export type EvidenceBundleVersion = '0.1' | '0.2';

export interface EvidenceBundleContent {
  content_type: 'text' | 'json';
  content_hash: `0x${string}`;
  content_uri?: string;
}

export interface ProvenanceModelRun {
  provider: string;
  model: string;
  prompt_hash: `0x${string}`;
  response_hash: `0x${string}`;
  started_at: number; // seconds
  finished_at: number; // seconds
  latency_ms?: number;
  tokens_in?: number;
  tokens_out?: number;
}

export interface ProvenanceSource {
  uri: string;
  content_hash?: `0x${string}`;
  content_type?: 'text' | 'json';
  retrieved_at?: number;
}

export interface EvidenceProvenance {
  model_runs: ProvenanceModelRun[];
  sources?: ProvenanceSource[];
  environment?: {
    verifier_node?: string;
    software_commit?: string;
  };
}

export interface ScoringTrace {
  rubric_hash: `0x${string}`;
  score_bps: number;
  verdict: Verdict;
  breakdown: {
    consistency?: number;
    agreement?: number;
    citation_quality?: number;
    factual_accuracy?: number;
  };
  weights?: {
    consistency?: number;
    agreement?: number;
    citation_quality?: number;
    factual_accuracy?: number;
  };
  reasoning_hash?: `0x${string}`;
  generated_at: number;
}

export interface EvidenceBundleV02 extends EvidenceBundleV01 {
  bundle_version: '0.2';
  input: EvidenceBundleContent;
  output: EvidenceBundleContent;
  provenance: EvidenceProvenance;
  scoring_trace: ScoringTrace;
}

export type EvidenceBundle = EvidenceBundleV01 | EvidenceBundleV02;

// ============================================================================
// Model Run
// ============================================================================

export interface ModelRun {
  provider: string;                // "openai" | "anthropic" | "google"
  model: string;                   // "gpt-4.1-mini" | "claude-3-opus"
  temperature: number;             // 0.0 - 2.0
  max_tokens?: number;             // Optional
  raw_output: string;              // Full LLM response
  output_hash: string;             // "0x..." - keccak256 of raw_output
  timestamp?: number;              // Unix timestamp (seconds)
  latency_ms?: number;             // Request duration
  tokens_used?: number;            // Total tokens (prompt + completion)
}

// ============================================================================
// Claim
// ============================================================================

export interface Claim {
  claim_id: string;                // "c1", "c2", etc.
  text: string;                    // Extracted claim sentence
  type: ClaimType;                 // "factual" | "numeric" | "causal" | "policy"

  // Supporting evidence
  support: Evidence[];

  // Contradictory evidence
  contradictions: Evidence[];

  // Metadata
  confidence?: number;             // 0-1 confidence in claim extraction
  entities?: string[];             // Named entities in claim
  temporal?: string[];             // Time references
}

export type ClaimType = 'factual' | 'numeric' | 'causal' | 'policy';

// ============================================================================
// Evidence
// ============================================================================

export interface Evidence {
  url: string;                     // Source URL
  snippet: string;                 // Relevant text excerpt
  quote_hash: string;              // "0x..." - keccak256 of snippet
  authority?: number;              // 0-1 source authority score
  relevance?: number;              // 0-1 relevance to claim
  title?: string;                  // Page title
  domain?: string;                 // Domain name
  retrieved_at?: number;           // Unix timestamp (seconds)
}

// ============================================================================
// Metrics
// ============================================================================

export interface Metrics {
  // Cross-model consensus
  consensus: {
    agreement: number;             // 0-1 agreement ratio
    clusters: number;              // Number of distinct answer clusters
    cluster_sizes?: number[];      // Size of each cluster
    outliers?: number;             // Count of outlier responses
  };

  // Factual verification
  factuality: {
    supported_claim_ratio: number; // 0-1 ratio of supported claims
    total_claims?: number;
    verified_claims?: number;
    contradicted_claims?: number;
  };

  // Source quality
  citation_quality: {
    authority_score: number;       // 0-1 average authority
    source_count?: number;
    high_authority_ratio?: number; // Ratio of tier-1 sources
    citation_density?: number;     // Citations per claim
  };

  // Bias detection
  bias: {
    sensitive_variance: number;    // 0-1 variance on sensitive topics
    political_lean?: number;       // -1 to +1 (left to right)
    sentiment_variance?: number;   // Variance in sentiment
  };

  // Response stability
  stability: {
    reask_delta: number;           // 0-1 change on re-asking
    length_variance?: number;      // Coefficient of variation in length
    token_variance?: number;       // Variance in token counts
  };
}

// ============================================================================
// Scoring Result (Intermediate)
// ============================================================================

export interface ScoringResult {
  score: number;                   // 0-10000 basis points
  verdict: Verdict;                // "reliable" | "mixed" | "unreliable"
  confidence: number;              // 0-1 confidence in score

  breakdown: {
    consensus: number;             // 0-100
    factuality: number;            // 0-100
    citation_quality: number;      // 0-100
    bias: number;                  // 0-100 (100 = unbiased)
    stability: number;             // 0-100
  };

  reasoning: string;               // Human-readable explanation
}

export type Verdict = 'reliable' | 'mixed' | 'unreliable';

// ============================================================================
// Rubric (Scoring Configuration)
// ============================================================================

export interface ScoringRubric {
  version: string;                 // "0.1"

  weights: {
    consensus: number;             // e.g., 0.25
    factuality: number;            // e.g., 0.30
    citation_quality: number;      // e.g., 0.20
    bias: number;                  // e.g., 0.10
    stability: number;             // e.g., 0.15
  };

  thresholds: {
    reliable: number;              // e.g., 8000 bps
    mixed: number;                 // e.g., 5000 bps
  };

  // Claim verification settings
  claim_extraction: {
    min_claim_length: number;      // Minimum characters
    max_claims_per_response: number;
  };

  // Evidence requirements
  evidence_requirements: {
    min_sources_per_claim: number;
    required_authority_threshold: number; // 0-1
  };

  // Consensus settings
  consensus_settings: {
    similarity_threshold: number;  // 0-1 for clustering
    min_cluster_size: number;
  };
}

// ============================================================================
// Job Submission
// ============================================================================

export interface VerificationJobRequest {
  prompt: string;
  models: string[];                // ["gpt-4", "claude-3-opus"]
  taskType: TaskType;
  deadline?: number;               // Unix timestamp (seconds)
  rewardPool?: string;             // WETH amount in wei
  rubric?: ScoringRubric;          // Optional custom rubric
}

export type TaskType = 'factual-qa' | 'math-proof' | 'policy-compliance' | 'citation-check' | 'general';

// ============================================================================
// Job Status
// ============================================================================

export interface JobStatus {
  jobId: string;
  status: JobStatusType;
  promptHash: string;
  models: string[];
  taskType: TaskType;
  rewardPool: string;
  deadline: string;                // ISO 8601

  // Evaluation results
  result?: {
    score: number;                 // 0-10000 bps
    verdict: Verdict;
    confidence: number;
    consensusReached: boolean;
    verifierCount: number;
    evidenceHash?: string;         // IPFS CID or hash
  };

  // Dispute info
  disputed?: boolean;
  disputeId?: string;
}

export type JobStatusType = 'pending' | 'commit-phase' | 'reveal-phase' | 'completed' | 'disputed' | 'cancelled';

// ============================================================================
// Dispute
// ============================================================================

export interface DisputeInfo {
  disputeId: string;
  jobId: string;
  challenger: string;              // Address
  verifier: string;                // Address
  reason: string;
  tier: DisputeTier;
  status: DisputeStatus;
  challengerStake: string;         // WETH in wei

  // Evidence
  challengerEvidenceHash: string;
  verifierEvidenceCID: string;     // IPFS CID
  bundleAvailable: boolean;

  // Voting
  auditors?: string[];             // Selected auditor addresses
  votesForChallenger?: number;
  votesForVerifier?: number;

  // Resolution
  resolved: boolean;
  challengerWon?: boolean;
  slashedAmount?: string;          // WETH in wei
}

export type DisputeTier = 'auto-check' | 'auditor-review' | 'appeal';
export type DisputeStatus = 'pending' | 'commit-phase' | 'reveal-phase' | 'resolved';

// ============================================================================
// Auditor Vote
// ============================================================================

export interface AuditorVoteCommit {
  disputeId: string;
  auditor: string;
  commitHash: string;              // keccak256(disputeId, auditor, vote, salt)
  committedAt: number;             // Unix timestamp (seconds)
}

export interface AuditorVoteReveal {
  disputeId: string;
  auditor: string;
  challengerWins: boolean;         // true = overturn, false = uphold
  salt: string;                    // Random bytes32
}

// ============================================================================
// Staking
// ============================================================================

export interface StakeInfo {
  address: string;
  stakeType: StakeType;
  amount: string;                  // WETH in wei
  lockedAmount: string;            // WETH in wei
  unbondingAmount: string;         // WETH in wei
  unbondingTime: number;           // Unix timestamp (seconds)
  active: boolean;

  // Reputation (auditors only)
  reputation?: number;             // 0-1000
  totalVotes?: number;
  correctVotes?: number;
  totalEarnings?: string;          // WETH in wei
}

export type StakeType = 'verifier' | 'auditor';

// ============================================================================
// EIP-712 Typed Data
// ============================================================================

export interface BundleEIP712Message {
  jobId: string;                   // bytes32
  verifier: string;                // address
  promptHash: string;              // bytes32
  score: number;                   // uint256
  verdict: string;                 // string
  bundleHash: string;              // bytes32
  timestamp: number;               // uint256
}

export const EIP712_DOMAIN = {
  name: 'LLMVerifier',
  version: '1',
};

export function getEip712Domain(chainId: number, verifyingContract: string) {
  return {
    ...EIP712_DOMAIN,
    chainId,
    verifyingContract,
  };
}

export const EIP712_TYPES = {
  EvidenceBundle: [
    { name: 'jobId', type: 'bytes32' },
    { name: 'verifier', type: 'address' },
    { name: 'promptHash', type: 'bytes32' },
    { name: 'score', type: 'uint256' },
    { name: 'verdict', type: 'string' },
    { name: 'bundleHash', type: 'bytes32' },
    { name: 'timestamp', type: 'uint256' },
  ],
};

// ============================================================================
// MMV Attestations (Multi-LLM Verifier)
// ============================================================================

export interface MMVCandidate {
  index: number;
  output: string;
  outputHash: string;
}

export interface MMVVerificationInput {
  taskId: string;
  input: string;
  candidates: MMVCandidate[];
  evidence?: Record<string, unknown>;
}

export interface MMVCandidateScore {
  index: number;
  score: number;
  confidence: number;
  riskFlags: string[];
  rationale: string;
}

export interface MMVVerificationResult {
  taskId: string;
  inputHash: string;
  selectedIndex: number;
  selectedOutputHash: string;
  overallScore: number;
  pass: boolean;
  candidateScores: MMVCandidateScore[];
  rationale: {
    summary: string;
    checks: string[];
    policyViolations: string[];
    promptInjectionDetected: boolean;
  };
  verifier: {
    provider: 'openai';
    model: string;
    version: string;
    configHash: string;
  };
  provenance: MMVModelRunProvenance;
}

export type MMVModelRunProvenance = ProvenanceModelRun;

export interface MMVVerifierConfig {
  provider: 'openai';
  model: string;
  maxRollouts: number;
  minPassScore: number;
  minCandidateScore: number;
  timeoutMs: number;
  rateLimitPerMinute: number;
  version: string;
}

export interface MMVAttestation {
  taskId: string;
  inputHash: string;
  selectedOutputHash: string;
  verifierVersionHash: string;
  configHash: string;
  timestamp: number;
  expiresAt: number;
  score: number;
  passed: boolean;
}

export interface MMVReceipt {
  receipt_version: '0.1';
  generated_at: string;
  task_id: string;
  input_hash: string;
  selected_output_hash: string;
  decision: {
    pass: boolean;
    overall_score: number;
    selected_index: number;
    candidate_scores: MMVCandidateScore[];
  };
  verifier: {
    provider: 'openai';
    model: string;
    version: string;
    config_hash: string;
  };
  provenance: MMVModelRunProvenance;
  attestation?: {
    chain_id: number;
    verifying_contract: string;
    signature: string;
    attestation: MMVAttestation;
  };
}

export const MMV_EIP712_DOMAIN = {
  name: 'MMVVerifier',
  version: '1',
};

export function getMmvEip712Domain(chainId: number, verifyingContract: string) {
  return {
    ...MMV_EIP712_DOMAIN,
    chainId,
    verifyingContract,
  };
}

export const MMV_EIP712_TYPES = {
  Attestation: [
    { name: 'taskId', type: 'bytes32' },
    { name: 'inputHash', type: 'bytes32' },
    { name: 'selectedOutputHash', type: 'bytes32' },
    { name: 'verifierVersionHash', type: 'bytes32' },
    { name: 'configHash', type: 'bytes32' },
    { name: 'timestamp', type: 'uint256' },
    { name: 'expiresAt', type: 'uint256' },
    { name: 'score', type: 'uint256' },
    { name: 'passed', type: 'bool' },
  ],
};

// ============================================================================
// Configuration
// ============================================================================

export interface VerifierNodeConfig {
  nodeId: string;
  ethAddress: string;
  privateKey: string;

  // Staking
  stakeAmount: string;             // WETH in wei
  autoStake: boolean;

  // Job processing
  maxConcurrentJobs: number;
  autoCommit: boolean;

  // LLM providers
  providers: {
    openai?: {
      apiKey: string;
      models: string[];
    };
    anthropic?: {
      apiKey: string;
      models: string[];
    };
    google?: {
      apiKey: string;
      models: string[];
    };
  };

  // Infrastructure
  ipfsUrl: string;
  redisUrl: string;
  blockchainRpc: string;

  // Contracts
  marketplaceAddress: string;
  stakingAddress: string;
  disputeResolverAddress: string;
}

// ============================================================================
// API Responses
// ============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// ============================================================================
// Constants
// ============================================================================

export const CONSTANTS = {
  // Bond amounts (in ETH)
  MIN_VERIFIER_BOND: '0.02',
  MIN_AUDITOR_STAKE: '0.25',
  MIN_DISPUTE_BOND: '0.01',

  // Scoring
  MAX_SCORE_BPS: 10000,
  RELIABLE_THRESHOLD: 8000,
  MIXED_THRESHOLD: 5000,

  // Slashing
  SLASH_PERCENTAGE_CRITICAL: 50,
  SLASH_PERCENTAGE_HIGH: 25,
  SLASH_PERCENTAGE_MEDIUM: 10,

  // Consensus
  CONSENSUS_DEVIATION_THRESHOLD: 20, // 20%
  SIMILARITY_THRESHOLD: 0.7,

  // Timing (seconds)
  COMMIT_PHASE_DURATION: 3600,       // 1 hour
  REVEAL_PHASE_DURATION: 3600,       // 1 hour
  UNBONDING_PERIOD_VERIFIER: 604800, // 7 days
  UNBONDING_PERIOD_AUDITOR: 1209600, // 14 days

  // Reputation
  INITIAL_REPUTATION: 500,
  MAX_REPUTATION: 1000,
  MIN_REPUTATION: 100,

  // Bundle
  BUNDLE_VERSION: '0.1',
  BUNDLE_VERSION_V01: '0.1',
  BUNDLE_VERSION_V02: '0.2',
  BUNDLE_VERSION_DEFAULT: '0.2',
  SOFTWARE_NAME: 'verifier-node',

  // BLS (Branch Legitimacy Scoring)
  BLS_LEGIT_THRESHOLD: 0.65,         // Minimum legitimacy score for "legit" branch
  BLS_REDUNDANCY_THRESHOLD: 0.85,    // Cosine similarity threshold for duplicate detection
  BLS_LAMBDA_EXCESS_WEIGHT: 2.0,     // Weight multiplier for branches exceeding budget
};

// ============================================================================
// Branch Legitimacy Scoring (BLS) System
// ============================================================================

/**
 * Decision branch in a branching decision tree
 * Each branch represents a conditional path: IF condition THEN verdict + confidence
 */
export interface DecisionBranch {
  branch_id: string;                   // "b1", "b2", etc.

  // Condition (machine-checkable)
  if_condition: string;                // Canonicalized boolean expression
  condition_parseable: boolean;        // Can be parsed and evaluated
  condition_type: ConditionType;       // "boolean" | "comparison" | "enumeration" | "free-text"

  // Verdict
  then_verdict: string;                // e.g., "reliable", "unreliable", "mixed"
  then_confidence: number;             // 0-1 confidence in this branch's verdict

  // Evidence support
  supports: string[];                  // Evidence IDs (from evidence bundle)
  quote_spans?: QuoteSpan[];           // Optional byte ranges / hashes for quotes
  checks?: string[];                   // Contradiction checks / invariants used

  // Scores (0-1)
  scores: {
    evidence_quality: number;          // E_i: Evidence presence and relevance
    quote_attribution: number;         // Q_i: Quote correctness
    necessity: number;                 // N_i: Non-redundancy
    condition_clarity: number;         // C_i: Machine-checkability
    scope_correctness: number;         // S_i: No overclaiming
    legitimacy: number;                // Legit_i: Weighted average
  };
}

export type ConditionType = 'boolean' | 'comparison' | 'enumeration' | 'free-text' | 'unparseable';

export interface QuoteSpan {
  evidence_id: string;                 // Reference to evidence item
  byte_start?: number;                 // Start position in evidence
  byte_end?: number;                   // End position in evidence
  hash?: string;                       // Hash of quoted text
  text: string;                        // The quote itself
}

/**
 * Branching decision tree
 * Contains multiple branches with conditions and verdicts
 */
export interface BranchingDecisionTree {
  tree_id: string;
  task_id: number | string;
  evaluator: string;                   // ETH address

  // Declared budget
  declared_budget: number;             // B: Number of branches the evaluator claims to need
  trust_score: number;                 // TrustScore that determined the budget

  // Branches
  branches: DecisionBranch[];
  branch_count: number;                // K: Actual number of branches

  // Coverage
  has_else_branch: boolean;            // Does tree have exhaustive coverage?
  coverage_complete: boolean;          // Are all plausible outcomes covered?

  // Tree-level scores
  scores: {
    avg_legitimacy: number;            // Average legitimacy across all branches
    coverage_factor: number;           // 0.7-1.0: Coverage completeness
    complexity_discipline: number;     // 0.5-1.0: Penalty for exceeding budget
    bls_score: number;                 // 0-100: Final Branch Legitimacy Score
  };

  // Timestamps
  created_at: string;
  bundle_hash: string;                 // Hash of associated evidence bundle
}

/**
 * BLS Scoring Weights (configurable rubric)
 */
export interface BLSWeights {
  // Per-branch component weights (should sum to 1.0)
  evidence_quality: number;            // wE: default 0.35
  quote_attribution: number;           // wQ: default 0.20
  necessity: number;                   // wN: default 0.15
  condition_clarity: number;           // wC: default 0.15
  scope_correctness: number;           // wS: default 0.15
}

export const DEFAULT_BLS_WEIGHTS: BLSWeights = {
  evidence_quality: 0.35,
  quote_attribution: 0.20,
  necessity: 0.15,
  condition_clarity: 0.15,
  scope_correctness: 0.15,
};

/**
 * Evidence quality component (E_i)
 */
export interface EvidenceQualityScore {
  has_evidence: boolean;               // supports_i non-empty
  source_scores: number[];             // src(j) for each support
  relevance_scores: number[];          // rel(j) for each support
  combined_score: number;              // E_i: avg( sqrt(src * rel) )
}

/**
 * Quote attribution component (Q_i)
 */
export interface QuoteAttributionScore {
  has_quotes: boolean;
  total_quotes: number;
  mismatched_quotes: number;           // Wrong spans
  out_of_context_quotes: number;       // Misleading context
  quote_error_rate: number;            // (mismatched + out_of_context) / total
  score: number;                       // Q_i: 1 - min(1, error_rate)
}

/**
 * Necessity / non-redundancy component (N_i)
 */
export interface NecessityScore {
  max_similarity: number;              // Max cosine similarity to other branches
  is_redundant: boolean;               // similarity > threshold
  score: number;                       // N_i: penalized if redundant
}

/**
 * Condition clarity component (C_i)
 */
export interface ConditionClarityScore {
  parseable: boolean;
  uses_allowed_grammar: boolean;       // Boolean ops, comparisons, etc.
  falsifiable: boolean;                // Can be proven false
  score: number;                       // C_i: 0 / 0.5 / 1.0
}

/**
 * Scope correctness component (S_i)
 */
export interface ScopeCorrectnessScore {
  claim_confidence: number;            // conf_i: Branch confidence
  evidence_entailment: number;         // entail_i: Evidence → claim strength
  overclaim_penalty: number;           // over_i: clamp(conf - entail, 0, 1)
  score: number;                       // S_i: 1 - overclaim_penalty
}

/**
 * Fault classification for slashing
 */
export interface FaultClassification {
  // Ordinary disagreement (gentle penalty)
  ordinary_disagreement_rate: number;  // D: Wrong but legit branches (0-1)
  legit_branch_count: number;          // Branches with Legit_i >= Lmin
  incorrect_legit_branches: number;    // Legit branches contradicted by ground truth

  // Unjustified branching (harsh penalty)
  unjustified_severity: number;        // U: Low-legit + spam branches (0-1)
  illegit_branch_count: number;        // Branches with Legit_i < Lmin
  total_deficit: number;               // Sum of legitimacy deficits
  exceeds_budget: boolean;             // K > B
  excess_ratio: number;                // (K - B) / B
}

/**
 * Slashing calculation
 */
export interface SlashingCalculation {
  stake: string;                       // WETH amount in wei

  // Inputs
  ordinary_disagreement: number;       // D (0-1)
  unjustified_severity: number;        // U (0-1)

  // Component penalties
  sD: number;                          // Ordinary disagreement penalty: a * D^2
  sU: number;                          // Unjustified branching penalty: b * U^gamma
  overlap_bonus: number;               // c * (D * U) to avoid double-counting

  // Hard triggers
  hard_triggers: {
    fabricated_quote: boolean;         // Proven fake citation → 80% slash
    high_confidence_no_support: boolean; // conf > 0.75, empty supports → 50% slash
    spam_redundancy: boolean;          // >30% redundancy → 40% slash
  };

  // Final slash rate (0-1)
  slash_rate: number;                  // clamp01(sD + sU - overlap + triggers)
  slash_amount: string;                // WETH in wei

  // Parameters used
  params: {
    a: number;                         // Ordinary disagreement coefficient (default 0.10)
    b: number;                         // Unjustified branching coefficient (default 0.60)
    gamma: number;                     // Unjustified branching exponent (default 2.7)
    c: number;                         // Overlap bonus coefficient (default 0.05)
  };
}

export const DEFAULT_BLS_SLASHING_PARAMS = {
  a: 0.10,    // Ordinary disagreement: quadratic but gentle
  b: 0.60,    // Unjustified branching: aggressive
  gamma: 2.7, // Superlinear punishment for high U
  c: 0.05,    // Small overlap correction
};

/**
 * BLS Evaluation Result
 * Complete evaluation of a branching decision tree
 */
export interface BLSEvaluationResult {
  tree_id: string;
  task_id: number | string;
  evaluator: string;

  // Tree structure
  tree: BranchingDecisionTree;

  // Per-branch evaluations
  branch_evaluations: {
    branch_id: string;
    evidence_quality: EvidenceQualityScore;
    quote_attribution: QuoteAttributionScore;
    necessity: NecessityScore;
    condition_clarity: ConditionClarityScore;
    scope_correctness: ScopeCorrectnessScore;
    legitimacy_score: number;          // Legit_i (0-1)
    is_legitimate: boolean;            // Legit_i >= Lmin
  }[];

  // Tree-level scores
  bls_score: number;                   // 0-100
  avg_legitimacy: number;              // Average Legit_i
  coverage_factor: number;             // 0.7-1.0
  complexity_discipline: number;       // 0.5-1.0

  // Fault classification
  faults: FaultClassification;

  // Slashing (if applicable)
  slashing?: SlashingCalculation;

  // Ground truth comparison (for post-resolution)
  ground_truth?: {
    final_verdict: string;
    branch_correctness: Record<string, boolean>; // branch_id → correct?
  };

  // Timestamps
  evaluated_at: string;
}

/**
 * BLS Configuration (tunable parameters)
 */
export interface BLSConfig {
  // Legitimacy thresholds
  legit_threshold: number;             // Lmin: Minimum for "legit" branch (0.60-0.75)

  // Component weights
  weights: BLSWeights;

  // Slashing parameters
  slashing_params: {
    a: number;                         // Ordinary disagreement
    b: number;                         // Unjustified branching
    gamma: number;                     // Unjustified branching exponent
    c: number;                         // Overlap bonus
  };

  // Hard trigger thresholds
  hard_triggers: {
    min_slash_fabricated_quote: number;     // Default 0.80
    min_slash_no_support: number;           // Default 0.50 (for high confidence)
    min_slash_spam: number;                 // Default 0.40 (for >30% redundancy)
    high_confidence_threshold: number;      // Default 0.75
    spam_redundancy_threshold: number;      // Default 0.30 (30% of branches)
  };

  // Redundancy detection
  redundancy_threshold: number;        // τdup: Cosine similarity threshold (0.85)

  // Excess branching
  lambda_excess_weight: number;        // λ: Weight multiplier for branches > budget (2.0)
}

export const DEFAULT_BLS_CONFIG: BLSConfig = {
  legit_threshold: 0.65,
  weights: DEFAULT_BLS_WEIGHTS,
  slashing_params: DEFAULT_BLS_SLASHING_PARAMS,
  hard_triggers: {
    min_slash_fabricated_quote: 0.80,
    min_slash_no_support: 0.50,
    min_slash_spam: 0.40,
    high_confidence_threshold: 0.75,
    spam_redundancy_threshold: 0.30,
  },
  redundancy_threshold: 0.85,
  lambda_excess_weight: 2.0,
};

// ============================================================================
// VerifiedOutputRecord - Re-export from dedicated module
// ============================================================================

export {
  VerifiedOutputRecord,
  buildVerifiedOutputRecord,
  hashVerifiedOutputRecord,
  computeRecordId,
  toEip712Message,
  validateVerifiedOutputRecord,
  calculateBuilderReward,
  matchesFilter,
  BuildVerifiedOutputRecordParams,
  VerifiedOutputEIP712Message,
  BuilderRewardsConfig,
  VerifiedOutputQueryFilter,
  DEFAULT_BUILDER_REWARDS_CONFIG,
  VERIFIED_OUTPUT_EIP712_DOMAIN,
  VERIFIED_OUTPUT_EIP712_TYPES,
  getVerifiedOutputEip712Domain,
} from './verifiedOutput';
