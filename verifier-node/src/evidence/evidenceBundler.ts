import { createHash } from 'crypto';
import { ModelResponse } from '../llm-providers/modelRouter';
import { ScoringResult } from '../scoring/scorer';
import { extractCitations } from '../scoring/citationAnalyzer';
import { extractClaims } from '../scoring/claimExtractor';
import { detectContradictions } from '../scoring/consistencyChecker';
import { logger } from '../utils/logger';

export interface EvidenceBundle {
  jobId: string;
  verifierAddress: string;
  timestamp: number;
  prompt: string;
  promptHash: string;
  models: string[];
  taskType: string;
  modelResponses: {
    model: string;
    provider: string;
    response: string;
    metadata: any;
  }[];
  scoringResult: ScoringResult;
  analysis: {
    claims: string[][];
    citations: any[];
    contradictions: string[];
  };
  checksPerformed: string[];
  bundleHash: string;
}

/**
 * Create evidence bundle for verification
 */
export function createEvidenceBundle(
  jobId: string,
  verifierAddress: string,
  prompt: string,
  promptHash: string,
  models: string[],
  taskType: string,
  responses: ModelResponse[],
  scoringResult: ScoringResult
): EvidenceBundle {
  logger.info('Creating evidence bundle', { jobId, verifierAddress });

  // Extract claims from each response
  const claims = responses.map((r) => extractClaims(r.response));

  // Extract citations
  const citations = responses.map((r) => extractCitations(r.response));

  // Detect contradictions
  const contradictions = detectContradictions(responses);

  // List of checks performed
  const checksPerformed = [
    'multi-model-query',
    'consistency-analysis',
    'agreement-calculation',
    'claim-extraction',
    'citation-analysis',
    'contradiction-detection',
    `task-specific-scoring:${taskType}`,
  ];

  // Create bundle
  const bundle: Omit<EvidenceBundle, 'bundleHash'> = {
    jobId,
    verifierAddress,
    timestamp: Date.now(),
    prompt,
    promptHash,
    models,
    taskType,
    modelResponses: responses.map((r) => ({
      model: r.model,
      provider: r.provider,
      response: r.response,
      metadata: r.metadata,
    })),
    scoringResult,
    analysis: {
      claims,
      citations,
      contradictions,
    },
    checksPerformed,
  };

  // Calculate bundle hash
  const bundleHash = hashEvidenceBundle(bundle);

  const finalBundle: EvidenceBundle = {
    ...bundle,
    bundleHash,
  };

  logger.info('Evidence bundle created', {
    jobId,
    bundleHash,
    modelCount: responses.length,
    claimCount: claims.flat().length,
    citationCount: citations.flat().length,
  });

  return finalBundle;
}

/**
 * Hash evidence bundle for tamper detection
 */
export function hashEvidenceBundle(
  bundle: Omit<EvidenceBundle, 'bundleHash'>
): string {
  // Create deterministic hash of bundle contents
  const hashContent = JSON.stringify({
    jobId: bundle.jobId,
    verifierAddress: bundle.verifierAddress,
    promptHash: bundle.promptHash,
    models: bundle.models.sort(),
    modelResponses: bundle.modelResponses.map((r) => ({
      model: r.model,
      provider: r.provider,
      responseHash: createHash('sha256').update(r.response).digest('hex'),
    })),
    score: bundle.scoringResult.score,
    verdict: bundle.scoringResult.verdict,
  });

  return createHash('sha256').update(hashContent).digest('hex');
}

/**
 * Verify evidence bundle integrity
 */
export function verifyEvidenceBundleIntegrity(bundle: EvidenceBundle): boolean {
  const { bundleHash, ...bundleWithoutHash } = bundle;
  const computedHash = hashEvidenceBundle(bundleWithoutHash);
  return computedHash === bundleHash;
}

/**
 * Create compact evidence summary for onchain storage
 */
export function createCompactSummary(bundle: EvidenceBundle): {
  bundleHash: string;
  score: number;
  verdict: string;
  modelCount: number;
  checksPerformed: number;
} {
  return {
    bundleHash: bundle.bundleHash,
    score: bundle.scoringResult.score,
    verdict: bundle.scoringResult.verdict,
    modelCount: bundle.modelResponses.length,
    checksPerformed: bundle.checksPerformed.length,
  };
}

/**
 * Serialize bundle for IPFS storage
 */
export function serializeBundleForStorage(bundle: EvidenceBundle): string {
  return JSON.stringify(bundle, null, 2);
}

/**
 * Deserialize bundle from storage
 */
export function deserializeBundleFromStorage(data: string): EvidenceBundle {
  const bundle = JSON.parse(data);

  // Verify integrity
  if (!verifyEvidenceBundleIntegrity(bundle)) {
    throw new Error('Evidence bundle integrity check failed');
  }

  return bundle;
}
