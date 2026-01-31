import {
  ContentMetadata,
  CreatorHistory,
  PolicyType,
  PremiumQuote,
} from '../../../shared/insuranceTypes';

type PremiumParams = {
  contentHash: string;
  policyType: PolicyType;
  coverageAmount: number;
  duration: number;
  contentMetadata?: ContentMetadata;
  creator: string;
};

type MarketStats = {
  insurancePool: number;
  totalCoverage: number;
};

type PremiumDependencies = {
  getCreatorHistory: (creator: string) => Promise<CreatorHistory>;
  getMarketStats: () => Promise<MarketStats>;
  analyzeContentRisk?: (metadata: ContentMetadata) => Promise<number>;
};

export class PremiumCalculator {
  private readonly dependencies: PremiumDependencies;

  constructor(dependencies: PremiumDependencies) {
    this.dependencies = dependencies;
  }

  async calculatePremium(params: PremiumParams): Promise<PremiumQuote> {
    const baseRate = params.coverageAmount * 0.1;

    const policyRisk = this.getPolicyTypeRisk(params.policyType);
    const durationRisk = this.getDurationRisk(params.duration);
    const contentRisk = await this.getContentRisk(params.contentMetadata);

    const creatorHistory = await this.dependencies.getCreatorHistory(params.creator);
    const historyRisk = this.getHistoryRisk(creatorHistory);

    const marketRisk = await this.getMarketRisk();

    const premium = Math.round(baseRate * policyRisk * durationRisk * contentRisk * historyRisk * marketRisk);

    return {
      premium,
      breakdown: {
        baseRate,
        policyTypeMultiplier: policyRisk,
        durationMultiplier: durationRisk,
        contentRiskMultiplier: contentRisk,
        historyMultiplier: historyRisk,
        marketMultiplier: marketRisk,
      },
      effectiveRate: premium / params.coverageAmount,
    };
  }

  getPolicyTypeRisk(policyType: PolicyType): number {
    switch (policyType) {
      case PolicyType.HUMAN_CREATED:
        return 1.5;
      case PolicyType.AI_VERIFIED:
        return 1.0;
      case PolicyType.HYBRID_DISCLOSURE:
        return 1.2;
      default:
        return 1.5;
    }
  }

  getDurationRisk(duration: number): number {
    const days = duration / (24 * 60 * 60);
    if (days <= 7) return 1.0;
    if (days <= 30) return 1.2;
    if (days <= 90) return 1.5;
    if (days <= 180) return 2.0;
    return 2.5;
  }

  private async getContentRisk(metadata?: ContentMetadata): Promise<number> {
    if (!metadata) {
      return 1.0;
    }

    if (this.dependencies.analyzeContentRisk) {
      return this.dependencies.analyzeContentRisk(metadata);
    }

    let riskMultiplier = 1.0;
    const highRiskDomains = ['medical', 'legal', 'financial', 'scientific', 'news', 'academic'];

    if (metadata.domain && highRiskDomains.includes(metadata.domain)) {
      riskMultiplier *= 1.3;
    }

    const words = metadata.wordCount || 0;
    if (words > 5000) riskMultiplier *= 1.2;
    if (words > 10000) riskMultiplier *= 1.4;

    const citations = metadata.citationCount || 0;
    if (citations < 3) riskMultiplier *= 1.2;
    if (citations === 0) riskMultiplier *= 1.5;

    if (metadata.technicalComplexity === 'high') {
      riskMultiplier *= 1.2;
    }

    return riskMultiplier;
  }

  getHistoryRisk(history: CreatorHistory): number {
    if (history.totalPolicies === 0) {
      return 1.3;
    }

    const claimRate = history.validClaims / history.totalPolicies;
    if (claimRate === 0) return 0.8;
    if (claimRate < 0.05) return 0.9;
    if (claimRate < 0.1) return 1.0;
    if (claimRate < 0.2) return 1.3;
    return 1.5;
  }

  async getMarketRisk(): Promise<number> {
    const stats = await this.dependencies.getMarketStats();
    const utilizationRate = stats.totalCoverage / stats.insurancePool;

    if (utilizationRate > 0.9) return 1.5;
    if (utilizationRate > 0.7) return 1.3;
    if (utilizationRate > 0.5) return 1.1;
    return 1.0;
  }
}
