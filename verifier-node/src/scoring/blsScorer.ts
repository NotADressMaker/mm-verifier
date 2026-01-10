/**
 * Branch Legitimacy Scoring (BLS) Engine
 *
 * Implements the BLS algorithm for evaluating branching decision trees:
 * - Per-branch legitimacy scores (E, Q, N, C, S components)
 * - Tree-level BLS score (0-100)
 * - Fault classification (ordinary disagreement vs unjustified branching)
 * - Slashing calculation (D and U penalties)
 */

import {
  DecisionBranch,
  BranchingDecisionTree,
  BLSConfig,
  BLSWeights,
  BLSEvaluationResult,
  EvidenceQualityScore,
  QuoteAttributionScore,
  NecessityScore,
  ConditionClarityScore,
  ScopeCorrectnessScore,
  FaultClassification,
  SlashingCalculation,
  DEFAULT_BLS_CONFIG,
  Evidence,
} from '../../../shared/types';
import { ethers } from 'ethers';

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Clamp value to [0, 1]
 */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Compute cosine similarity between two text strings
 * Uses simple token-based approach (for production, use embeddings)
 */
function cosineSimilarity(text1: string, text2: string): number {
  const tokens1 = tokenize(text1);
  const tokens2 = tokenize(text2);

  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);

  const intersection = new Set([...set1].filter(x => set2.has(x)));

  if (set1.size === 0 || set2.size === 0) return 0;

  return intersection.size / Math.sqrt(set1.size * set2.size);
}

function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 0);
}

/**
 * Canonicalize condition string for comparison
 */
function canonicalizeCondition(condition: string): string {
  return condition.trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s*(==|!=|<=|>=|<|>|&&|\|\|)\s*/g, '$1');
}

// ============================================================================
// Component Scorers
// ============================================================================

/**
 * Compute Evidence Quality (E_i)
 *
 * E_i = 0 if supports_i empty
 * else: E_i = avg_j( sqrt(src(j) * rel(j)) )
 */
export function computeEvidenceQuality(
  branch: DecisionBranch,
  evidenceMap: Map<string, Evidence>
): EvidenceQualityScore {
  if (!branch.supports || branch.supports.length === 0) {
    return {
      has_evidence: false,
      source_scores: [],
      relevance_scores: [],
      combined_score: 0,
    };
  }

  const sourceScores: number[] = [];
  const relevanceScores: number[] = [];

  for (const evidenceId of branch.supports) {
    const evidence = evidenceMap.get(evidenceId);
    if (!evidence) continue;

    const src = evidence.authority || 0.5; // Default authority if not set
    const rel = evidence.relevance || 0.5; // Default relevance if not set

    sourceScores.push(src);
    relevanceScores.push(rel);
  }

  if (sourceScores.length === 0) {
    return {
      has_evidence: true,
      source_scores: [],
      relevance_scores: [],
      combined_score: 0,
    };
  }

  // avg_j( sqrt(src(j) * rel(j)) )
  const scores = sourceScores.map((src, i) =>
    Math.sqrt(src * relevanceScores[i])
  );
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

  return {
    has_evidence: true,
    source_scores: sourceScores,
    relevance_scores: relevanceScores,
    combined_score: avgScore,
  };
}

/**
 * Compute Quote / Attribution (Q_i)
 *
 * Q_i = 1 if no quotes used
 * Q_i = 1 - min(1, quote_error_rate)
 * where quote_error_rate = (mismatched + out_of_context) / max(1, total)
 */
export function computeQuoteAttribution(
  branch: DecisionBranch,
  evidenceMap: Map<string, Evidence>
): QuoteAttributionScore {
  if (!branch.quote_spans || branch.quote_spans.length === 0) {
    return {
      has_quotes: false,
      total_quotes: 0,
      mismatched_quotes: 0,
      out_of_context_quotes: 0,
      quote_error_rate: 0,
      score: 1.0, // No quotes used, no penalty
    };
  }

  let mismatched = 0;
  let outOfContext = 0;

  for (const quoteSpan of branch.quote_spans) {
    const evidence = evidenceMap.get(quoteSpan.evidence_id);
    if (!evidence) {
      mismatched++;
      continue;
    }

    // Check if quote exists in evidence snippet
    const quoteText = quoteSpan.text.toLowerCase();
    const evidenceText = evidence.snippet.toLowerCase();

    if (!evidenceText.includes(quoteText)) {
      mismatched++;
    }
    // TODO: Add more sophisticated out-of-context detection
  }

  const total = branch.quote_spans.length;
  const errorRate = (mismatched + outOfContext) / Math.max(1, total);
  const score = 1 - Math.min(1, errorRate);

  return {
    has_quotes: true,
    total_quotes: total,
    mismatched_quotes: mismatched,
    out_of_context_quotes: outOfContext,
    quote_error_rate: errorRate,
    score: score,
  };
}

