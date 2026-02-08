import { ModelResponse } from '../llm-providers/modelRouter';
import { logger } from '../utils/logger';
import { extractClaims } from './claimExtractor';
import { calculateConsistency } from './consistencyChecker';
import {
  buildClaimGraph,
  computeAgreementRatio,
  computeCitationCoverage,
  findContradictions,
} from '../../../shared/claim_graph';
import { getEffectiveWeight } from '../providers/trust';

export interface ScoringResult {
  score: number; // 0-100
  verdict: 'reliable' | 'mixed' | 'unreliable';
  confidence: number; // 0-1
  breakdown: {
    consistency: number;
    agreement: number;
    citationQuality: number;
    factualAccuracy: number;
  };
  claim_graph: {
    agreement_ratio: number;
    contradiction_count: number;
    citation_coverage: number;
    total_claims: number;
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
    // Extract claims from each response
    const allClaims = responses.map((r) => extractClaims(r.response));

    // Calculate inter-model consistency
    const consistency = calculateConsistency(responses);

    const claimGraphs = responses.map((response) => buildClaimGraph(response.response));
    const providerWeights = responses.map((response) =>
      getEffectiveWeight(response.provider, response.model)
    );
    const agreementRatio = computeAgreementRatio(claimGraphs, providerWeights);
    const contradictions = claimGraphs.flatMap((graph, index) =>
      claimGraphs
        .slice(index + 1)
        .flatMap((other) => findContradictions(graph, other))
    );
    const totalClaims = claimGraphs.reduce(
      (sum, graph) => sum + graph.nodes.filter((node) => node.type === 'claim').length,
      0
    );

    const citationCoverage =
      claimGraphs.reduce((sum, graph) => sum + computeCitationCoverage(graph), 0) /
      Math.max(1, claimGraphs.length);

    // Calculate agreement score
    const agreement = agreementRatio * 100;

    // Analyze citations (if applicable)
    const citationQuality = citationCoverage * 100;

    // Task-specific scoring
    let factualAccuracy = 0;
    switch (taskType) {
      case 'factual-qa':
        factualAccuracy = scoreFactualQA(responses, allClaims);
        break;
      case 'math-proof':
        factualAccuracy = scoreMathProof(responses);
        break;
      case 'citation-check':
        factualAccuracy = citationQuality;
        break;
      case 'policy-compliance':
        factualAccuracy = scorePolicyCompliance(responses);
        break;
      default:
        factualAccuracy = (consistency + agreement) / 2;
    }

    if (totalClaims > 0 && contradictions.length > 0) {
      const contradictionPenalty = (contradictions.length / totalClaims) * 100;
      factualAccuracy = Math.max(0, factualAccuracy - contradictionPenalty);
    }

    // Weighted scoring
    const weights = {
      consistency: 0.3,
      agreement: 0.3,
      citationQuality: 0.2,
      factualAccuracy: 0.2,
    };

    const finalScore = Math.round(
      consistency * weights.consistency +
        agreement * weights.agreement +
        citationQuality * weights.citationQuality +
        factualAccuracy * weights.factualAccuracy
    );

    // Calculate confidence based on variance
    const scores = [consistency, agreement, citationQuality, factualAccuracy];
    const mean = scores.reduce((a, b) => a + b) / scores.length;
    const variance = scores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);
    const confidence = Math.max(0, 1 - stdDev / 50);

    // Determine verdict
    let verdict: 'reliable' | 'mixed' | 'unreliable';
    if (finalScore >= 80) {
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
      },
      responses.length
    );

    logger.info('Scoring completed', {
      score: finalScore,
      verdict,
      confidence,
    });

    return {
      score: finalScore,
      verdict,
      confidence,
      breakdown: {
        consistency,
        agreement,
        citationQuality,
        factualAccuracy,
      },
      claim_graph: {
        agreement_ratio: agreementRatio,
        contradiction_count: contradictions.length,
        citation_coverage: citationCoverage,
        total_claims: totalClaims,
      },
      reasoning,
    };
  } catch (error: any) {
    logger.error('Scoring failed:', error);
    throw error;
  }
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
  },
  modelCount: number
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

  if (breakdown.citationQuality >= 80) {
    parts.push('Well-cited with quality sources.');
  } else if (breakdown.citationQuality > 0) {
    parts.push('Some citations provided.');
  }

  return parts.join(' ');
}
