import { ModelResponse } from '../llm-providers/modelRouter';
import { logger } from '../utils/logger';
import { extractClaims } from './claimExtractor';
import { calculateConsistency } from './consistencyChecker';
import { buildClaimGraphAnalysis } from '../../../shared/claim_graph';
import { getEffectiveWeight } from '../providers/trust';
import { buildMerkleVoteTree, hashResponse, ModelVote } from './merkleVotes';
import { toScoreBps } from '../utils/score';

export interface ScoringResult {
  score: number; // 0-100
  verdict: 'reliable' | 'mixed' | 'unreliable';
  confidence: number; // 0-1
  /** Whether ≥⅔ of weighted stake reached consensus (BFT supermajority). */
  bft_quorum: boolean;
  /** Models excluded as statistical outliers before consensus was computed. */
  outliers: string[];
  /** Merkle root of individual model votes — provable on-chain. */
  vote_merkle_root: string;
  breakdown: {
    consistency: number;
    agreement: number;
    citationQuality: number;
    factualAccuracy: number;
    similarityBonus: number;
  };
  claim_graph: {
    agreement_ratio: number;
    contradiction_count: number;
    citation_coverage: number;
    total_claims: number;
    score_components: {
      coverage_bps: number;
      contradiction_penalty_bps: number;
      citation_quality_bps: number;
      final_score_bps: number;
    };
    claim_summary: Array<{
      cluster_id: string;
      canonical_text: string;
      supported_by: string[];
      contradicted_by: string[];
      severity?: 'LOW' | 'MED' | 'HIGH';
      citations: Array<{
        url: string;
        domain?: string;
      }>;
    }>;
    highlights: string[];
  };
  reasoning: string;
}

/**
 * Score verification results from multiple models
 */
