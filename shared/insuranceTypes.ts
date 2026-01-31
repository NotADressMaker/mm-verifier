export enum PolicyType {
  HUMAN_CREATED = 'HUMAN_CREATED',
  AI_VERIFIED = 'AI_VERIFIED',
  HYBRID_DISCLOSURE = 'HYBRID_DISCLOSURE',
}

export enum ClaimReason {
  AI_DETECTED_WHEN_HUMAN_CLAIMED = 'AI_DETECTED_WHEN_HUMAN_CLAIMED',
  FACTUAL_ERROR_IN_VERIFIED_AI = 'FACTUAL_ERROR_IN_VERIFIED_AI',
  MISSING_CITATIONS = 'MISSING_CITATIONS',
  CONTRADICTION_WITH_SOURCES = 'CONTRADICTION_WITH_SOURCES',
  PLAGIARISM = 'PLAGIARISM',
}

export type ClaimVerdict = {
  valid: boolean;
  reason: string;
  confidence?: number;
  evidence?: Record<string, unknown>;
};

export type DetectorResult = {
  detector: string;
  isAI: boolean;
  confidence: number;
};

export type PatternMatch = {
  confidence: number;
  matches: number;
  patterns: number;
};

export type ClaimEvidence = {
  content: string;
  specificClaims?: FactualClaim[];
  detectorResults?: DetectorResult[];
  metadata?: Record<string, unknown>;
};

export type FactualClaim = {
  text: string;
  sources?: SourceReference[];
};

export type SourceReference = {
  url: string;
  title?: string;
};

export type SourceDocument = {
  url: string;
  content: string;
};

export type MMVClaimRecord = {
  text: string;
  sources?: SourceReference[];
};

export type MMVEvidence = {
  claims: MMVClaimRecord[];
};

export type ContentMetadata = {
  wordCount?: number;
  domain?: string;
  citationCount?: number;
  technicalComplexity?: 'low' | 'medium' | 'high';
};

export type CreatorHistory = {
  totalPolicies: number;
  validClaims: number;
};

export type PremiumQuote = {
  premium: number;
  breakdown: {
    baseRate: number;
    policyTypeMultiplier: number;
    durationMultiplier: number;
    contentRiskMultiplier: number;
    historyMultiplier: number;
    marketMultiplier: number;
  };
  effectiveRate: number;
};

export type PolicyRecord = {
  policyId: string;
  policyType: PolicyType;
  verificationHash?: string;
};
