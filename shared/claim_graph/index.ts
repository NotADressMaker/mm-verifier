import { createHash } from 'node:crypto';

export type ClaimNode = {
  id: string;
  type: 'claim';
  text: string;
  subject?: string;
  predicate?: string;
  object?: string;
  qualifiers?: Record<string, string>;
  citations?: Citation[];
};

export type CitationNode = {
  id: string;
  type: 'citation';
  url: string;
};

export type ClaimGraphNode = ClaimNode | CitationNode;

export type Citation = {
  url: string;
  label?: string;
};

export type RelationEdge = {
  from: string;
  to: string;
  type: 'cites' | 'supports' | 'contradicts';
  evidence?: string;
};

export type ClaimGraph = {
  nodes: ClaimGraphNode[];
  edges: RelationEdge[];
};

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s.:/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function hashClaim(text: string): string {
  const normalized = normalizeText(text);
  return createHash('sha256').update(normalized).digest('hex');
}

function extractSentenceClaims(text: string): string[] {
  return text
    .split(/[.!?]+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function extractClaimParts(sentence: string): {
  subject?: string;
  predicate?: string;
  object?: string;
} {
  const match = sentence.match(
    /(.+?)\s+(is|are|was|were|has|have|causes|includes|equals|means)\s+(.+)/i
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

function extractCitations(sentence: string): Citation[] {
  const urls = sentence.match(/https?:\/\/[^\s)]+/g) ?? [];
  return urls.map((url) => ({ url }));
}

export function buildClaimGraph(text: string): ClaimGraph {
  const nodes: ClaimGraphNode[] = [];
  const edges: RelationEdge[] = [];

  const sentences = extractSentenceClaims(text);
  for (const sentence of sentences) {
    const citations = extractCitations(sentence);
    const parts = extractClaimParts(sentence);
    const claimId = hashClaim(sentence);

    const claimNode: ClaimNode = {
      id: claimId,
      type: 'claim',
      text: sentence,
      ...parts,
      citations: citations.length ? citations : undefined,
    };

    nodes.push(claimNode);

    for (const citation of citations) {
      const citationId = hashClaim(citation.url);
      const citationNode: CitationNode = {
        id: citationId,
        type: 'citation',
        url: citation.url,
      };
      nodes.push(citationNode);
      edges.push({
        from: claimId,
        to: citationId,
        type: 'cites',
      });
    }
  }

  return { nodes, edges };
}

export function findContradictions(
  graphA: ClaimGraph,
  graphB: ClaimGraph
): RelationEdge[] {
  const contradictions: RelationEdge[] = [];
  const claimsA = graphA.nodes.filter((node): node is ClaimNode => node.type === 'claim');
  const claimsB = graphB.nodes.filter((node): node is ClaimNode => node.type === 'claim');

  for (const claimA of claimsA) {
    for (const claimB of claimsB) {
      if (isContradictory(claimA.text, claimB.text)) {
        contradictions.push({
          from: claimA.id,
          to: claimB.id,
          type: 'contradicts',
          evidence: `${claimA.text} <> ${claimB.text}`,
        });
      }
    }
  }

  return contradictions;
}

export function computeCitationCoverage(graph: ClaimGraph): number {
  const claims = graph.nodes.filter((node): node is ClaimNode => node.type === 'claim');
  if (claims.length === 0) return 0;
  const cited = claims.filter((claim) => (claim.citations ?? []).length > 0).length;
  return cited / claims.length;
}

function isContradictory(textA: string, textB: string): boolean {
  const a = normalizeText(textA);
  const b = normalizeText(textB);
  if (a === b) return false;
  const negation = /\b(no|not|never|none|false|incorrect)\b/;
  const strippedA = a.replace(negation, '').replace(/\s+/g, ' ').trim();
  const strippedB = b.replace(negation, '').replace(/\s+/g, ' ').trim();
  if (strippedA && strippedA === strippedB) {
    return negation.test(a) !== negation.test(b);
  }
  return a.includes(b) || b.includes(a) ? negation.test(a) !== negation.test(b) : false;
}

export function computeAgreementRatio(
  graphs: ClaimGraph[],
  weights: number[]
): number {
  if (graphs.length === 0) return 0;
  const claimSets = graphs.map((graph) =>
    new Set(graph.nodes.filter((node) => node.type === 'claim').map((node) => node.id))
  );
  const allClaims = new Set<string>();
  claimSets.forEach((set) => set.forEach((id) => allClaims.add(id)));

  const totalWeight = weights.reduce((sum, value) => sum + value, 0) || 1;
  let weightedAgreement = 0;

  for (const claimId of allClaims) {
    let claimWeight = 0;
    claimSets.forEach((set, index) => {
      if (set.has(claimId)) {
        claimWeight += weights[index] ?? 1;
      }
    });
    weightedAgreement += claimWeight / totalWeight;
  }

  return allClaims.size > 0 ? weightedAgreement / allClaims.size : 0;
}