export async function scoreVerification(
  prompt: string,
  responses: ModelResponse[],
  taskType: string
): Promise<ScoringResult> {
  logger.info('Scoring verification results', {
    responseCount: responses.length,
    taskType,
  });

  try {
    // --- Outlier detection -----------------------------------------------
    // We use stake-weighted Median Absolute Deviation (MAD) rather than the
    // classic mean ± 2σ approach.  The arithmetic mean can be dragged by a
    // single malicious or misconfigured model, making σ-based thresholds
    // gameable.  The weighted median is robust (breakdown point ≈ 50%) and
    // stake-weighting means high-reputation providers anchor the definition
    // of "normal" — matching how validator-weighted voting works in PoS.
    const peerScores = computePeerConsistencyScores(responses);
    const peerWeightsForOutlier = responses.map((r) => getEffectiveWeight(r.provider, r.model));
    const weightedMedian = computeWeightedMedian(peerScores, peerWeightsForOutlier);
    const absDeviations = peerScores.map((s) => Math.abs(s - weightedMedian));
    const mad = computeWeightedMedian(absDeviations, peerWeightsForOutlier);
    // 2.5× MAD is the standard robust equivalent of 2σ for normally-distributed
    // data; we bias slightly permissive (2.5 vs 2) because LLM responses are
    // noisier than Gaussian and we prefer false-negatives over false-positives
    // in outlier removal.
    const outlierThreshold = weightedMedian - 2.5 * mad;

    const outlierIds: string[] = [];
    const inConsensusResponses = responses.filter((r, i) => {
      if (peerScores[i] < outlierThreshold) {
        outlierIds.push(`${r.provider}:${r.model}`);
        return false;
      }
      return true;
    });

    // Fall back to all responses if outlier removal would leave us with fewer
    // than 2 — we need at least a pair to form any consensus.
    const consensusResponses = inConsensusResponses.length >= 2 ? inConsensusResponses : responses;

    if (outlierIds.length > 0) {
      logger.warn('Outlier models excluded from consensus', { outliers: outlierIds });
    }

    // --- BFT supermajority check -----------------------------------------
    // Total stake = sum of effective weights across all (non-outlier) responses.
    // Supermajority requires ≥⅔ of that stake to agree on a verdict.
    const totalWeight = consensusResponses.reduce(
      (s, r) => s + getEffectiveWeight(r.provider, r.model),
      0
    );
    const BFT_THRESHOLD = 2 / 3;

    // --- Merkle vote tree ------------------------------------------------
    // Built from ALL responses (including outliers) so any model can prove its
    // vote on-chain even if it was excluded from consensus.
    const votes: ModelVote[] = responses.map((r) => ({
      model_id: `${r.provider}:${r.model}`,
      response_hash: hashResponse(r.response),
      score_bps: toScoreBps(peerScores[responses.indexOf(r)] ?? 0),
    }));
    const { root: voteMerkleRoot } = buildMerkleVoteTree(votes);

    // --- Core scoring (on consensus set only) ----------------------------
    // Extract claims from each response
    const allClaims = consensusResponses.map((r) => extractClaims(r.response));

    // Calculate inter-model consistency
    const consistency = calculateConsistency(consensusResponses);

    const claimGraphAnalysis = buildClaimGraphAnalysis({
      responses: consensusResponses.map((response) => ({
        model_id: `${response.provider}:${response.model}`,
        text: response.response,
      })),
    });
    const providerWeights = consensusResponses.map((response) =>
      getEffectiveWeight(response.provider, response.model)
    );
    const weightedAgreement =
      claimGraphAnalysis.total_claims > 0
        ? claimGraphAnalysis.claim_summary.reduce((sum, claim, index) => {
            const weight = providerWeights[index % providerWeights.length] ?? 1;
            return sum + (claim.supported_by.length > 0 ? weight : 0);
          }, 0) /
          Math.max(1, providerWeights.reduce((sum, value) => sum + value, 0))
        : 0;
    const agreementRatio = Math.min(1, Math.max(claimGraphAnalysis.agreement_ratio, weightedAgreement));

    // BFT supermajority: fraction of stake that supports the majority position
    const agreeingWeight = consensusResponses.reduce((s, r, i) => {
      const w = providerWeights[i] ?? 1;
      return s + (peerScores[responses.indexOf(r)] >= peerMean ? w : 0);
    }, 0);
    const bftQuorum = totalWeight > 0 && agreeingWeight / totalWeight >= BFT_THRESHOLD;

    const contradictions = claimGraphAnalysis.contradiction_count;
    const totalClaims = claimGraphAnalysis.total_claims;
    const citationCoverage = claimGraphAnalysis.citation_coverage;
    const claimGraphScore = claimGraphAnalysis.score_components.final_score_bps / 100;
    const claimCoverageScore = claimGraphAnalysis.score_components.coverage_bps / 100;
    const claimCitationScore = claimGraphAnalysis.score_components.citation_quality_bps / 100;

    // Calculate agreement score
    const agreement = agreementRatio * 100;

    // Analyze citations (if applicable)
    const citationQuality = claimCitationScore;

    // Task-specific scoring
    let factualAccuracy = 0;
    switch (taskType) {
      case 'factual-qa':
      case 'citation-check':
      case 'general':
        factualAccuracy = claimGraphScore;
        break;
      case 'math-proof':
        factualAccuracy = scoreMathProof(responses);
        break;
      case 'policy-compliance':
        factualAccuracy = scorePolicyCompliance(responses);
        break;
      default:
        factualAccuracy = (consistency + agreement + claimCoverageScore) / 3;
    }

    if (totalClaims === 0) {
      factualAccuracy = Math.min(factualAccuracy, 50);
    }

    // Weighted scoring
    const weights = {
      consistency: 0.3,
      agreement: 0.3,
      citationQuality: 0.2,
      factualAccuracy: 0.2,
    };

    const baseScore =
      consistency * weights.consistency +
      agreement * weights.agreement +
      citationQuality * weights.citationQuality +
      factualAccuracy * weights.factualAccuracy;
    const similarityBonus = calculateSimilarityBonus(consistency, responses.length);
    const finalScore = Math.min(100, Math.round(baseScore + similarityBonus));

    // Calculate confidence based on variance
    const scores = [consistency, agreement, citationQuality, factualAccuracy];
    const mean = scores.reduce((a, b) => a + b) / scores.length;
    const variance = scores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);
    const confidence = Math.max(0, 1 - stdDev / 50);

    // Determine verdict
    // "reliable" requires: high score AND BFT supermajority AND responses from
    // at least 2 distinct providers.  The diversity requirement prevents a single
    // provider running multiple model aliases from achieving finality alone —
    // analogous to requiring validators from different operators in PoS to avoid
    // cartelisation.
    const agreeingProviders = new Set(
      consensusResponses
        .filter((r, i) => {
          const origIdx = responses.indexOf(r);
          return peerScores[origIdx >= 0 ? origIdx : i] >= outlierThreshold;
        })
        .map((r) => r.provider)
    );
    const hasProviderDiversity = agreeingProviders.size >= 2;

    let verdict: 'reliable' | 'mixed' | 'unreliable';
    if (finalScore >= 80 && bftQuorum && hasProviderDiversity) {
      verdict = 'reliable';
    } else if (finalScore >= 50) {
      verdict = 'mixed';
    } else {
      verdict = 'unreliable';
    }

    // Generate reasoning
    const reasoning = generateReasoning(
      finalScore,
      {
        consistency,
        agreement,
        citationQuality,
        factualAccuracy,
        similarityBonus,
      },
      responses.length,
      bftQuorum,
      hasProviderDiversity,
      agreeingProviders.size
    );

    logger.info('Scoring completed', {
      score: finalScore,
      verdict,
      confidence,
      bftQuorum,
      hasProviderDiversity,
      agreeingProviders: [...agreeingProviders],
      outliers: outlierIds,
      voteMerkleRoot,
    });

    return {
      score: finalScore,
      verdict,
      confidence,
      bft_quorum: bftQuorum,
      outliers: outlierIds,
      vote_merkle_root: voteMerkleRoot,
      breakdown: {
        consistency,
        agreement,
        citationQuality,
        factualAccuracy,
        similarityBonus,
      },
      claim_graph: {
        agreement_ratio: agreementRatio,
        contradiction_count: contradictions,
        citation_coverage: citationCoverage,
        total_claims: totalClaims,
        score_components: claimGraphAnalysis.score_components,
        claim_summary: claimGraphAnalysis.claim_summary.map((entry) => ({
          cluster_id: entry.cluster_id,
          canonical_text: entry.canonical_text,
          supported_by: entry.supported_by,
          contradicted_by: entry.contradicted_by,
          severity: entry.severity,
          citations: entry.citations.map((citation) => ({
            url: citation.url,
            domain: citation.domain,
          })),
        })),
        highlights: claimGraphAnalysis.highlights,
      },
      reasoning,
    };
  } catch (error: any) {
    logger.error('Scoring failed:', error);
    throw error;
  }
}

