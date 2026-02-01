import { createHash } from 'crypto';
import { ethers, Wallet } from 'ethers';
import { logger } from '../utils/logger';
import {
  EvidenceBundle,
  EvidenceBundleContent,
  EvidenceBundleVersion,
  EvidenceProvenance,
  EvidenceBundleV02,
  ModelRun,
  Claim,
  Evidence,
  Metrics,
  ScoringRubric,
  ScoringTrace,
  ProvenanceModelRun,
  ProvenanceSource,
  BundleEIP712Message,
  getEip712Domain,
  EIP712_TYPES,
  CONSTANTS,
} from '../../../shared/types';
import { execSync } from 'child_process';
import { hashCanonical, hashUtf8 } from '../../../shared/canonicalJson';
import {
  ProgramDefinitionWithLimits,
  computeProgramFingerprint,
  MeteringLimits,
} from '../../../shared/programs';
import { ReasoningTraceCommitment } from '../../../shared/transparency';

/**
 * Evidence Bundler V2
 * Implements specification v0.2 (superset of v0.1)
 */

export function normalizeTaskIdBytes32(taskId: number | string): string {
  if (typeof taskId === 'string') {
    if (taskId.startsWith('0x')) {
      return ethers.zeroPadValue(taskId, 32);
    }
    return ethers.zeroPadValue(ethers.toBeHex(BigInt(taskId)), 32);
  }

  return ethers.zeroPadValue(ethers.toBeHex(taskId), 32);
}

// Get software version info
function getSoftwareInfo() {
  let commit = 'unknown';
  try {
    commit = execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    // Ignore if not in git repo
  }

  return {
    name: CONSTANTS.SOFTWARE_NAME,
    ver: CONSTANTS.BUNDLE_VERSION_DEFAULT,
    commit,
  };
}

/**
 * Metering data captured during execution
 */
export interface ExecutionMetering {
  llm_calls: number;
  total_tokens: number;
  execution_ms: number;
  retrieval_calls?: number;
  bundle_size_bytes?: number;
}

/**
 * Program reference for the bundle
 */
export interface BundleProgramRef {
  program_id: string;
  fingerprint: string;
  name: string;
  version: string;
}

type EvidenceBundleBuildOptions = {
  bundleVersion?: EvidenceBundleVersion;
  inputContentType?: EvidenceBundleContent['content_type'];
  inputContentHash?: EvidenceBundleContent['content_hash'];
  outputContentHash?: EvidenceBundleContent['content_hash'];
  scoringTrace?: ScoringTrace;
  scoringBreakdown?: {
    consistency: number;
    agreement: number;
    citationQuality: number;
    factualAccuracy: number;
  };
  scoringWeights?: ScoringTrace['weights'];
  provenanceOverrides?: Partial<EvidenceProvenance>;
  /** Program used for verification */
  program?: ProgramDefinitionWithLimits & { program_id?: string };
  /** Resource usage metering */
  metering?: ExecutionMetering;
  /** Reasoning trace commitments (hash-based) */
  reasoningTrace?: ReasoningTraceCommitment;
};

function buildProvenanceModelRuns(
  modelRuns: ModelRun[],
  promptHash: string
): ProvenanceModelRun[] {
  const now = Math.floor(Date.now() / 1000);
  return modelRuns.map((run) => {
    const finishedAt = run.timestamp ?? now;
    const latencySeconds = run.latency_ms ? Math.round(run.latency_ms / 1000) : 0;
    const startedAt = latencySeconds ? Math.max(0, finishedAt - latencySeconds) : finishedAt;

    return {
      provider: run.provider,
      model: run.model,
      prompt_hash: promptHash as `0x${string}`,
      response_hash: run.output_hash as `0x${string}`,
      started_at: startedAt,
      finished_at: finishedAt,
      latency_ms: run.latency_ms,
      tokens_in: undefined,
      tokens_out: undefined,
    };
  });
}

function buildProvenanceSources(claims: Claim[]): ProvenanceSource[] {
  const sources = new Map<string, ProvenanceSource>();

  const evidenceItems = claims.flatMap((claim) => [
    ...claim.support,
    ...claim.contradictions,
  ]);

  for (const evidence of evidenceItems) {
    const key = `${evidence.url}:${evidence.quote_hash}`;
    if (sources.has(key)) {
      continue;
    }

    sources.set(key, {
      uri: evidence.url,
      content_hash: evidence.quote_hash as `0x${string}`,
      content_type: 'text',
      retrieved_at: evidence.retrieved_at,
    });
  }

  return Array.from(sources.values());
}

