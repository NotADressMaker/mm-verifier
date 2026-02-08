import { createHash } from 'node:crypto';

export type Claim = {
  id: string;
  text: string;
  canonical_text: string;
  subject?: string;
  predicate?: string;
  object?: string;
  qualifiers?: Record<string, string>;
  model_id: string;
  position: number;
  citations: Citation[];
};

export type Citation = {
  id: string;
  url: string;
  title?: string;
  domain?: string;
  snippet_hash?: string;
  provider?: string;
};

export type SupportEdge = {
  claim_id: string;
  model_id: string;
  support_strength: number;
};

export type ContradictionEdge = {
  claim_a_id: string;
  claim_b_id: string;
  severity: 'LOW' | 'MED' | 'HIGH';
  rationale: string;
};

export type ClaimGraph = {
  claims: Claim[];
  citations: Citation[];
  support_edges: SupportEdge[];
  contradiction_edges: ContradictionEdge[];
  provenance: {
    models: string[];
    extracted_at: number;
  };
};

export type ClaimCluster = {
  id: string;
  canonical_text: string;
  claim_ids: string[];
  model_ids: string[];
  prominence_score: number;
  citations: Citation[];
};

export type ClaimScoreComponents = {
  coverage_bps: number;
  contradiction_penalty_bps: number;
  citation_quality_bps: number;
  final_score_bps: number;
};

export type ClaimSummaryEntry = {
  cluster_id: string;
  canonical_text: string;
  supported_by: string[];
  contradicted_by: string[];
  severity?: 'LOW' | 'MED' | 'HIGH';
  citations: Citation[];
};

export type ClaimGraphAnalysis = {
  graph: ClaimGraph;
  clusters: ClaimCluster[];
  claim_summary: ClaimSummaryEntry[];
  score_components: ClaimScoreComponents;
  highlights: string[];
  agreement_ratio: number;
  contradiction_count: number;
  citation_coverage: number;
  total_claims: number;
};

const NEGATION_PATTERN = /\b(no|not|never|none|false|incorrect|without|cannot|can't)\b/i;
const URL_PATTERN = /https?:\/\/[^\s)\]]+/gi;
const SOURCE_LINE_PATTERN = /^\s*sources?:\s*/i;
const TOKEN_CLEAN = /[^a-z0-9]+/gi;
const DOMAIN_BONUS = ['.gov', '.edu'];
const DOMAIN_PENALTY = ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl'];

export function canonicalizeClaimText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s.%:/-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function hashClaim(params: {
  text: string;
  subject?: string;
  predicate?: string;
  object?: string;
  qualifiers?: Record<string, string>;
}): string {
  const canonical = canonicalizeClaimText(params.text);
  const qualifierKeys = params.qualifiers ? Object.keys(params.qualifiers).sort() : [];
  const qualifierString = qualifierKeys
    .map((key) => `${key}:${canonicalizeClaimText(params.qualifiers?.[key] ?? '')}`)
    .join('|');
  const raw = [
    canonical,
    params.subject ? canonicalizeClaimText(params.subject) : '',
    params.predicate ? canonicalizeClaimText(params.predicate) : '',
    params.object ? canonicalizeClaimText(params.object) : '',
    qualifierString,
  ].join('|');
  return createHash('sha256').update(raw).digest('hex');
}

function hashCitation(url: string): string {
  return createHash('sha256').update(url.trim().toLowerCase()).digest('hex');
}

function splitIntoClaims(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/(?<=[.!?])\s+|[;\n]+/g)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
}

function extractSPO(sentence: string): {
  subject?: string;
  predicate?: string;
  object?: string;
} {
  const match = sentence.match(
    /(.+?)\s+(is|are|was|were|has|have|causes|includes|equals|means|leads to|results in)\s+(.+)/i
  );
  if (!match) {
    return {};
  }
  return {
    subject: match[1].trim(),
    predicate: match[2].trim(),
    object: match[3].trim(),
  };
}

function extractCitations(text: string): Citation[] {
  const urls = text.match(URL_PATTERN) ?? [];
  return urls.map((url) => {
    let domain: string | undefined;
    try {
      domain = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      domain = undefined;
    }
    return {
      id: hashCitation(url),
      url,
      domain,
    };
  });
}

function stripCitationText(text: string): string {
  return text.replace(URL_PATTERN, '').replace(/\[[^\]]+\]/g, '').trim();
}