/**
 * Award up to 10 extra points when multiple model responses are highly similar.
 * The 70-point threshold prevents incidental word overlap from earning a bonus.
 */
export function calculateSimilarityBonus(consistency: number, responseCount: number): number {
  if (responseCount < 2 || consistency < 70) return 0;

  const normalizedSimilarity = (Math.min(100, consistency) - 70) / 30;
  return Math.round(normalizedSimilarity * 10);
}

/**
 * Compute the weighted median of `values` given parallel `weights`.
 * Weights need not sum to 1.  Returns the unweighted median when all weights
 * are equal.  This is the standard "sorted-cumulative-weight" algorithm.
 */
function computeWeightedMedian(values: number[], weights: number[]): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight === 0) return values.reduce((a, b) => a + b, 0) / values.length;

  const indexed = values.map((v, i) => ({ v, w: weights[i] ?? 1 }));
  indexed.sort((a, b) => a.v - b.v);

  let cumulative = 0;
  const half = totalWeight / 2;
  for (const { v, w } of indexed) {
    cumulative += w;
    if (cumulative >= half) return v;
  }
  return indexed[indexed.length - 1].v;
}

/**
 * For each model, compute its average Jaccard similarity to all peer models.
 * Models with anomalously low peer scores are flagged as Byzantine outliers.
 */
function computePeerConsistencyScores(responses: ModelResponse[]): number[] {
  if (responses.length < 2) return responses.map(() => 1);
  const texts = responses.map((r) => r.response.toLowerCase());
  return texts.map((t, i) => {
    let total = 0;
    let count = 0;
    for (let j = 0; j < texts.length; j++) {
      if (j === i) continue;
      total += calculateTextSimilarity(t, texts[j]);
      count++;
    }
    return count > 0 ? total / count : 1;
  });
}

/**
 * Calculate agreement between model responses
 */
function calculateAgreement(responses: ModelResponse[]): number {
  if (responses.length < 2) return 100;

  // Simple text similarity for now
  const texts = responses.map((r) => r.response.toLowerCase());
  let totalSimilarity = 0;
  let comparisons = 0;

  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const similarity = calculateTextSimilarity(texts[i], texts[j]);
      totalSimilarity += similarity;
      comparisons++;
    }
  }

  return comparisons > 0 ? (totalSimilarity / comparisons) * 100 : 0;
}