function buildScoringTrace(params: {
  rubricHash: string;
  finalScoreBps: number;
  explanation: string;
  breakdown?: EvidenceBundleBuildOptions['scoringBreakdown'];
  weights?: EvidenceBundleBuildOptions['scoringWeights'];
}): ScoringTrace {
  return {
    rubric_hash: params.rubricHash as `0x${string}`,
    score_bps: params.finalScoreBps,
    verdict: getVerdict(params.finalScoreBps),
    breakdown: params.breakdown
      ? {
          consistency: params.breakdown.consistency,
          agreement: params.breakdown.agreement,
          citation_quality: params.breakdown.citationQuality,
          factual_accuracy: params.breakdown.factualAccuracy,
        }
      : {},
    weights: params.weights,
    reasoning_hash: hashUtf8(params.explanation) as `0x${string}`,
    generated_at: Math.floor(Date.now() / 1000),
  };
}

/**
 * Create evidence bundle following specification v0.1 or v0.2
 */
export function createEvidenceBundle(
  taskId: number | string,
  nodeId: string,
  ethAddress: string,
  promptHash: string,
  rubricHash: string,
  modelRuns: ModelRun[],
  claims: Claim[],
  metrics: Metrics,
  finalScoreBps: number,
  explanation: string,
  options: EvidenceBundleBuildOptions = {}
): Omit<EvidenceBundle, 'signatures'> {
  const bundleVersion = (options.bundleVersion ?? CONSTANTS.BUNDLE_VERSION_DEFAULT) as EvidenceBundleVersion;
  logger.info(`Creating evidence bundle v${bundleVersion}`, { taskId, ethAddress });

  const softwareInfo = getSoftwareInfo();

  const bundle: Omit<EvidenceBundle, 'signatures'> = {
    task_id: taskId,
    bundle_version: bundleVersion,
    created_at: new Date().toISOString(),

    evaluator: {
      node_id: nodeId,
      eth_address: ethAddress,
      software: softwareInfo,
    },

    prompt_hash: promptHash,
    rubric_hash: rubricHash,

    model_runs: modelRuns,
    claims: claims,
    metrics: metrics,

    final_score_bps: finalScoreBps,
    explanation: explanation,
  };

  if (bundleVersion === '0.2') {
    const inputContentHash = options.inputContentHash ?? (promptHash as `0x${string}`);
    const outputContentHash =
      options.outputContentHash ??
      (hashCanonical({
        score_bps: finalScoreBps,
        verdict: getVerdict(finalScoreBps),
        explanation,
      }) as `0x${string}`);

    const provenance: EvidenceProvenance = {
      model_runs: buildProvenanceModelRuns(modelRuns, promptHash),
      sources: buildProvenanceSources(claims),
      environment: {
        verifier_node: nodeId,
        software_commit: softwareInfo.commit,
      },
      ...options.provenanceOverrides,
    };

    const scoringTrace =
      options.scoringTrace ??
      buildScoringTrace({
        rubricHash,
        finalScoreBps,
        explanation,
        breakdown: options.scoringBreakdown,
        weights: options.scoringWeights,
      });

    const bundleV02: EvidenceBundleV02 & {
      program?: BundleProgramRef;
      metering?: ExecutionMetering;
      reasoning_trace?: ReasoningTraceCommitment;
    } = {
      ...(bundle as EvidenceBundleV02),
      bundle_version: '0.2',
      input: {
        content_type: options.inputContentType ?? 'text',
        content_hash: inputContentHash,
      },
      output: {
        content_hash: outputContentHash,
        content_type: 'json',
      },
      provenance,
      scoring_trace: scoringTrace,
    };

    // Add program reference if provided
    if (options.program) {
      const fingerprint = computeProgramFingerprint(options.program);
      bundleV02.program = {
        program_id: options.program.program_id ?? `prog_${fingerprint.slice(2, 10)}`,
        fingerprint,
        name: options.program.name,
        version: options.program.version,
      };
    }

    // Add metering data if provided
    if (options.metering) {
      bundleV02.metering = options.metering;
    }

    // Add reasoning trace commitments if provided
    if (options.reasoningTrace) {
      bundleV02.reasoning_trace = options.reasoningTrace;
    }

    return bundleV02;
  }

  return bundle;
}

/**
 * Hash evidence bundle for tamper detection
 */
export function hashEvidenceBundle(
  bundle: Omit<EvidenceBundle, 'signatures'>
): string {
  return hashCanonical(bundle);
}

/**
 * Sign evidence bundle with EIP-712
 */