export function extractClaimsFromText(params: {
  text: string;
  model_id: string;
}): {
  claims: Claim[];
  citations: Citation[];
  support_edges: SupportEdge[];
} {
  const claims: Claim[] = [];
  const citations: Citation[] = [];
  const support_edges: SupportEdge[] = [];
  const seenCitations = new Map<string, Citation>();
  const segments = splitIntoClaims(params.text);
  let lastClaim: Claim | null = null;

  segments.forEach((segment, index) => {
    const citationMatches = extractCitations(segment);
    const claimText = stripCitationText(segment);
    const isSourceLine = SOURCE_LINE_PATTERN.test(segment) && claimText.length === 0;

    const targetClaim = lastClaim;
    if ((claimText.length === 0 || isSourceLine) && targetClaim) {
      citationMatches.forEach((citation) => {
        if (!seenCitations.has(citation.id)) {
          seenCitations.set(citation.id, citation);
          citations.push(citation);
        }
        targetClaim.citations.push(citation);
      });
      return;
    }

    if (claimText.length === 0) {
      return;
    }

    const spo = extractSPO(claimText);
    const claimId = hashClaim({
      text: claimText,
      subject: spo.subject,
      predicate: spo.predicate,
      object: spo.object,
    });
    const claim: Claim = {
      id: claimId,
      text: claimText,
      canonical_text: canonicalizeClaimText(claimText),
      subject: spo.subject,
      predicate: spo.predicate,
      object: spo.object,
      model_id: params.model_id,
      position: index,
      citations: [],
    };

    citationMatches.forEach((citation) => {
      if (!seenCitations.has(citation.id)) {
        seenCitations.set(citation.id, citation);
        citations.push(citation);
      }
      claim.citations.push(citation);
    });

    claims.push(claim);
    support_edges.push({
      claim_id: claimId,
      model_id: params.model_id,
      support_strength: 1,
    });
    lastClaim = claim;
  });

  return { claims, citations, support_edges };
}

function tokenize(text: string): string[] {
  return canonicalizeClaimText(text)
    .split(/\s+/)
    .map((token) => token.replace(TOKEN_CLEAN, ''))
    .filter((token) => token.length > 1);
}

