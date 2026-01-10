/**
 * Shared types for LLM Verifier
 * Used across contracts, API, and verifier nodes
 */

// ============================================================================
// Evidence Bundle Structure (Specification v0.1)
// ============================================================================

export interface EvidenceBundle {
  // Metadata
  task_id: number | string;
  bundle_version: string;          // "0.1"
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
// Model Run
// ============================================================================

export interface ModelRun {
  provider: string;                // "openai" | "anthropic" | "google"
  model: string;                   // "gpt-4.1-mini" | "claude-3-opus"
  temperature: number;             // 0.0 - 2.0
  max_tokens?: number;             // Optional
  raw_output: string;              // Full LLM response
  output_hash: string;             // "0x..." - keccak256 of raw_output
  timestamp?: number;              // Unix timestamp
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
  retrieved_at?: number;           // Unix timestamp
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
  deadline?: number;               // Unix timestamp
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
  committedAt: number;             // Unix timestamp
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
  unbondingTime: number;           // Unix timestamp
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
  chainId: 42161,                  // Arbitrum One
  verifyingContract: '',           // Set at runtime
};

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
  SOFTWARE_NAME: 'verifier-node',
};
