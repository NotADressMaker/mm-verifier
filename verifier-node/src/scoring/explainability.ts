/**
 * Explainability Payload for MMV
 *
 * Structured output that makes verification results fully transparent:
 * - Atomic claim extraction
 * - Evidence per claim
 * - Verdict per claim (supported/contradicted/uncertain)
 * - Final score with weighted roll-up
 * - Complete audit trail
 *
 * This makes disputes dramatically easier: contest which claim failed,
 * not the whole answer.
 */

import crypto from 'crypto';

export enum ClaimVerdict {
  SUPPORTED = 'SUPPORTED',         // Evidence confirms claim
  CONTRADICTED = 'CONTRADICTED',   // Evidence refutes claim
  UNCERTAIN = 'UNCERTAIN',         // Insufficient evidence
  UNVERIFIABLE = 'UNVERIFIABLE',   // Cannot be fact-checked
}

export enum EvidenceType {
  CITATION = 'CITATION',           // Direct quote from source
  CONSENSUS = 'CONSENSUS',         // Agreement across models
  SOURCE_CHECK = 'SOURCE_CHECK',   // External source verification
  LOGICAL = 'LOGICAL',             // Logical consistency check
  DOMAIN_KNOWLEDGE = 'DOMAIN_KNOWLEDGE', // Known facts
}

export interface Claim {
  id: string;
  text: string;
  category: 'factual' | 'logical' | 'opinion' | 'calculation';
  importance: number; // 0-1, used for weighted scoring
  verdict: ClaimVerdict;
  confidence: number; // 0-1
  evidence: Evidence[];
  contradictions?: string[];
}

export interface Evidence {
  type: EvidenceType;
  source?: string;
  content: string;
  url?: string;
  timestamp?: number;
  confidence: number;
  metadata?: Record<string, any>;
}

export interface ExplainabilityPayload {
  // Core components
  claims: Claim[];
  overallVerdict: ClaimVerdict;
  finalScore: number; // 0-10000 basis points
  confidence: number; // 0-1

  // Score breakdown
  scoreComponents: {
    citationScore: number;
    consensusScore: number;
    sourceCheckScore: number;
    logicalConsistencyScore: number;
    weights: {
      citation: number;
      consensus: number;
      sourceCheck: number;
      logicalConsistency: number;
    };
  };

  // Evidence summary
  evidenceSummary: {
    totalCitations: number;
    totalSources: number;
    modelsConsulted: string[];
    externalSourcesChecked: number;
  };

  // Audit trail
  auditTrail: {
    verificationId: string;
    timestamp: number;
    verifier: string;
    models: string[];
    duration: number;
    hash: string;
  };

  // Metadata
  metadata: {
    prompt: string;
    response: string;
    category: string;
    version: string;
  };
}

export class ExplainabilityBuilder {
  private claims: Claim[] = [];
  private models: string[] = [];
  private sources: Set<string> = new Set();
  private citations: number = 0;

  constructor(
    private prompt: string,
    private response: string,
    private category: string
  ) {}

  /**
   * Extract atomic claims from response
   */
  extractClaims(text: string): Claim[] {
    // Simplified claim extraction (production would use NLP)
    const sentences = text
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    const claims: Claim[] = [];

    for (const sentence of sentences) {
      const claim: Claim = {
        id: this.generateClaimId(sentence),
        text: sentence,
        category: this.categorize Claim(sentence),
        importance: this.calculateImportance(sentence),
        verdict: ClaimVerdict.UNCERTAIN,
        confidence: 0,
        evidence: [],
      };

      claims.push(claim);
      this.claims.push(claim);
    }

    return claims;
  }

  /**
   * Add evidence to a claim
   */
  addEvidence(
    claimId: string,
    type: EvidenceType,
    content: string,
    options: {
      source?: string;
      url?: string;
      confidence?: number;
      metadata?: Record<string, any>;
    } = {}
  ): void {
    const claim = this.claims.find(c => c.id === claimId);
    if (!claim) return;

    const evidence: Evidence = {
      type,
      content,
      source: options.source,
      url: options.url,
      confidence: options.confidence ?? 0.8,
      timestamp: Date.now(),
      metadata: options.metadata,
    };

    claim.evidence.push(evidence);

    if (type === EvidenceType.CITATION) {
      this.citations++;
    }

    if (options.url) {
      this.sources.add(options.url);
    }
  }

  /**
   * Set verdict for a claim
   */
  setClaimVerdict(
    claimId: string,
    verdict: ClaimVerdict,
    confidence: number
  ): void {
    const claim = this.claims.find(c => c.id === claimId);
    if (claim) {
      claim.verdict = verdict;
      claim.confidence = confidence;
    }
  }