function jaccardSimilarity(a: string, b: string): number {
  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersection = 0;
  tokensA.forEach((token) => {
    if (tokensB.has(token)) intersection += 1;
  });
  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function alignClaimClusters(
  claims: Claim[],
  similarityThreshold = 0.6
): ClaimCluster[] {
  const clusters: ClaimCluster[] = [];
  const sortedClaims = [...claims].sort((a, b) =>
    a.canonical_text.localeCompare(b.canonical_text) ||
    a.model_id.localeCompare(b.model_id) ||
    a.position - b.position
  );

  for (const claim of sortedClaims) {
    let bestCluster: ClaimCluster | undefined;
    let bestScore = 0;

    for (const cluster of clusters) {
      const score = jaccardSimilarity(claim.canonical_text, cluster.canonical_text);
      if (score >= similarityThreshold && score > bestScore) {
        bestScore = score;
        bestCluster = cluster;
      }
    }

    if (!bestCluster) {
      const clusterId = createHash('sha256')
        .update(claim.canonical_text)
        .digest('hex');
      clusters.push({
        id: clusterId,
        canonical_text: claim.canonical_text,
        claim_ids: [claim.id],
        model_ids: [claim.model_id],
        prominence_score: 0,
        citations: [...claim.citations],
      });
      continue;
    }

    bestCluster.claim_ids.push(claim.id);
    if (!bestCluster.model_ids.includes(claim.model_id)) {
      bestCluster.model_ids.push(claim.model_id);
    }
    claim.citations.forEach((citation) => {
      if (!bestCluster.citations.find((existing) => existing.id === citation.id)) {
        bestCluster.citations.push(citation);
      }
    });
  }

  clusters.forEach((cluster) => {
    const totalPositions = cluster.claim_ids.length || 1;
    const positionScore = cluster.claim_ids.reduce((sum, claimId) => {
      const claim = claims.find((item) => item.id === claimId);
      if (!claim) return sum;
      return sum + 1 / (1 + claim.position);
    }, 0);
    cluster.prominence_score =
      cluster.model_ids.length * 2 + positionScore / totalPositions;
  });

  return clusters;
}

function extractNumbers(text: string): string[] {
  const matches = text.match(/-?\d+(?:\.\d+)?(?:\s*(?:%|percent|km|m|kg|years|year|days|day))?/gi);
  return matches ? matches.map((item) => item.replace(/\s+/g, ' ').trim()) : [];
}

function detectContradiction(a: Claim, b: Claim): ContradictionEdge | null {
  const aText = a.canonical_text;
  const bText = b.canonical_text;
  const aNeg = NEGATION_PATTERN.test(aText);
  const bNeg = NEGATION_PATTERN.test(bText);

  if (aNeg !== bNeg && aText.replace(NEGATION_PATTERN, '').trim() === bText.replace(NEGATION_PATTERN, '').trim()) {
    return {
      claim_a_id: a.id,
      claim_b_id: b.id,
      severity: 'HIGH',
      rationale: 'Direct negation detected across aligned claims.',
    };
  }

  const numbersA = extractNumbers(aText);
  const numbersB = extractNumbers(bText);
  if (numbersA.length > 0 && numbersB.length > 0 && numbersA.join('|') !== numbersB.join('|')) {
    return {
      claim_a_id: a.id,
      claim_b_id: b.id,
      severity: 'MED',
      rationale: 'Numeric mismatch detected across aligned claims.',
    };
  }

  if (aNeg !== bNeg) {
    return {
      claim_a_id: a.id,
      claim_b_id: b.id,
      severity: 'HIGH',
      rationale: 'Negation cue mismatch detected across aligned claims.',
    };
  }

  return null;
}

export function detectContradictions(
  claims: Claim[],
  clusters: ClaimCluster[]
): ContradictionEdge[] {
  const contradictions: ContradictionEdge[] = [];
  clusters.forEach((cluster) => {
    const clusterClaims = claims.filter((claim) => cluster.claim_ids.includes(claim.id));
    for (let i = 0; i < clusterClaims.length; i += 1) {
      for (let j = i + 1; j < clusterClaims.length; j += 1) {
        const contradiction = detectContradiction(clusterClaims[i], clusterClaims[j]);
        if (contradiction) {
          contradictions.push(contradiction);
        }
      }
    }
  });
  return contradictions;
}

function clampBps(value: number): number {
  return Math.max(0, Math.min(10000, Math.round(value)));
}

function computeCitationQuality(clusters: ClaimCluster[], modelCount: number): number {
  if (clusters.length === 0) return 0;
  const clusterScores = clusters.map((cluster) => {
    const citations = cluster.citations;
    const hasCitation = citations.length > 0 ? 1 : 0;
    const domainCounts = new Map<string, number>();
    citations.forEach((citation) => {
      if (!citation.domain) return;
      domainCounts.set(citation.domain, (domainCounts.get(citation.domain) ?? 0) + 1);
    });
    const overlap = Array.from(domainCounts.values()).some((count) => count > 1) ? 1 : 0;
    let domainScore = 0;
    const domains = Array.from(domainCounts.keys());
    if (domains.some((domain) => DOMAIN_PENALTY.includes(domain))) {
      domainScore -= 0.2;
    }
    if (domains.some((domain) => DOMAIN_BONUS.some((suffix) => domain.endsWith(suffix)))) {
      domainScore += 0.2;
    }
    const coverageBonus = citations.length / Math.max(1, modelCount);
    return Math.max(0, Math.min(1, hasCitation * 0.5 + overlap * 0.2 + coverageBonus * 0.2 + domainScore));
  });

  const average = clusterScores.reduce((sum, score) => sum + score, 0) / clusterScores.length;
  return clampBps(average * 10000);
}

export function scoreClaimGraph(params: {
  clusters: ClaimCluster[];
  contradictions: ContradictionEdge[];
  modelCount: number;
}): {
  score_components: ClaimScoreComponents;
  core_clusters: ClaimCluster[];
  highlights: string[];
} {
  const { clusters, contradictions, modelCount } = params;
  const sortedClusters = [...clusters].sort(
    (a, b) => b.prominence_score - a.prominence_score || a.id.localeCompare(b.id)
  );
  const coreCount = Math.max(1, Math.min(5, sortedClusters.length));
  const coreClusters = sortedClusters.slice(0, coreCount);
  const majority = Math.max(1, Math.ceil(modelCount / 2));

  const supportedCore = coreClusters.filter((cluster) => cluster.model_ids.length >= majority);
  const coverage = coreClusters.length
    ? (supportedCore.length / coreClusters.length) * 10000
    : 0;

  let contradictionPenalty = 0;
  const severityWeights: Record<ContradictionEdge['severity'], number> = {
    LOW: 500,
    MED: 1500,
    HIGH: 3000,
  };
  contradictions.forEach((edge) => {
    const isCore =
      coreClusters.some((cluster) => cluster.claim_ids.includes(edge.claim_a_id)) ||
      coreClusters.some((cluster) => cluster.claim_ids.includes(edge.claim_b_id));
    const weight = severityWeights[edge.severity];
    contradictionPenalty += isCore ? weight * 1.5 : weight;
  });

  const citationQuality = computeCitationQuality(clusters, modelCount);
  const finalScore = clampBps(coverage - contradictionPenalty + citationQuality * 0.4);

  const highlights: string[] = [];
  if (supportedCore.length > 0) {
    highlights.push(
      `${supportedCore.length}/${coreClusters.length} core claims supported by a majority.`
    );
  }
  if (contradictions.length > 0) {
    highlights.push(`${contradictions.length} contradictions detected across aligned claims.`);
  }
  if (citationQuality < 4000) {
    highlights.push('Citation quality is weak across claim clusters.');
  }

  return {
    score_components: {
      coverage_bps: clampBps(coverage),
      contradiction_penalty_bps: clampBps(contradictionPenalty),
      citation_quality_bps: citationQuality,
      final_score_bps: finalScore,
    },
    core_clusters: coreClusters,
    highlights,
  };
}

export function buildClaimGraphAnalysis(params: {
  responses: Array<{ model_id: string; text: string }>;
}): ClaimGraphAnalysis {
  const extractionResults = params.responses.map((response) =>
    extractClaimsFromText({ text: response.text, model_id: response.model_id })
  );

  const claims = extractionResults.flatMap((result) => result.claims);
  const citations = extractionResults.flatMap((result) => result.citations);
  const support_edges = extractionResults.flatMap((result) => result.support_edges);
  const models = params.responses.map((response) => response.model_id);

  const clusters = alignClaimClusters(claims);
  const contradictions = detectContradictions(claims, clusters);
  const scoring = scoreClaimGraph({
    clusters,
    contradictions,
    modelCount: models.length,
  });

  const claimSummary: ClaimSummaryEntry[] = clusters.map((cluster) => {
    const clusterContradictions = contradictions.filter(
      (edge) =>
        cluster.claim_ids.includes(edge.claim_a_id) || cluster.claim_ids.includes(edge.claim_b_id)
    );
    const claimModelMap = new Map<string, string>();
    claims.forEach((claim) => claimModelMap.set(claim.id, claim.model_id));
    const severities = clusterContradictions.map((edge) => edge.severity);
    const severity = severities.includes('HIGH')
      ? 'HIGH'
      : severities.includes('MED')
      ? 'MED'
      : severities.includes('LOW')
      ? 'LOW'
      : undefined;

    const contradictedByModels = Array.from(
      new Set(
        clusterContradictions
          .flatMap((edge) => [edge.claim_a_id, edge.claim_b_id])
          .map((id) => claimModelMap.get(id))
          .filter((id): id is string => Boolean(id))
      )
    );

    return {
      cluster_id: cluster.id,
      canonical_text: cluster.canonical_text,
      supported_by: cluster.model_ids,
      contradicted_by: contradictedByModels,
      severity,
      citations: cluster.citations,
    };
  });

  const agreementRatio =
    clusters.length === 0
      ? 0
      : clusters.reduce((sum, cluster) => sum + cluster.model_ids.length / models.length, 0) /
        clusters.length;

  const citationCoverage = clusters.length
    ? clusters.filter((cluster) => cluster.citations.length > 0).length / clusters.length
    : 0;

  const graph: ClaimGraph = {
    claims,
    citations,
    support_edges,
    contradiction_edges: contradictions,
    provenance: {
      models,
      extracted_at: Math.floor(Date.now() / 1000),
    },
  };

  return {
    graph,
    clusters,
    claim_summary: claimSummary,
    score_components: scoring.score_components,
    highlights: scoring.highlights,
    agreement_ratio: agreementRatio,
    contradiction_count: contradictions.length,
    citation_coverage: citationCoverage,
    total_claims: claims.length,
  };
}

export function buildDeterministicClaimId(text: string): string {
  return createHash('sha256').update(canonicalizeClaimText(text)).digest('hex');
}

export function deriveClaimClusterId(text: string): string {
  return createHash('sha256').update(canonicalizeClaimText(text)).digest('hex');
}
