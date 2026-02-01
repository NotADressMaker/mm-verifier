/**
 * Reasoning Trace Generation
 *
 * Captures reasoning steps during verification and creates hash-based
 * commitments. Full chain-of-thought is stored off-chain (optionally encrypted).
 *
 * Feature flags:
 * - REASONING_TRACE_ENABLED: Enable reasoning trace capture (default: false)
 * - REASONING_TRACE_STORE_FULL: Store full trace content off-chain (default: false)
 */

import { logger } from '../utils/logger';
import {
  ReasoningTraceStep,
  ReasoningTraceCommitment,
  hashReasoningStep,
  computeTraceHash,
  buildReasoningTraceCommitment,
} from '../../../shared/transparency';
import { ModelRun, Claim, Metrics, ScoringResult } from '../../../shared/types';
import { hashCanonical } from '../../../shared/canonicalJson';

// ============================================================================
// Configuration
// ============================================================================

export interface ReasoningTraceConfig {
  enabled: boolean;
  storeFullTrace: boolean;
  maxSteps: number;
  maxSummaryLength: number;
}

export function getReasoningTraceConfig(): ReasoningTraceConfig {
  return {
    enabled: process.env.REASONING_TRACE_ENABLED === 'true',
    storeFullTrace: process.env.REASONING_TRACE_STORE_FULL === 'true',
    maxSteps: parseInt(process.env.REASONING_TRACE_MAX_STEPS || '50', 10),
    maxSummaryLength: parseInt(
      process.env.REASONING_TRACE_MAX_SUMMARY_LENGTH || '200',
      10
    ),
  };
}

// ============================================================================
// Raw Step Builder
// ============================================================================

interface RawReasoningStep {
  step_id: string;
  content: string;
  summary?: string;
  evidence_refs?: string[];
  confidence?: number;
  step_type?: ReasoningTraceStep['step_type'];
}

/**
 * Builder for collecting reasoning steps during verification.
 */
export class ReasoningTraceBuilder {
  private steps: RawReasoningStep[] = [];
  private config: ReasoningTraceConfig;

  constructor(config?: Partial<ReasoningTraceConfig>) {
    this.config = { ...getReasoningTraceConfig(), ...config };
  }

  /**
   * Add a reasoning step.
   */
  addStep(step: Omit<RawReasoningStep, 'step_id'>): void {
    if (!this.config.enabled) {
      return;
    }

    if (this.steps.length >= this.config.maxSteps) {
      logger.warn('Reasoning trace step limit reached', {
        maxSteps: this.config.maxSteps,
      });
      return;
    }

    const stepId = `step_${this.steps.length + 1}`;
    const summary = step.summary
      ? step.summary.slice(0, this.config.maxSummaryLength)
      : undefined;

    this.steps.push({
      step_id: stepId,
      content: step.content,
      summary,
      evidence_refs: step.evidence_refs,
      confidence: step.confidence,
      step_type: step.step_type,
    });
  }

  /**
   * Add an observation step (input analysis).
   */
  addObservation(content: string, summary?: string): void {
    this.addStep({
      content,
      summary,
      step_type: 'observation',
    });
  }

  /**
   * Add an inference step (reasoning about data).
   */
  addInference(
    content: string,
    summary?: string,
    confidence?: number,
    evidenceRefs?: string[]
  ): void {
    this.addStep({
      content,
      summary,
      confidence,
      evidence_refs: evidenceRefs,
      step_type: 'inference',
    });
  }

  /**
   * Add a citation step (referencing sources).
   */
  addCitation(content: string, sourceUri: string, summary?: string): void {
    this.addStep({
      content,
      summary,
      evidence_refs: [sourceUri],
      step_type: 'citation',
    });
  }

  /**
   * Add a verification step (checking claims).
   */
  addVerification(
    content: string,
    summary?: string,
    confidence?: number
  ): void {
    this.addStep({
      content,
      summary,
      confidence,
      step_type: 'verification',
    });
  }

  /**
   * Add a conclusion step (final reasoning).
   */
  addConclusion(content: string, summary?: string, confidence?: number): void {
    this.addStep({
      content,
      summary,
      confidence,
      step_type: 'conclusion',
    });
  }

  /**
   * Build the final reasoning trace commitment.
   */
  build(traceUri?: string): ReasoningTraceCommitment | undefined {
    if (!this.config.enabled || this.steps.length === 0) {
      return undefined;
    }

    return buildReasoningTraceCommitment(this.steps, traceUri);
  }

  /**
   * Get raw steps for off-chain storage.
   */
  getRawSteps(): RawReasoningStep[] {
    return [...this.steps];
  }