  /**
   * Add model to consulted list
   */
  addModel(model: string): void {
    if (!this.models.includes(model)) {
      this.models.push(model);
    }
  }

  /**
   * Build final explainability payload
   */
  build(
    verificationId: string,
    verifier: string,
    weights: {
      citation: number;
      consensus: number;
      sourceCheck: number;
      logicalConsistency: number;
    }
  ): ExplainabilityPayload {
    // Calculate component scores
    const citationScore = this.calculateCitationScore();
    const consensusScore = this.calculateConsensusScore();
    const sourceCheckScore = this.calculateSourceCheckScore();
    const logicalConsistencyScore = this.calculateLogicalConsistencyScore();

    // Weighted final score
    const finalScore = Math.round(
      citationScore * weights.citation +
      consensusScore * weights.consensus +
      sourceCheckScore * weights.sourceCheck +
      logicalConsistencyScore * weights.logicalConsistency
    );

    // Overall verdict based on claim verdicts
    const overallVerdict = this.calculateOverallVerdict();

    // Calculate confidence
    const confidence = this.calculateOverallConfidence();

    // Generate audit trail hash
    const hash = this.generateAuditHash();

    return {
      claims: this.claims,
      overallVerdict,
      finalScore,
      confidence,

      scoreComponents: {
        citationScore,
        consensusScore,
        sourceCheckScore,
        logicalConsistencyScore,
        weights,
      },

      evidenceSummary: {
        totalCitations: this.citations,
        totalSources: this.sources.size,
        modelsConsulted: this.models,
        externalSourcesChecked: this.sources.size,
      },

      auditTrail: {
        verificationId,
        timestamp: Date.now(),
        verifier,
        models: this.models,
        duration: 0, // Set externally
        hash,
      },

      metadata: {
        prompt: this.prompt,
        response: this.response,
        category: this.category,
        version: '1.0.0',
      },
    };
  }

  /**
   * Calculate citation score
   */
  private calculateCitationScore(): number {
    if (this.claims.length === 0) return 0;

    let score = 0;
    let totalImportance = 0;

    for (const claim of this.claims) {
      const hasCitation = claim.evidence.some(e => e.type === EvidenceType.CITATION);
      if (hasCitation) {
        score += claim.importance * 10000;
      }
      totalImportance += claim.importance;
    }

    return totalImportance > 0 ? score / totalImportance : 0;
  }

  /**
   * Calculate consensus score
   */
  private calculateConsensusScore(): number {
    if (this.claims.length === 0) return 0;

    let score = 0;
    let totalImportance = 0;

    for (const claim of this.claims) {
      const consensusEvidence = claim.evidence.filter(
        e => e.type === EvidenceType.CONSENSUS
      );

      if (consensusEvidence.length > 0) {
        const avgConfidence =
          consensusEvidence.reduce((sum, e) => sum + e.confidence, 0) /
          consensusEvidence.length;

        score += claim.importance * avgConfidence * 10000;
      }

      totalImportance += claim.importance;
    }

    return totalImportance > 0 ? score / totalImportance : 0;
  }

  /**
   * Calculate source check score
   */
  private calculateSourceCheckScore(): number {
    if (this.claims.length === 0) return 0;

    let score = 0;
    let totalImportance = 0;

    for (const claim of this.claims) {
      const hasSourceCheck = claim.evidence.some(
        e => e.type === EvidenceType.SOURCE_CHECK
      );

      if (hasSourceCheck) {
        score += claim.importance * 10000;
      }

      totalImportance += claim.importance;
    }

    return totalImportance > 0 ? score / totalImportance : 0;
  }

  /**
   * Calculate logical consistency score
   */
  private calculateLogicalConsistencyScore(): number {
    if (this.claims.length === 0) return 0;

    let score = 0;
    let totalImportance = 0;

    for (const claim of this.claims) {
      const hasLogicalCheck = claim.evidence.some(
        e => e.type === EvidenceType.LOGICAL
      );

      if (hasLogicalCheck && claim.verdict === ClaimVerdict.SUPPORTED) {
        score += claim.importance * 10000;
      }

      totalImportance += claim.importance;
    }

    return totalImportance > 0 ? score / totalImportance : 0;
  }

  /**
   * Calculate overall verdict
   */
  private calculateOverallVerdict(): ClaimVerdict {
    if (this.claims.length === 0) return ClaimVerdict.UNCERTAIN;

    const verdictCounts = {
      [ClaimVerdict.SUPPORTED]: 0,
      [ClaimVerdict.CONTRADICTED]: 0,
      [ClaimVerdict.UNCERTAIN]: 0,
      [ClaimVerdict.UNVERIFIABLE]: 0,
    };

    let totalImportance = 0;

    for (const claim of this.claims) {
      verdictCounts[claim.verdict] += claim.importance;
      totalImportance += claim.importance;
    }

    // Majority vote weighted by importance
    const maxVerdict = Object.entries(verdictCounts).reduce((max, [verdict, count]) =>
      count > max.count ? { verdict: verdict as ClaimVerdict, count } : max,
      { verdict: ClaimVerdict.UNCERTAIN, count: 0 }
    );

    return maxVerdict.verdict;
  }