export async function signEvidenceBundle(
  bundle: Omit<EvidenceBundle, 'signatures'>,
  wallet: Wallet,
  marketplaceAddress: string,
  chainId: number
): Promise<EvidenceBundle> {
  logger.info('Signing evidence bundle', {
    taskId: bundle.task_id,
    signer: wallet.address,
  });

  // 1. Hash the bundle
  const bundleHash = hashEvidenceBundle(bundle);

  // 2. Create EIP-712 message
  const message: BundleEIP712Message = {
    jobId: normalizeTaskIdBytes32(bundle.task_id),
    verifier: wallet.address,
    promptHash: bundle.prompt_hash,
    score: bundle.final_score_bps,
    verdict: getVerdict(bundle.final_score_bps),
    bundleHash: bundleHash,
    timestamp: Math.floor(new Date(bundle.created_at).getTime() / 1000),
  };

  // 3. Set domain with correct contract address
  const domain = getEip712Domain(chainId, marketplaceAddress);

  // 4. Sign with EIP-712
  const signature = await wallet.signTypedData(domain, EIP712_TYPES, message);

  // 5. Add signature to bundle
  const signedBundle: EvidenceBundle = {
    ...bundle,
    signatures: {
      bundle_sig_eip712: signature,
    },
  };

  logger.info('Evidence bundle signed', {
    taskId: bundle.task_id,
    bundleHash,
    signature: signature.substring(0, 10) + '...',
  });

  return signedBundle;
}

/**
 * Verify evidence bundle signature
 */
export function verifyBundleSignature(
  bundle: EvidenceBundle,
  marketplaceAddress: string,
  chainId: number
): { valid: boolean; recoveredAddress: string } {
  try {
    // 1. Reconstruct the message
    const { signatures, ...bundleWithoutSig } = bundle;
    const bundleHash = hashEvidenceBundle(bundleWithoutSig);

    const message: BundleEIP712Message = {
      jobId: normalizeTaskIdBytes32(bundle.task_id),
      verifier: bundle.evaluator.eth_address,
      promptHash: bundle.prompt_hash,
      score: bundle.final_score_bps,
      verdict: getVerdict(bundle.final_score_bps),
      bundleHash: bundleHash,
      timestamp: Math.floor(new Date(bundle.created_at).getTime() / 1000),
    };

    // 2. Set domain
    const domain = getEip712Domain(chainId, marketplaceAddress);

    // 3. Recover signer
    const recoveredAddress = ethers.verifyTypedData(
      domain,
      EIP712_TYPES,
      message,
      bundle.signatures.bundle_sig_eip712
    );

    // 4. Verify signer matches claimed evaluator
    const valid = recoveredAddress.toLowerCase() === bundle.evaluator.eth_address.toLowerCase();

    return { valid, recoveredAddress };
  } catch (error: any) {
    logger.error('Failed to verify bundle signature:', error);
    return { valid: false, recoveredAddress: '' };
  }
}

/**
 * Create model run from LLM response
 */
export function createModelRun(
  provider: string,
  model: string,
  temperature: number,
  rawOutput: string,
  metadata?: {
    maxTokens?: number;
    timestamp?: number;
    latencyMs?: number;
    tokensUsed?: number;
  }
): ModelRun {
  const outputHash = ethers.keccak256(ethers.toUtf8Bytes(rawOutput));

  return {
    provider,
    model,
    temperature,
    raw_output: rawOutput,
    output_hash: outputHash,
    max_tokens: metadata?.maxTokens,
    timestamp: metadata?.timestamp ?? Math.floor(Date.now() / 1000),
    latency_ms: metadata?.latencyMs,
    tokens_used: metadata?.tokensUsed,
  };
}

/**
 * Create claim with evidence
 */
export function createClaim(
  claimId: string,
  text: string,
  type: 'factual' | 'numeric' | 'causal' | 'policy',
  support: Evidence[],
  contradictions: Evidence[],
  metadata?: {
    confidence?: number;
    entities?: string[];
    temporal?: string[];
  }
): Claim {
  return {
    claim_id: claimId,
    text,
    type,
    support,
    contradictions,
    confidence: metadata?.confidence,
    entities: metadata?.entities,
    temporal: metadata?.temporal,
  };
}

/**
 * Create evidence citation
 */