/**
 * Compute Necessity / Non-redundancy (N_i)
 *
 * N_i = 1 - clamp01( (dup_i - τdup) / (1 - τdup) )
 * where dup_i = max cosine_similarity(if_i, if_k) over k≠i
 */
export function computeNecessity(
  branch: DecisionBranch,
  allBranches: DecisionBranch[],
  redundancyThreshold: number
): NecessityScore {
  const canonical = canonicalizeCondition(branch.if_condition);

  let maxSimilarity = 0;

  for (const otherBranch of allBranches) {
    if (otherBranch.branch_id === branch.branch_id) continue;

    const otherCanonical = canonicalizeCondition(otherBranch.if_condition);
    const similarity = cosineSimilarity(canonical, otherCanonical);

    if (similarity > maxSimilarity) {
      maxSimilarity = similarity;
    }
  }

  const isRedundant = maxSimilarity > redundancyThreshold;

  // N_i = 1 - clamp01( (dup_i - τdup) / (1 - τdup) )
  const penalty = clamp01((maxSimilarity - redundancyThreshold) / (1 - redundancyThreshold));
  const score = 1 - penalty;

  return {
    max_similarity: maxSimilarity,
    is_redundant: isRedundant,
    score: score,
  };
}

/**
 * Compute Condition Clarity (C_i)
 *
 * C_i = 1.0 if parseable and uses allowed grammar
 * C_i = 0.5 if partially parseable
 * C_i = 0.0 if unparseable or unfalsifiable
 */
export function computeConditionClarity(branch: DecisionBranch): ConditionClarityScore {
  const condition = branch.if_condition.trim();

  // Check if empty or trivial
  if (!condition || condition.length < 3) {
    return {
      parseable: false,
      uses_allowed_grammar: false,
      falsifiable: false,
      score: 0.0,
    };
  }

  // Check for unfalsifiable statements
  const unfalsifiable = /vibes|feels|seems|probably|maybe/i.test(condition);
  if (unfalsifiable) {
    return {
      parseable: false,
      uses_allowed_grammar: false,
      falsifiable: false,
      score: 0.0,
    };
  }

  // Check for allowed grammar (boolean ops, comparisons, enums)
  const allowedGrammar = /^[a-z0-9_\s()&|!=<>]+$/i.test(condition);
  const hasComparison = /(==|!=|<=|>=|<|>)/.test(condition);
  const hasBoolean = /(&&|\|\||and|or|not)/i.test(condition);
  const hasEnumeration = /(in|is|matches)/i.test(condition);

  const usesAllowed = allowedGrammar && (hasComparison || hasBoolean || hasEnumeration);

  let score: number;
  if (branch.condition_parseable && usesAllowed) {
    score = 1.0;
  } else if (branch.condition_parseable || usesAllowed) {
    score = 0.5;
  } else {
    score = 0.0;
  }

  return {
    parseable: branch.condition_parseable,
    uses_allowed_grammar: usesAllowed,
    falsifiable: !unfalsifiable,
    score: score,
  };
}

/**
 * Compute Scope Correctness (S_i)
 *
 * S_i = 1 - overclaim_penalty
 * where overclaim_penalty = clamp01(conf_i - entail_i)
 */
export function computeScopeCorrectness(
  branch: DecisionBranch,
  evidenceEntailment: number // 0-1 score: how well evidence supports the claim
): ScopeCorrectnessScore {
  const confidence = branch.then_confidence;
  const entailment = evidenceEntailment;

  const overclaimPenalty = clamp01(confidence - entailment);
  const score = 1 - overclaimPenalty;

  return {
    claim_confidence: confidence,
    evidence_entailment: entailment,
    overclaim_penalty: overclaimPenalty,
    score: score,
  };
}