  /**
   * Get full trace content for storage (only if enabled).
   */
  getFullTraceContent(): string | undefined {
    if (!this.config.storeFullTrace) {
      return undefined;
    }

    return JSON.stringify({
      version: '1.0',
      generated_at: Math.floor(Date.now() / 1000),
      steps: this.steps,
    });
  }
}

// ============================================================================
// Trace Generation from Verification Data
// ============================================================================

/**
 * Generate reasoning trace from model runs.
 */
export function generateTraceFromModelRuns(
  builder: ReasoningTraceBuilder,
  modelRuns: ModelRun[],
  prompt: string
): void {
  // Observation: Input analysis
  builder.addObservation(
    `Analyzing prompt with ${modelRuns.length} model(s)`,
    `Input analysis for ${modelRuns.length} models`
  );

  // Inference: Model responses
  for (let i = 0; i < modelRuns.length; i++) {
    const run = modelRuns[i];
    const responsePreview = run.raw_output.slice(0, 500);

    builder.addInference(
      `Model ${run.provider}/${run.model} responded with: ${responsePreview}...`,
      `${run.provider}/${run.model} response (${run.latency_ms || 0}ms)`,
      undefined,
      [run.output_hash]
    );
  }
}

/**
 * Generate reasoning trace from claims verification.
 */
export function generateTraceFromClaims(
  builder: ReasoningTraceBuilder,
  claims: Claim[]
): void {
  for (const claim of claims) {
    const supportCount = claim.support.length;
    const contradictionCount = claim.contradictions.length;

    // Citation: Supporting evidence
    for (const evidence of claim.support) {
      builder.addCitation(
        `Supporting evidence for claim "${claim.text}": ${evidence.snippet}`,
        evidence.url,
        `Support: ${evidence.snippet.slice(0, 100)}...`
      );
    }

    // Verification: Claim assessment
    const confidence = claim.confidence ?? 0.5;
    builder.addVerification(
      `Claim "${claim.text}" has ${supportCount} supporting and ${contradictionCount} contradicting sources`,
      `Claim verified: ${supportCount} support, ${contradictionCount} contradict`,
      confidence
    );
  }
}

/**
 * Generate reasoning trace from scoring.
 */
export function generateTraceFromScoring(
  builder: ReasoningTraceBuilder,
  scoringResult: ScoringResult,
  metrics: Metrics
): void {
  // Inference: Metrics analysis
  builder.addInference(
    `Metrics computed: consensus=${metrics.consensus.agreement.toFixed(2)}, ` +
      `factuality=${metrics.factuality.supported_claim_ratio.toFixed(2)}, ` +
      `citation_quality=${metrics.citation_quality.authority_score.toFixed(2)}`,
    `Metrics: agreement=${metrics.consensus.agreement.toFixed(2)}`,
    scoringResult.confidence
  );

  // Conclusion: Final score
  builder.addConclusion(
    `Final verdict: ${scoringResult.verdict} with score ${scoringResult.score}/10000 ` +
      `(confidence: ${scoringResult.confidence.toFixed(2)}). ${scoringResult.reasoning}`,
    `Verdict: ${scoringResult.verdict} (${scoringResult.score} bps)`,
    scoringResult.confidence
  );
}

/**
 * Generate a complete reasoning trace from verification data.
 */
export function generateReasoningTrace(
  modelRuns: ModelRun[],
  claims: Claim[],
  metrics: Metrics,
  scoringResult: ScoringResult,
  prompt: string,
  traceUri?: string
): ReasoningTraceCommitment | undefined {
  const config = getReasoningTraceConfig();
  if (!config.enabled) {
    return undefined;
  }

  const builder = new ReasoningTraceBuilder(config);

  generateTraceFromModelRuns(builder, modelRuns, prompt);
  generateTraceFromClaims(builder, claims);
  generateTraceFromScoring(builder, scoringResult, metrics);

  const trace = builder.build(traceUri);

  if (trace) {
    logger.info('Reasoning trace generated', {
      stepCount: trace.steps.length,
      traceHash: trace.trace_hash.slice(0, 18) + '...',
    });
  }

  return trace;
}

// ============================================================================
// Privacy Warning
// ============================================================================

/**
 * Log privacy warning for full trace storage.
 */
export function logPrivacyWarning(): void {
  const config = getReasoningTraceConfig();
  if (config.storeFullTrace) {
    logger.warn(
      'REASONING_TRACE_STORE_FULL is enabled. ' +
        'Full chain-of-thought content will be stored off-chain. ' +
        'This may expose sensitive information. ' +
        'Consider enabling encryption for production use.'
    );
  }
}
