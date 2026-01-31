# MMV Scoring Pipeline

**Version**: 1.0
**Status**: Deterministic & Reproducible
**Last Updated**: 2026-01-10

## Overview

The scoring pipeline transforms multiple LLM outputs into a single, verifiable trust score. The process is **deterministic** and **reproducible**: given the same inputs, any verifier will compute the same score.

---

## Pipeline Stages

### Stage 1: Output Normalization

**Purpose**: Strip formatting differences, extract structured answers

**Input**: Raw LLM responses (may include markdown, JSON, code blocks)

**Process**:
```typescript
function normalizeOutput(rawResponse: string): NormalizedOutput {
  // 1. Remove markdown formatting
  let clean = rawResponse
    .replace(/```[\s\S]*?```/g, '') // Code blocks
    .replace(/`([^`]+)`/g, '$1')     // Inline code
    .replace(/\*\*([^*]+)\*\*/g, '$1') // Bold
    .replace(/\*([^*]+)\*/g, '$1')   // Italic
    .replace(/#+\s/g, '');           // Headers

  // 2. Normalize whitespace
  clean = clean
    .replace(/\s+/g, ' ')
    .trim();

  // 3. Extract structured answer (if present)
  const structuredMatch = clean.match(/Answer:\s*(.+?)(?:\n|$)/i);
  const mainAnswer = structuredMatch ? structuredMatch[1] : clean;

  // 4. Normalize case for comparison
  const normalized = mainAnswer.toLowerCase();

  return {
    raw: rawResponse,
    cleaned: clean,
    mainAnswer,
    normalized,
    length: mainAnswer.length,
    wordCount: mainAnswer.split(/\s+/).length
  };
}
```

**Output**:
```typescript
interface NormalizedOutput {
  raw: string;           // Original response
  cleaned: string;       // Cleaned response
  mainAnswer: string;    // Extracted answer
  normalized: string;    // Lowercase, normalized
  length: number;        // Character count
  wordCount: number;     // Word count
}
```

**Example**:
```
Input (GPT-4):
```markdown
**Answer**: The capital of France is **Paris**.

Paris is located in the north-central part of the country.
```

Output:
```json
{
  "raw": "**Answer**: The capital of France is **Paris**...",
  "cleaned": "Answer: The capital of France is Paris...",
  "mainAnswer": "The capital of France is Paris.",
  "normalized": "the capital of france is paris.",
  "length": 35,
  "wordCount": 7
}
```

---

### Stage 2: Claim Extraction

**Purpose**: Convert free text into atomic, verifiable claims

**Claim Types**:
1. **Factual**: "Paris is the capital of France"
2. **Numeric**: "The population is 2.1 million"
3. **Causal**: "CO2 emissions cause global warming"
4. **Policy**: "The law requires X"

**Process**:
```typescript
function extractClaims(text: string): Claim[] {
  const claims: Claim[] = [];

  // 1. Sentence segmentation
  const sentences = text
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 20); // Filter out short fragments

  for (const sentence of sentences) {
    // 2. Classify claim type
    const type = classifyClaimType(sentence);

    // 3. Extract entities
    const entities = extractEntities(sentence);

    // 4. Extract numbers
    const numbers = extractNumbers(sentence);

    // 5. Extract temporal references
    const temporal = extractTemporal(sentence);

    claims.push({
      text: sentence,
      type,
      entities,
      numbers,
      temporal,
      confidence: calculateClaimConfidence(sentence)
    });
  }

  return claims;
}
```

**Claim Classification**:
```typescript
function classifyClaimType(sentence: string): ClaimType {
  // Factual: statements of fact
  if (/^(the|a|an)\s+\w+\s+(is|are|was|were)/i.test(sentence)) {
    return 'factual';
  }

  // Numeric: contains numbers and units
  if (/\d+(\.\d+)?\s*(million|billion|percent|degrees|kg|meters)/i.test(sentence)) {
    return 'numeric';
  }

  // Causal: cause-effect relationships
  if (/(cause|lead|result|because|due to|therefore)/i.test(sentence)) {
    return 'causal';
  }

  // Policy: laws, rules, requirements
  if (/(law|require|prohibit|mandate|regulation|must|shall)/i.test(sentence)) {
    return 'policy';
  }

  return 'factual'; // Default
}
```

**Entity Extraction** (Simple version - production would use NER):
```typescript
function extractEntities(sentence: string): Entity[] {
  const entities: Entity[] = [];

  // Capitalize words (likely entities)
  const words = sentence.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    if (/^[A-Z]/.test(words[i])) {
      entities.push({
        text: words[i],
        type: 'ENTITY',
        position: i
      });
    }
  }

  return entities;
}
```

**Output**:
```typescript
interface Claim {
  text: string;           // Original sentence
  type: ClaimType;        // factual | numeric | causal | policy
  entities: Entity[];     // Named entities
  numbers: number[];      // Numeric values
  temporal: string[];     // Time references
  confidence: number;     // 0-1
}
```

**Example**:
```
Input: "Paris is the capital of France. It has a population of 2.1 million."

Output:
[
  {
    text: "Paris is the capital of France",
    type: "factual",
    entities: [
      { text: "Paris", type: "CITY", position: 0 },
      { text: "France", type: "COUNTRY", position: 5 }
    ],
    numbers: [],
    temporal: [],
    confidence: 0.95
  },
  {
    text: "It has a population of 2.1 million",
    type: "numeric",
    entities: [],
    numbers: [2.1],
    temporal: [],
    confidence: 0.90
  }
]
```

---

### Stage 3: Retrieval + Evidence

**Purpose**: Fetch authoritative sources to verify claims

**Process**:
```typescript
async function retrieveEvidence(claim: Claim): Promise<Evidence[]> {
  const evidence: Evidence[] = [];

  // 1. Extract search query from claim
  const query = buildSearchQuery(claim);

  // 2. Search authoritative sources
  const sources = await Promise.all([
    searchWikipedia(query),
    searchScholar(query),
    searchGovernment(query) // .gov, .edu domains
  ]);

  // 3. Extract relevant snippets
  for (const source of sources.flat()) {
    const snippets = extractRelevantSnippets(source.content, claim);

    for (const snippet of snippets) {
      evidence.push({
        url: source.url,
        title: source.title,
        snippet: snippet.text,
        relevance: snippet.relevance,
        authority: calculateAuthorityScore(source.url),
        timestamp: Date.now(),
        hash: hashContent(snippet.text)
      });
    }
  }

  // 4. Sort by relevance × authority
  return evidence.sort((a, b) =>
    (b.relevance * b.authority) - (a.relevance * a.authority)
  );
}
```

**Authority Scoring**:
```typescript
function calculateAuthorityScore(url: string): number {
  const domain = new URL(url).hostname;

  // Tier 1: Highest authority (1.0)
  const tier1 = ['.gov', '.edu', 'wikipedia.org', 'nature.com', 'science.org'];
  if (tier1.some(d => domain.includes(d))) return 1.0;

  // Tier 2: High authority (0.8)
  const tier2 = ['arxiv.org', 'ieee.org', 'acm.org', 'nih.gov'];
  if (tier2.some(d => domain.includes(d))) return 0.8;

  // Tier 3: Medium authority (0.6)
  const tier3 = ['bbc.com', 'nytimes.com', 'reuters.com'];
  if (tier3.some(d => domain.includes(d))) return 0.6;

  // Tier 4: Low authority (0.4)
  return 0.4;
}
```

**Snippet Extraction**:
```typescript
function extractRelevantSnippets(
  content: string,
  claim: Claim
): Snippet[] {
  const sentences = content.split(/[.!?]+/);
  const snippets: Snippet[] = [];

  for (const sentence of sentences) {
    // Calculate semantic similarity to claim
    const relevance = calculateSimilarity(sentence, claim.text);

    if (relevance > 0.5) { // Threshold
      snippets.push({
        text: sentence.trim(),
        relevance,
        length: sentence.length
      });
    }
  }

  // Return top 3 most relevant
  return snippets
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 3);
}
```

**Output**:
```typescript
interface Evidence {
  url: string;           // Source URL
  title: string;         // Page title
  snippet: string;       // Relevant excerpt
  relevance: number;     // 0-1 similarity to claim
  authority: number;     // 0-1 source authority
  timestamp: number;     // When retrieved
  hash: string;          // Content hash (tamper-proof)
}
```

**Example**:
```
Claim: "Paris is the capital of France"

Evidence:
[
  {
    url: "https://en.wikipedia.org/wiki/Paris",
    title: "Paris - Wikipedia",
    snippet: "Paris is the capital and most populous city of France.",
    relevance: 0.98,
    authority: 1.0,
    timestamp: 1234567890,
    hash: "0xabc123..."
  },
  {
    url: "https://www.france.fr/en/paris",
    title: "Paris | France.fr",
    snippet: "Paris, capital of France, is one of the most important and influential cities in the world.",
    relevance: 0.85,
    authority: 0.8,
    timestamp: 1234567891,
    hash: "0xdef456..."
  }
]
```

---

### Stage 4: Cross-Model Consensus

**Purpose**: Cluster answers, compute agreement, detect outliers

**Process**:
```typescript
function computeConsensus(responses: ModelResponse[]): ConsensusAnalysis {
  // 1. Normalize all responses
  const normalized = responses.map(r => normalizeOutput(r.response));

  // 2. Compute pairwise similarities
  const similarities = computePairwiseSimilarities(normalized);

  // 3. Cluster similar responses
  const clusters = clusterResponses(similarities);

  // 4. Identify consensus cluster (largest)
  const consensusCluster = clusters.reduce((max, c) =>
    c.members.length > max.members.length ? c : max
  );

  // 5. Detect outliers
  const outliers = responses.filter((r, i) =>
    !consensusCluster.memberIndices.includes(i)
  );

  // 6. Calculate agreement score
  const agreementScore = consensusCluster.members.length / responses.length;

  return {
    consensusCluster,
    outliers,
    agreementScore,
    clusters
  };
}
```

**Similarity Calculation** (Jaccard + Embedding):
```typescript
function computePairwiseSimilarities(
  outputs: NormalizedOutput[]
): number[][] {
  const n = outputs.length;
  const similarities: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      if (i === j) {
        similarities[i][j] = 1.0;
      } else {
        // Jaccard similarity (word overlap)
        const jaccard = calculateJaccard(
          outputs[i].normalized,
          outputs[j].normalized
        );

        // Simple semantic similarity (length + keyword overlap)
        const semantic = calculateSemanticSimilarity(
          outputs[i].mainAnswer,
          outputs[j].mainAnswer
        );

        // Weighted average
        similarities[i][j] = similarities[j][i] = (jaccard * 0.4 + semantic * 0.6);
      }
    }
  }

  return similarities;
}
```

**Clustering** (Simple threshold-based):
```typescript
function clusterResponses(similarities: number[][]): Cluster[] {
  const n = similarities.length;
  const visited = new Array(n).fill(false);
  const clusters: Cluster[] = [];

  for (let i = 0; i < n; i++) {
    if (visited[i]) continue;

    const cluster: Cluster = {
      centerIndex: i,
      memberIndices: [i],
      members: [],
      avgSimilarity: 0
    };

    // Find all similar responses (threshold: 0.7)
    for (let j = 0; j < n; j++) {
      if (i !== j && !visited[j] && similarities[i][j] >= 0.7) {
        cluster.memberIndices.push(j);
        visited[j] = true;
      }
    }

    visited[i] = true;

    // Calculate average intra-cluster similarity
    let totalSim = 0;
    let count = 0;
    for (let mi of cluster.memberIndices) {
      for (let mj of cluster.memberIndices) {
        if (mi !== mj) {
          totalSim += similarities[mi][mj];
          count++;
        }
      }
    }
    cluster.avgSimilarity = count > 0 ? totalSim / count : 1.0;

    clusters.push(cluster);
  }

  return clusters;
}
```

**Output**:
```typescript
interface ConsensusAnalysis {
  consensusCluster: Cluster;    // Majority cluster
  outliers: ModelResponse[];    // Responses not in consensus
  agreementScore: number;       // 0-1
  clusters: Cluster[];          // All clusters
}
```

**Example**:
```
Responses:
1. GPT-4: "Paris"
2. Claude: "Paris"
3. Gemini: "Paris, France"
4. Llama: "The capital is Paris"
5. Mistral: "Lyon" (outlier)

Consensus Analysis:
{
  consensusCluster: {
    centerIndex: 0,
    memberIndices: [0, 1, 2, 3],
    avgSimilarity: 0.92
  },
  outliers: [Mistral response],
  agreementScore: 0.8 (4/5 models agree),
  clusters: [
    { members: 4, center: "Paris" },
    { members: 1, center: "Lyon" }
  ]
}
```

---

### Stage 5: Claim Verification

**Purpose**: Verify claims against evidence using entailment

**Process**:
```typescript
async function verifyClaims(
  claims: Claim[],
  evidence: Evidence[]
): Promise<VerificationResult[]> {
  const results: VerificationResult[] = [];

  for (const claim of claims) {
    // Find most relevant evidence for this claim
    const relevantEvidence = evidence
      .filter(e => calculateSimilarity(e.snippet, claim.text) > 0.5)
      .slice(0, 3); // Top 3 most relevant

    // Check entailment: does evidence support claim?
    const entailments = await Promise.all(
      relevantEvidence.map(e => checkEntailment(claim.text, e.snippet))
    );

    // Aggregate entailment scores
    const avgEntailment = entailments.reduce((sum, e) => sum + e, 0) / entailments.length;

    // Determine verification status
    let status: VerificationStatus;
    if (avgEntailment >= 0.8) status = 'verified';
    else if (avgEntailment >= 0.5) status = 'partially_verified';
    else if (avgEntailment >= 0.3) status = 'uncertain';
    else status = 'contradicted';

    results.push({
      claim,
      evidence: relevantEvidence,
      entailmentScore: avgEntailment,
      status,
      confidence: calculateVerificationConfidence(avgEntailment, relevantEvidence)
    });
  }

  return results;
}
```

**Entailment Check** (Simplified - production would use NLI model):
```typescript
function checkEntailment(claim: string, evidence: string): number {
  // Normalize both
  const claimNorm = claim.toLowerCase();
  const evidenceNorm = evidence.toLowerCase();

  // Extract key phrases
  const claimWords = new Set(claimNorm.split(/\s+/).filter(w => w.length > 3));
  const evidenceWords = new Set(evidenceNorm.split(/\s+/));

  // Calculate word overlap
  let overlap = 0;
  for (const word of claimWords) {
    if (evidenceWords.has(word)) overlap++;
  }

  const overlapRatio = overlap / claimWords.size;

  // Check for contradictions
  const contradictions = detectContradictions(claimNorm, evidenceNorm);
  if (contradictions > 0) {
    return Math.max(0, overlapRatio - 0.5);
  }

  return overlapRatio;
}
```

**Contradiction Detection**:
```typescript
function detectContradictions(claim: string, evidence: string): number {
  const contradictionPairs = [
    ['is', 'is not'],
    ['true', 'false'],
    ['yes', 'no'],
    ['correct', 'incorrect'],
    ['always', 'never'],
    ['all', 'none']
  ];

  let contradictions = 0;

  for (const [pos, neg] of contradictionPairs) {
    if ((claim.includes(pos) && evidence.includes(neg)) ||
        (claim.includes(neg) && evidence.includes(pos))) {
      contradictions++;
    }
  }

  return contradictions;
}
```

**Output**:
```typescript
interface VerificationResult {
  claim: Claim;
  evidence: Evidence[];
  entailmentScore: number;      // 0-1
  status: VerificationStatus;   // verified | partially_verified | uncertain | contradicted
  confidence: number;           // 0-1
}
```

**Example**:
```
Claim: "Paris is the capital of France"
Evidence: "Paris is the capital and most populous city of France."

Verification:
{
  claim: { text: "Paris is the capital of France", ... },
  evidence: [{ snippet: "Paris is the capital and...", authority: 1.0 }],
  entailmentScore: 0.95,
  status: "verified",
  confidence: 0.98
}
```

---

### Stage 6: Compute Metrics

**Purpose**: Calculate quantitative scores for final evaluation

**Metrics**:

#### A) Consensus Score
```typescript
function computeConsensusScore(analysis: ConsensusAnalysis): number {
  // Based on agreement percentage
  const baseScore = analysis.agreementScore * 100;

  // Bonus for high intra-cluster similarity
  const similarityBonus = analysis.consensusCluster.avgSimilarity * 10;

  // Penalty for outliers
  const outlierPenalty = analysis.outliers.length * 5;

  return Math.max(0, Math.min(100, baseScore + similarityBonus - outlierPenalty));
}
```

#### B) Factuality Ratio
```typescript
function computeFactualityRatio(verifications: VerificationResult[]): number {
  if (verifications.length === 0) return 0;

  const weights = {
    verified: 1.0,
    partially_verified: 0.6,
    uncertain: 0.3,
    contradicted: 0.0
  };

  let totalWeight = 0;
  for (const v of verifications) {
    totalWeight += weights[v.status];
  }

  return (totalWeight / verifications.length) * 100;
}
```

#### C) Citation Authority Score
```typescript
function computeCitationScore(evidence: Evidence[]): number {
  if (evidence.length === 0) return 0;

  // Average authority of cited sources
  const avgAuthority = evidence.reduce((sum, e) => sum + e.authority, 0) / evidence.length;

  // Diversity bonus (unique domains)
  const domains = new Set(evidence.map(e => new URL(e.url).hostname));
  const diversityBonus = Math.min(20, domains.size * 5);

  return Math.min(100, avgAuthority * 80 + diversityBonus);
}
```

#### D) Stability Score
```typescript
function computeStabilityScore(responses: ModelResponse[]): number {
  // Measure variance in response lengths
  const lengths = responses.map(r => r.response.length);
  const avgLength = lengths.reduce((a, b) => a + b) / lengths.length;
  const variance = lengths.reduce((sum, l) => sum + Math.pow(l - avgLength, 2), 0) / lengths.length;
  const stdDev = Math.sqrt(variance);

  // Coefficient of variation
  const cv = stdDev / avgLength;

  // Low CV = high stability
  const stabilityScore = Math.max(0, 100 - cv * 100);

  return stabilityScore;
}
```

**Output**:
```typescript
interface Metrics {
  consensusScore: number;        // 0-100
  factualityRatio: number;       // 0-100
  citationAuthority: number;     // 0-100
  stability: number;             // 0-100
  responseCount: number;         // Number of models
  claimCount: number;            // Number of claims extracted
  evidenceCount: number;         // Number of evidence snippets
}
```

**Example**:
```json
{
  "consensusScore": 92,
  "factualityRatio": 95,
  "citationAuthority": 88,
  "stability": 85,
  "responseCount": 5,
  "claimCount": 3,
  "evidenceCount": 8
}
```

---

### Stage 7: Aggregate into Final Score

**Purpose**: Combine all metrics into single trust score (0-10000 bps)

**Formula**:
```typescript
function computeFinalScore(metrics: Metrics): number {
  // Weighted combination
  const weights = {
    consensus: 0.30,      // 30% weight
    factuality: 0.30,     // 30% weight
    citation: 0.20,       // 20% weight
    stability: 0.20       // 20% weight
  };

  const weightedScore =
    metrics.consensusScore * weights.consensus +
    metrics.factualityRatio * weights.factuality +
    metrics.citationAuthority * weights.citation +
    metrics.stability * weights.stability;

  // Convert to basis points (0-10000)
  const bps = Math.round(weightedScore * 100);

  return Math.max(0, Math.min(10000, bps));
}
```

**Verdict Mapping**:
```typescript
function getVerdict(score: number): string {
  if (score >= 8000) return 'reliable';      // 80%+
  if (score >= 5000) return 'mixed';         // 50-79%
  return 'unreliable';                        // <50%
}
```

**Output**:
```typescript
interface FinalScore {
  score: number;              // 0-10000 bps
  verdict: string;            // reliable | mixed | unreliable
  confidence: number;         // 0-1
  breakdown: Metrics;         // Detailed metrics
  reasoning: string;          // Human-readable explanation
}
```

**Example**:
```json
{
  "score": 9200,
  "verdict": "reliable",
  "confidence": 0.96,
  "breakdown": {
    "consensusScore": 92,
    "factualityRatio": 95,
    "citationAuthority": 88,
    "stability": 85
  },
  "reasoning": "High consensus across 5 models (92%). Strong factual verification (95%). Authoritative citations from Wikipedia and .gov sources. Stable response pattern."
}
```

---

### Stage 8: Sign Bundle (EIP-712)

**Purpose**: Create tamper-proof, cryptographically signed evidence bundle

**EIP-712 Domain**:
```typescript
const domain = {
  name: 'LLMVerifier',
  version: '1',
  chainId: 42161, // Arbitrum One
  verifyingContract: MARKETPLACE_ADDRESS
};
```

**Typed Data Structure**:
```typescript
const types = {
  EvidenceBundle: [
    { name: 'jobId', type: 'bytes32' },
    { name: 'verifier', type: 'address' },
    { name: 'promptHash', type: 'bytes32' },
    { name: 'score', type: 'uint256' },
    { name: 'verdict', type: 'string' },
    { name: 'bundleHash', type: 'bytes32' },
    { name: 'timestamp', type: 'uint256' }
  ]
};
```

**Signing Process**:
```typescript
async function signBundle(
  bundle: EvidenceBundle,
  verifierWallet: Wallet
): Promise<SignedBundle> {
  // 1. Hash the bundle content
  const bundleHash = hashCanonical(bundle);

  // 2. Create EIP-712 message
  const message = {
    jobId: bundle.task_id,
    verifier: verifierWallet.address,
    promptHash: bundle.prompt_hash,
    score: bundle.final_score_bps,
    verdict: getVerdict(bundle.final_score_bps),
    bundleHash: bundleHash,
    timestamp: Math.floor(new Date(bundle.created_at).getTime() / 1000)
  };

  // 3. Sign with EIP-712
  const signature = await verifierWallet.signTypedData(domain, types, message);

  // 4. Split signature
  const { r, s, v } = ethers.Signature.from(signature);

  return {
    bundle,
    bundleHash,
    signature: {
      r,
      s,
      v
    },
    signer: verifierWallet.address
  };
}
```

**Verification**:
```typescript
function verifyBundleSignature(signed: SignedBundle): boolean {
  const message = {
    jobId: signed.bundle.task_id,
    verifier: signed.signer,
    promptHash: signed.bundle.prompt_hash,
    score: signed.bundle.final_score_bps,
    verdict: getVerdict(signed.bundle.final_score_bps),
    bundleHash: signed.bundleHash,
    timestamp: Math.floor(new Date(signed.bundle.created_at).getTime() / 1000)
  };

  const recoveredAddress = ethers.verifyTypedData(
    domain,
    types,
    message,
    ethers.Signature.from(signed.signature)
  );

  return recoveredAddress.toLowerCase() === signed.signer.toLowerCase();
}
```

**Onchain Anchor**:
```solidity
// Store bundle hash onchain (not full bundle)
function commitEvaluation(bytes32 jobId, bytes32 bundleHash) external {
    commitments[jobId][msg.sender] = bundleHash;
}
```

**Output**:
```typescript
interface SignedBundle {
  bundle: EvidenceBundle;
  bundleHash: string;        // 0x...
  signature: {
    r: string;
    s: string;
    v: number;
  };
  signer: string;            // Verifier address
}
```

---

## Determinism Guarantees

### What Makes This Deterministic?

1. ✅ **No randomness**: All calculations use deterministic algorithms
2. ✅ **Fixed normalization**: Same text → same normalized output
3. ✅ **Reproducible hashing**: Same content → same hash
4. ✅ **Ordered operations**: Pipeline stages execute in fixed order
5. ✅ **Versioned algorithms**: Pipeline version locked in bundle

### Verifying Determinism

**Auditors can reproduce scores by**:
1. Fetching bundle from IPFS (using CID)
2. Re-running normalization on responses
3. Re-computing metrics with same weights
4. Comparing final score

**If scores don't match**:
- Bundle is invalid
- Verifier gets slashed
- Challenger wins dispute

---

## Example: Full Pipeline Execution

**Input**:
```
Prompt: "What is the capital of France?"

Model Responses:
- GPT-4: "The capital of France is **Paris**."
- Claude: "Paris is the capital city of France."
- Gemini: "Paris, located in north-central France, is the capital."
```

**Stage 1: Normalization**
```json
[
  { "normalized": "the capital of france is paris" },
  { "normalized": "paris is the capital city of france" },
  { "normalized": "paris located in north central france is the capital" }
]
```

**Stage 2: Claims**
```json
[
  { "text": "Paris is the capital of France", "type": "factual", "entities": ["Paris", "France"] }
]
```

**Stage 3: Evidence**
```json
[
  {
    "url": "https://en.wikipedia.org/wiki/Paris",
    "snippet": "Paris is the capital and most populous city of France",
    "authority": 1.0,
    "relevance": 0.98
  }
]
```

**Stage 4: Consensus**
```json
{
  "agreementScore": 1.0,
  "consensusCluster": { "members": 3 },
  "outliers": []
}
```

**Stage 5: Verification**
```json
[
  {
    "claim": "Paris is the capital of France",
    "status": "verified",
    "entailmentScore": 0.95
  }
]
```

**Stage 6: Metrics**
```json
{
  "consensusScore": 100,
  "factualityRatio": 100,
  "citationAuthority": 90,
  "stability": 95
}
```

**Stage 7: Final Score**
```json
{
  "score": 9625,
  "verdict": "reliable",
  "confidence": 0.98
}
```

**Stage 8: Signed Bundle**
```json
{
  "signatures": {
    "bundle_sig_eip712": "0x..."
  }
}
```

---

## Performance Considerations

**Pipeline Latency** (per job):
- Stage 1-2 (Normalization + Claims): ~100ms
- Stage 3 (Evidence Retrieval): ~2-5s (network I/O)
- Stage 4-6 (Consensus + Verification + Metrics): ~500ms
- Stage 7-8 (Aggregation + Signing): ~100ms

**Total**: ~3-6 seconds per job

**Optimizations**:
- Cache evidence for common claims
- Parallel model querying
- Pre-computed entity recognition
- Batch scoring for multiple jobs

---

## Conclusion

The MMV scoring pipeline is:
- ✅ **Deterministic**: Same inputs → same outputs
- ✅ **Reproducible**: Auditors can verify scores
- ✅ **Transparent**: All steps documented
- ✅ **Tamper-proof**: Cryptographically signed
- ✅ **Efficient**: ~3-6s total latency

This ensures **economic accountability**: verifiers who produce incorrect scores can be proven wrong and slashed.