export function createEvidence(
  url: string,
  snippet: string,
  metadata?: {
    authority?: number;
    relevance?: number;
    title?: string;
    domain?: string;
    retrievedAt?: number;
  }
): Evidence {
  const quoteHash = ethers.keccak256(ethers.toUtf8Bytes(snippet));

  return {
    url,
    snippet,
    quote_hash: quoteHash,
    authority: metadata?.authority,
    relevance: metadata?.relevance,
    title: metadata?.title,
    domain: metadata?.domain || new URL(url).hostname,
    retrieved_at: metadata?.retrievedAt ?? Math.floor(Date.now() / 1000),
  };
}

/**
 * Create metrics object
 */
export function createMetrics(
  consensus: {
    agreement: number;
    clusters: number;
    clusterSizes?: number[];
    outliers?: number;
  },
  factuality: {
    supportedClaimRatio: number;
    totalClaims?: number;
    verifiedClaims?: number;
    contradictedClaims?: number;
  },
  citationQuality: {
    authorityScore: number;
    sourceCount?: number;
    highAuthorityRatio?: number;
    citationDensity?: number;
  },
  bias: {
    sensitiveVariance: number;
    politicalLean?: number;
    sentimentVariance?: number;
  },
  stability: {
    reaskDelta: number;
    lengthVariance?: number;
    tokenVariance?: number;
  }
): Metrics {
  return {
    consensus: {
      agreement: consensus.agreement,
      clusters: consensus.clusters,
      cluster_sizes: consensus.clusterSizes,
      outliers: consensus.outliers,
    },
    factuality: {
      supported_claim_ratio: factuality.supportedClaimRatio,
      total_claims: factuality.totalClaims,
      verified_claims: factuality.verifiedClaims,
      contradicted_claims: factuality.contradictedClaims,
    },
    citation_quality: {
      authority_score: citationQuality.authorityScore,
      source_count: citationQuality.sourceCount,
      high_authority_ratio: citationQuality.highAuthorityRatio,
      citation_density: citationQuality.citationDensity,
    },
    bias: {
      sensitive_variance: bias.sensitiveVariance,
      political_lean: bias.politicalLean,
      sentiment_variance: bias.sentimentVariance,
    },
    stability: {
      reask_delta: stability.reaskDelta,
      length_variance: stability.lengthVariance,
      token_variance: stability.tokenVariance,
    },
  };
}

/**
 * Get verdict from score
 */
export function getVerdict(scoreBps: number): 'reliable' | 'mixed' | 'unreliable' {
  if (scoreBps >= CONSTANTS.RELIABLE_THRESHOLD) return 'reliable';
  if (scoreBps >= CONSTANTS.MIXED_THRESHOLD) return 'mixed';
  return 'unreliable';
}

/**
 * Calculate rubric hash
 */
export function hashRubric(rubric: ScoringRubric): string {
  return hashCanonical(rubric);
}

/**
 * Serialize bundle to JSON (pretty print)
 */
export function serializeBundle(bundle: EvidenceBundle): string {
  return JSON.stringify(bundle, null, 2);
}

/**
 * Deserialize bundle from JSON
 */