/**
 * Estimate evidence entailment score
 * In production, use an NLI model; here we use heuristics
 */
function estimateEntailment(
  branch: DecisionBranch,
  evidenceMap: Map<string, Evidence>
): number {
  if (!branch.supports || branch.supports.length === 0) return 0;

  const evidenceScores = branch.supports.map(evidenceId => {
    const evidence = evidenceMap.get(evidenceId);
    if (!evidence) return 0;
    return (evidence.authority || 0.5) * (evidence.relevance || 0.5);
  });

  if (evidenceScores.length === 0) return 0;

  return evidenceScores.reduce((a, b) => a + b, 0) / evidenceScores.length;
}

// ============================================================================
// Per-Branch Legitimacy Score
// ============================================================================

/**
 * Compute per-branch legitimacy score (Legit_i)
 *
 * Legit_i = wE * E_i + wQ * Q_i + wN * N_i + wC * C_i + wS * S_i
 */
export function computeBranchLegitimacy(
  branch: DecisionBranch,
  allBranches: DecisionBranch[],
  evidenceMap: Map<string, Evidence>,
  weights: BLSWeights,
  config: BLSConfig
): number {
  const E = computeEvidenceQuality(branch, evidenceMap);
  const Q = computeQuoteAttribution(branch, evidenceMap);
  const N = computeNecessity(branch, allBranches, config.redundancy_threshold);
  const C = computeConditionClarity(branch);

  const entailment = estimateEntailment(branch, evidenceMap);
  const S = computeScopeCorrectness(branch, entailment);

  // Store component scores in branch
  branch.scores = {
    evidence_quality: E.combined_score,
    quote_attribution: Q.score,
    necessity: N.score,
    condition_clarity: C.score,
    scope_correctness: S.score,
    legitimacy: 0, // Will be set below
  };

  // Weighted average
  const legitimacy =
    weights.evidence_quality * E.combined_score +
    weights.quote_attribution * Q.score +
    weights.necessity * N.score +
    weights.condition_clarity * C.score +
    weights.scope_correctness * S.score;

  branch.scores.legitimacy = legitimacy;

  return legitimacy;
}

// ============================================================================
// Tree-Level BLS Score
// ============================================================================

/**
 * Compute tree-level Branch Legitimacy Score (0-100)
 *
 * BLS = 100 * (avg_i Legit_i) * CoverageFactor * ComplexityDiscipline
 */
export function computeBLS(tree: BranchingDecisionTree, config: BLSConfig): number {
  if (tree.branches.length === 0) return 0;

  // Average legitimacy
  const avgLegitimacy = tree.branches.reduce((sum, b) => sum + b.scores.legitimacy, 0) / tree.branches.length;

  // Coverage factor (0.7-1.0)
  const covered = tree.has_else_branch || tree.coverage_complete ? 1 : 0;
  const coverageFactor = 0.7 + 0.3 * covered;

  // Complexity discipline (0.5-1.0)
  const K = tree.branch_count;
  const B = tree.declared_budget;
  const excessRatio = Math.max(0, (K - B) / Math.max(1, B));
  const complexityDiscipline = 1 / (1 + excessRatio);

  // Store factors
  tree.scores = {
    avg_legitimacy: avgLegitimacy,
    coverage_factor: coverageFactor,
    complexity_discipline: complexityDiscipline,
    bls_score: 0, // Will be set below
  };

  // Final BLS
  const bls = 100 * avgLegitimacy * coverageFactor * complexityDiscipline;
  tree.scores.bls_score = bls;

  return bls;
}

// ============================================================================
// Fault Classification
// ============================================================================

/**
 * Classify faults: Ordinary Disagreement (D) vs Unjustified Branching (U)
 */