/**
 * Calculate text similarity (Jaccard index)
 */
function calculateTextSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.split(/\s+/));
  const words2 = new Set(text2.split(/\s+/));

  const intersection = new Set([...words1].filter((x) => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Score factual QA task
 */
function scoreFactualQA(responses: ModelResponse[], claims: string[][]): number {
  // Check if all models agree on key facts
  const allResponses = responses.map((r) => r.response);

  // Simple heuristic: if responses are very similar, likely factual
  const avgLength = allResponses.reduce((a, b) => a + b.length, 0) / allResponses.length;
  const lengthVariance =
    allResponses.reduce((a, b) => a + Math.pow(b.length - avgLength, 2), 0) /
    allResponses.length;

  const lengthConsistency = Math.max(0, 100 - (lengthVariance / avgLength) * 100);

  return lengthConsistency;
}

/**
 * Score math proof task
 */
function scoreMathProof(responses: ModelResponse[]): number {
  // For math proofs, look for consistency in conclusions
  // This is a simplified heuristic
  const conclusions = responses.map((r) => {
    const match = r.response.match(/(therefore|thus|hence|so)[,:]?\s*(.+)/i);
    return match ? match[2].toLowerCase() : r.response.toLowerCase();
  });

  // Check if conclusions are similar
  let matches = 0;
  for (let i = 0; i < conclusions.length - 1; i++) {
    if (calculateTextSimilarity(conclusions[i], conclusions[i + 1]) > 0.7) {
      matches++;
    }
  }

  return (matches / Math.max(1, conclusions.length - 1)) * 100;
}

/**
 * Score policy compliance task
 */
function scorePolicyCompliance(responses: ModelResponse[]): number {
  // Look for consistent compliance verdicts
  const verdicts = responses.map((r) => {
    if (r.response.toLowerCase().includes('compliant')) return 'compliant';
    if (r.response.toLowerCase().includes('non-compliant')) return 'non-compliant';
    return 'unclear';
  });

  const compliantCount = verdicts.filter((v) => v === 'compliant').length;
  const nonCompliantCount = verdicts.filter((v) => v === 'non-compliant').length;
  const maxCount = Math.max(compliantCount, nonCompliantCount);

  return (maxCount / verdicts.length) * 100;
}

/**
 * Generate human-readable reasoning
 */
function generateReasoning(
  score: number,
  breakdown: {
    consistency: number;
    agreement: number;
    citationQuality: number;
    factualAccuracy: number;
    similarityBonus: number;
  },
  modelCount: number,
  bftQuorum: boolean,
  hasProviderDiversity: boolean,
  agreeingProviderCount: number
): string {
  const parts: string[] = [];

  parts.push(`Verified across ${modelCount} models.`);

  if (breakdown.consistency >= 80) {
    parts.push('High consistency across models.');
  } else if (breakdown.consistency >= 50) {
    parts.push('Moderate consistency across models.');
  } else {
    parts.push('Low consistency - models provided different responses.');
  }

  if (breakdown.agreement >= 80) {
    parts.push('Strong agreement on key facts.');
  } else if (breakdown.agreement >= 50) {
    parts.push('Partial agreement on facts.');
  } else {
    parts.push('Significant disagreement between models.');
  }

  if (breakdown.similarityBonus > 0) {
    parts.push(`Similar answers earned a ${breakdown.similarityBonus}-point consensus bonus.`);
  }

  if (breakdown.citationQuality >= 80) {
    parts.push('Well-cited with quality sources.');
  } else if (breakdown.citationQuality > 0) {
    parts.push('Some citations provided.');
  }

  // BFT / finality summary
  if (bftQuorum && hasProviderDiversity) {
    parts.push(
      `BFT supermajority achieved with ${agreeingProviderCount} independent provider(s) — verdict is finalised.`
    );
  } else if (!bftQuorum) {
    parts.push('BFT supermajority not reached; verdict cannot be finalised.');
  } else if (!hasProviderDiversity) {
    parts.push(
      'Agreeing responses came from a single provider; provider diversity requirement not met for finalisation.'
    );
  }

  return parts.join(' ');
}