export function deserializeBundle(json: string): EvidenceBundle {
  try {
    const bundle = JSON.parse(json) as EvidenceBundle;

    // Validate required fields
    const requiredFields = [
      'task_id',
      'bundle_version',
      'created_at',
      'evaluator',
      'prompt_hash',
      'rubric_hash',
      'model_runs',
      'claims',
      'metrics',
      'final_score_bps',
      'explanation',
      'signatures',
    ];

    for (const field of requiredFields) {
      if (!(field in bundle)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    if (bundle.bundle_version === '0.2') {
      const v02Fields = ['input', 'output', 'provenance', 'scoring_trace'];
      for (const field of v02Fields) {
        if (!(field in bundle)) {
          throw new Error(`Missing required field for v0.2: ${field}`);
        }
      }
    }

    return bundle;
  } catch (error: any) {
    logger.error('Failed to deserialize bundle:', error);
    throw new Error(`Invalid bundle JSON: ${error.message}`);
  }
}

/**
 * Validate bundle structure
 */
export function validateBundleStructure(bundle: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check bundle version
  if (![CONSTANTS.BUNDLE_VERSION_V01, CONSTANTS.BUNDLE_VERSION_V02].includes(bundle.bundle_version)) {
    errors.push(
      `Invalid bundle version: ${bundle.bundle_version}, expected ${CONSTANTS.BUNDLE_VERSION_V01} or ${CONSTANTS.BUNDLE_VERSION_V02}`
    );
  }

  // Check evaluator
  if (!bundle.evaluator?.node_id) {
    errors.push('Missing evaluator.node_id');
  }
  if (!ethers.isAddress(bundle.evaluator?.eth_address)) {
    errors.push('Invalid evaluator.eth_address');
  }

  // Check hashes
  if (!bundle.prompt_hash?.startsWith('0x')) {
    errors.push('Invalid prompt_hash format');
  }
  if (!bundle.rubric_hash?.startsWith('0x')) {
    errors.push('Invalid rubric_hash format');
  }

  // Check model runs
  if (!Array.isArray(bundle.model_runs) || bundle.model_runs.length === 0) {
    errors.push('Missing or empty model_runs array');
  }

  // Check claims
  if (!Array.isArray(bundle.claims)) {
    errors.push('Missing or invalid claims array');
  }

  // Check metrics
  if (!bundle.metrics?.consensus || !bundle.metrics?.factuality) {
    errors.push('Missing required metrics');
  }

  // Check score
  if (typeof bundle.final_score_bps !== 'number' ||
      bundle.final_score_bps < 0 ||
      bundle.final_score_bps > CONSTANTS.MAX_SCORE_BPS) {
    errors.push(`Invalid final_score_bps: ${bundle.final_score_bps}`);
  }

  // Check signature
  if (!bundle.signatures?.bundle_sig_eip712?.startsWith('0x')) {
    errors.push('Missing or invalid EIP-712 signature');
  }

  if (bundle.bundle_version === '0.2') {
    if (!bundle.input?.content_hash?.startsWith('0x')) {
      errors.push('Missing or invalid input.content_hash');
    }
    if (!bundle.output?.content_hash?.startsWith('0x')) {
      errors.push('Missing or invalid output.content_hash');
    }
    if (!Array.isArray(bundle.provenance?.model_runs)) {
      errors.push('Missing provenance.model_runs');
    }
    if (!bundle.scoring_trace?.rubric_hash?.startsWith('0x')) {
      errors.push('Missing scoring_trace.rubric_hash');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Default scoring rubric
 */
export const DEFAULT_RUBRIC: ScoringRubric = {
  version: '0.1',

  weights: {
    consensus: 0.25,
    factuality: 0.30,
    citation_quality: 0.20,
    bias: 0.10,
    stability: 0.15,
  },

  thresholds: {
    reliable: 8000,
    mixed: 5000,
  },

  claim_extraction: {
    min_claim_length: 20,
    max_claims_per_response: 50,
  },

  evidence_requirements: {
    min_sources_per_claim: 1,
    required_authority_threshold: 0.5,
  },

  consensus_settings: {
    similarity_threshold: 0.7,
    min_cluster_size: 2,
  },
};

/**
 * Calculate metering data from model runs
 */
export function calculateMetering(
  modelRuns: ModelRun[],
  startTime: number,
  retrievalCalls?: number
): ExecutionMetering {
  const endTime = Date.now();
  const totalTokens = modelRuns.reduce(
    (sum, run) => sum + (run.tokens_used ?? 0),
    0
  );

  return {
    llm_calls: modelRuns.length,
    total_tokens: totalTokens,
    execution_ms: endTime - startTime,
    retrieval_calls: retrievalCalls,
  };
}

/**
 * Check if metering exceeds limits
 */
export function checkMeteringLimits(
  metering: ExecutionMetering,
  limits: MeteringLimits
): { exceeded: boolean; violations: string[] } {
  const violations: string[] = [];

  if (metering.llm_calls > limits.max_llm_calls) {
    violations.push(
      `LLM calls exceeded: ${metering.llm_calls} > ${limits.max_llm_calls}`
    );
  }

  if (metering.total_tokens > limits.max_total_tokens) {
    violations.push(
      `Total tokens exceeded: ${metering.total_tokens} > ${limits.max_total_tokens}`
    );
  }

  if (metering.execution_ms > limits.max_execution_ms) {
    violations.push(
      `Execution time exceeded: ${metering.execution_ms}ms > ${limits.max_execution_ms}ms`
    );
  }

  if (
    metering.retrieval_calls !== undefined &&
    limits.max_retrieval_calls !== undefined &&
    metering.retrieval_calls > limits.max_retrieval_calls
  ) {
    violations.push(
      `Retrieval calls exceeded: ${metering.retrieval_calls} > ${limits.max_retrieval_calls}`
    );
  }

  if (
    metering.bundle_size_bytes !== undefined &&
    limits.max_bundle_size_bytes !== undefined &&
    metering.bundle_size_bytes > limits.max_bundle_size_bytes
  ) {
    violations.push(
      `Bundle size exceeded: ${metering.bundle_size_bytes} > ${limits.max_bundle_size_bytes}`
    );
  }

  return {
    exceeded: violations.length > 0,
    violations,
  };
}