  /**
   * Calculate overall confidence
   */
  private calculateOverallConfidence(): number {
    if (this.claims.length === 0) return 0;

    let weightedConfidence = 0;
    let totalImportance = 0;

    for (const claim of this.claims) {
      weightedConfidence += claim.confidence * claim.importance;
      totalImportance += claim.importance;
    }

    return totalImportance > 0 ? weightedConfidence / totalImportance : 0;
  }

  /**
   * Categorize claim type
   */
  private categorizeClaim(sentence: string): Claim['category'] {
    // Simplified categorization (production would use NLP)
    if (sentence.match(/\d+/)) {
      return 'calculation';
    } else if (sentence.match(/\b(believe|think|feel|opinion)\b/i)) {
      return 'opinion';
    } else if (sentence.match(/\b(because|therefore|thus|hence)\b/i)) {
      return 'logical';
    } else {
      return 'factual';
    }
  }

  /**
   * Calculate claim importance
   */
  private calculateImportance(sentence: string): number {
    // Simplified importance scoring (production would use NLP)
    // Longer sentences and those with numbers are more important
    const baseImportance = 0.5;
    const lengthBonus = Math.min(sentence.length / 200, 0.3);
    const numberBonus = sentence.match(/\d+/) ? 0.2 : 0;

    return Math.min(baseImportance + lengthBonus + numberBonus, 1.0);
  }

  /**
   * Generate claim ID
   */
  private generateClaimId(text: string): string {
    return crypto.createHash('md5').update(text).digest('hex').substring(0, 8);
  }

  /**
   * Generate audit hash
   */
  private generateAuditHash(): string {
    const data = {
      claims: this.claims.map(c => ({ id: c.id, verdict: c.verdict })),
      models: this.models,
      timestamp: Date.now(),
    };

    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  }
}

/**
 * Format explainability payload for human reading
 */
export function formatExplainability(payload: ExplainabilityPayload): string {
  let output = '';

  output += '='.repeat(80) + '\n';
  output += 'VERIFICATION EXPLAINABILITY REPORT\n';
  output += '='.repeat(80) + '\n\n';

  output += `Overall Verdict: ${payload.overallVerdict}\n`;
  output += `Final Score: ${(payload.finalScore / 100).toFixed(1)}/100\n`;
  output += `Confidence: ${(payload.confidence * 100).toFixed(1)}%\n\n`;

  output += 'Score Breakdown:\n';
  output += `  Citation:     ${(payload.scoreComponents.citationScore / 100).toFixed(1)}/100 (weight: ${(payload.scoreComponents.weights.citation * 100).toFixed(0)}%)\n`;
  output += `  Consensus:    ${(payload.scoreComponents.consensusScore / 100).toFixed(1)}/100 (weight: ${(payload.scoreComponents.weights.consensus * 100).toFixed(0)}%)\n`;
  output += `  Source Check: ${(payload.scoreComponents.sourceCheckScore / 100).toFixed(1)}/100 (weight: ${(payload.scoreComponents.weights.sourceCheck * 100).toFixed(0)}%)\n`;
  output += `  Logical:      ${(payload.scoreComponents.logicalConsistencyScore / 100).toFixed(1)}/100 (weight: ${(payload.scoreComponents.weights.logicalConsistency * 100).toFixed(0)}%)\n\n`;

  output += `Claims Analyzed: ${payload.claims.length}\n\n`;

  for (const claim of payload.claims) {
    const verdictEmoji = {
      [ClaimVerdict.SUPPORTED]: '✓',
      [ClaimVerdict.CONTRADICTED]: '✗',
      [ClaimVerdict.UNCERTAIN]: '?',
      [ClaimVerdict.UNVERIFIABLE]: '~',
    }[claim.verdict];

    output += `${verdictEmoji} [${claim.verdict}] ${claim.text}\n`;
    output += `  Confidence: ${(claim.confidence * 100).toFixed(1)}%\n`;

    if (claim.evidence.length > 0) {
      output += `  Evidence:\n`;
      for (const evidence of claim.evidence) {
        output += `    - ${evidence.type}: ${evidence.content.substring(0, 80)}...\n`;
        if (evidence.url) {
          output += `      Source: ${evidence.url}\n`;
        }
      }
    }

    output += '\n';
  }

  output += '='.repeat(80) + '\n';

  return output;
}

export default ExplainabilityBuilder;