export function classifyFaults(
  tree: BranchingDecisionTree,
  groundTruth: Record<string, boolean>, // branch_id → correct?
  config: BLSConfig
): FaultClassification {
  const Lmin = config.legit_threshold;
  const B = tree.declared_budget;
  const K = tree.branch_count;
  const lambda = config.lambda_excess_weight;

  let legitBranchCount = 0;
  let incorrectLegitBranches = 0;
  let illegitBranchCount = 0;
  let totalDeficit = 0;

  for (const branch of tree.branches) {
    const legit = branch.scores.legitimacy;
    const isLegit = legit >= Lmin;

    if (isLegit) {
      legitBranchCount++;
      if (groundTruth[branch.branch_id] === false) {
        incorrectLegitBranches++;
      }
    } else {
      illegitBranchCount++;
      const deficit = Math.max(0, Lmin - legit) / Lmin;
      totalDeficit += deficit;
    }
  }

  // D: Ordinary disagreement rate
  const D = legitBranchCount > 0 ? incorrectLegitBranches / legitBranchCount : 0;

  // U: Unjustified branching severity
  const exceedsBudget = K > B;
  const excessRatio = Math.max(0, (K - B) / Math.max(1, B));

  // Weight branches that exceed budget more
  let weightedDeficit = 0;
  let totalWeight = 0;

  for (let i = 0; i < tree.branches.length; i++) {
    const branch = tree.branches[i];
    const deficit = Math.max(0, Lmin - branch.scores.legitimacy) / Lmin;

    let weight = 1;
    if (exceedsBudget && i >= B) {
      weight = 1 + lambda * (i - B) / Math.max(1, B);
    }

    weightedDeficit += weight * deficit;
    totalWeight += weight;
  }

  const U = totalWeight > 0 ? clamp01(weightedDeficit / totalWeight) : 0;

  return {
    ordinary_disagreement_rate: D,
    legit_branch_count: legitBranchCount,
    incorrect_legit_branches: incorrectLegitBranches,
    unjustified_severity: U,
    illegit_branch_count: illegitBranchCount,
    total_deficit: totalDeficit,
    exceeds_budget: exceedsBudget,
    excess_ratio: excessRatio,
  };
}

// ============================================================================
// Slashing Calculation
// ============================================================================

/**
 * Compute slashing amount using BLS fault classification
 *
 * slash_rate = clamp01( sD(D) + sU(U) - overlap_bonus + hard_triggers )
 * where:
 *   sD(D) = a * D^2
 *   sU(U) = b * U^gamma
 *   overlap_bonus = c * (D * U)
 */
export function computeSlashing(
  stake: string, // WETH in wei
  faults: FaultClassification,
  tree: BranchingDecisionTree,
  config: BLSConfig
): SlashingCalculation {
  const { a, b, gamma, c } = config.slashing_params;
  const D = faults.ordinary_disagreement_rate;
  const U = faults.unjustified_severity;

  // Component penalties
  const sD = a * Math.pow(D, 2);
  const sU = b * Math.pow(U, gamma);
  const overlapBonus = c * (D * U);

  let slashRate = clamp01(sD + sU - overlapBonus);

  // Check hard triggers
  const hardTriggers = {
    fabricated_quote: checkFabricatedQuote(tree),
    high_confidence_no_support: checkHighConfidenceNoSupport(tree, config),
    spam_redundancy: checkSpamRedundancy(tree, config),
  };

  // Apply hard trigger minimums
  if (hardTriggers.fabricated_quote) {
    slashRate = Math.max(slashRate, config.hard_triggers.min_slash_fabricated_quote);
  }
  if (hardTriggers.high_confidence_no_support) {
    slashRate = Math.max(slashRate, config.hard_triggers.min_slash_no_support);
  }
  if (hardTriggers.spam_redundancy) {
    slashRate = Math.max(slashRate, config.hard_triggers.min_slash_spam);
  }

  // Compute slash amount
  const stakeBigInt = BigInt(stake);
  const slashBps = BigInt(Math.floor(slashRate * 10000));
  const slashAmountBigInt = (stakeBigInt * slashBps) / BigInt(10000);

  return {
    stake,
    ordinary_disagreement: D,
    unjustified_severity: U,
    sD,
    sU,
    overlap_bonus: overlapBonus,
    hard_triggers: hardTriggers,
    slash_rate: slashRate,
    slash_amount: slashAmountBigInt.toString(),
    params: { a, b, gamma, c },
  };
}

/**
 * Check for fabricated quotes
 */
function checkFabricatedQuote(tree: BranchingDecisionTree): boolean {
  // In production, verify quotes against evidence
  // For now, return false (no fabrication detected)
  return false;
}

/**
 * Check for high confidence without support
 */
function checkHighConfidenceNoSupport(tree: BranchingDecisionTree, config: BLSConfig): boolean {
  const threshold = config.hard_triggers.high_confidence_threshold;

  for (const branch of tree.branches) {
    if (branch.then_confidence > threshold && (!branch.supports || branch.supports.length === 0)) {
      return true;
    }
  }

  return false;
}

/**
 * Check for spam redundancy
 */
function checkSpamRedundancy(tree: BranchingDecisionTree, config: BLSConfig): boolean {
  const redundancyThreshold = config.hard_triggers.spam_redundancy_threshold;

  let redundantCount = 0;
  for (const branch of tree.branches) {
    if (branch.scores.necessity < 0.5) { // Highly redundant
      redundantCount++;
    }
  }

  return redundantCount / tree.branch_count > redundancyThreshold;
}

// ============================================================================
// Full BLS Evaluation
// ============================================================================

/**
 * Perform complete BLS evaluation of a branching decision tree
 */
export function evaluateBLS(
  tree: BranchingDecisionTree,
  evidenceMap: Map<string, Evidence>,
  config: BLSConfig = DEFAULT_BLS_CONFIG
): BLSEvaluationResult {
  // Compute per-branch legitimacy scores
  for (const branch of tree.branches) {
    computeBranchLegitimacy(branch, tree.branches, evidenceMap, config.weights, config);
  }

  // Compute tree-level BLS score
  const blsScore = computeBLS(tree, config);

  // Build branch evaluations
  const branchEvaluations = tree.branches.map(branch => {
    const evidenceQuality = computeEvidenceQuality(branch, evidenceMap);
    const quoteAttribution = computeQuoteAttribution(branch, evidenceMap);
    const necessity = computeNecessity(branch, tree.branches, config.redundancy_threshold);
    const conditionClarity = computeConditionClarity(branch);
    const entailment = estimateEntailment(branch, evidenceMap);
    const scopeCorrectness = computeScopeCorrectness(branch, entailment);

    return {
      branch_id: branch.branch_id,
      evidence_quality: evidenceQuality,
      quote_attribution: quoteAttribution,
      necessity: necessity,
      condition_clarity: conditionClarity,
      scope_correctness: scopeCorrectness,
      legitimacy_score: branch.scores.legitimacy,
      is_legitimate: branch.scores.legitimacy >= config.legit_threshold,
    };
  });

  // Initialize faults (will be updated with ground truth later)
  const faults: FaultClassification = {
    ordinary_disagreement_rate: 0,
    legit_branch_count: tree.branches.filter(b => b.scores.legitimacy >= config.legit_threshold).length,
    incorrect_legit_branches: 0,
    unjustified_severity: 0,
    illegit_branch_count: tree.branches.filter(b => b.scores.legitimacy < config.legit_threshold).length,
    total_deficit: 0,
    exceeds_budget: tree.branch_count > tree.declared_budget,
    excess_ratio: Math.max(0, (tree.branch_count - tree.declared_budget) / Math.max(1, tree.declared_budget)),
  };

  return {
    tree_id: tree.tree_id,
    task_id: tree.task_id,
    evaluator: tree.evaluator,
    tree,
    branch_evaluations: branchEvaluations,
    bls_score: blsScore,
    avg_legitimacy: tree.scores.avg_legitimacy,
    coverage_factor: tree.scores.coverage_factor,
    complexity_discipline: tree.scores.complexity_discipline,
    faults,
    evaluated_at: new Date().toISOString(),
  };
}

/**
 * Update BLS evaluation with ground truth and compute slashing
 */
export function updateWithGroundTruth(
  result: BLSEvaluationResult,
  groundTruth: { final_verdict: string; branch_correctness: Record<string, boolean> },
  stake: string,
  config: BLSConfig = DEFAULT_BLS_CONFIG
): BLSEvaluationResult {
  // Classify faults with ground truth
  const faults = classifyFaults(result.tree, groundTruth.branch_correctness, config);

  // Compute slashing
  const slashing = computeSlashing(stake, faults, result.tree, config);

  return {
    ...result,
    faults,
    slashing,
    ground_truth: groundTruth,
  };
}
