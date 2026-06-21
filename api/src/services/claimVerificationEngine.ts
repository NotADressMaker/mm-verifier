import {
  ClaimEvidence,
  ClaimVerdict,
  DetectorResult,
  FactualClaim,
  MMVEvidence,
  PatternMatch,
  PolicyRecord,
  PolicyType,
  SourceDocument,
} from '../../../shared/insuranceTypes';

type ClaimVerificationDependencies = {
  getPolicy: (policyId: string) => Promise<PolicyRecord>;
  runDetector: (detector: string, content: string) => Promise<DetectorResult>;
  checkAIPatterns: (content: string) => Promise<PatternMatch>;
  requestHumanAudit: (claimId: string, evidence: ClaimEvidence) => Promise<ClaimVerdict>;
  fetchMMVEvidence: (verificationHash: string) => Promise<MMVEvidence>;
  fetchSource: (url: string) => Promise<SourceDocument>;
  sourceSupportsClaimLLM: (sourceContent: string, claim: string) => Promise<boolean>;
  sourceContradictsClaimLLM: (sourceContent: string, claim: string) => Promise<boolean>;
};

export class ClaimVerificationEngine {
  private readonly dependencies: ClaimVerificationDependencies;
  private readonly detectors: string[];

  constructor(dependencies: ClaimVerificationDependencies, detectors?: string[]) {
    this.dependencies = dependencies;
    this.detectors = detectors ?? ['gptzero', 'originality.ai', 'copyleaks', 'writer.com'];
  }

  async verifyAIDetectionClaim(
    claimId: string,
    policyId: string,
    evidence: ClaimEvidence
  ): Promise<ClaimVerdict> {
    const policy = await this.dependencies.getPolicy(policyId);
    if (policy.policyType !== PolicyType.HUMAN_CREATED) {
      return { valid: false, reason: 'Policy does not claim human creation' };
    }

    const results = await Promise.all(
      this.detectors.map((detector) => this.dependencies.runDetector(detector, evidence.content))
    );

    const aiDetected = results.filter((result) => result.isAI).length;
    const consensusThreshold = this.detectors.length * 0.75;

    if (aiDetected < consensusThreshold) {
      return {
        valid: false,
        reason: `Only ${aiDetected}/${this.detectors.length} detectors found AI`,
        confidence: aiDetected / this.detectors.length,
      };
    }

    const patternMatch = await this.dependencies.checkAIPatterns(evidence.content);
    if (patternMatch.confidence < 0.9) {
      return this.dependencies.requestHumanAudit(claimId, evidence);
    }

    return {
      valid: true,
      reason: `AI detected by ${aiDetected}/${this.detectors.length} detectors`,
      confidence: aiDetected / this.detectors.length,
      evidence: {
        detectorResults: results,
        patternAnalysis: patternMatch,
      },
    };
  }

  async verifyFactualErrorClaim(
    policyId: string,
    evidence: ClaimEvidence
  ): Promise<ClaimVerdict> {
    const policy = await this.dependencies.getPolicy(policyId);
    if (policy.policyType !== PolicyType.AI_VERIFIED) {
      return { valid: false, reason: 'Policy does not claim AI verification' };
    }

    if (!policy.verificationHash) {
      return { valid: false, reason: 'Missing verification evidence hash' };
    }

    const mamvEvidence = await this.dependencies.fetchMMVEvidence(policy.verificationHash);
    if (!evidence.specificClaims || evidence.specificClaims.length === 0) {
      return { valid: false, reason: 'No specific factual errors provided' };
    }

    const errorVerifications = await Promise.all(
      evidence.specificClaims.map((claim) => this.verifyFactualClaim(claim, mamvEvidence))
    );

    const confirmedErrors = errorVerifications.filter((verification) => verification.isError);
    const totalClaims = mamvEvidence.claims.length;
    const errorRate = totalClaims === 0 ? 0 : confirmedErrors.length / totalClaims;

    if (errorRate <= 0.1) {
      return {
        valid: false,
        reason: `Error rate ${(errorRate * 100).toFixed(1)}% below 10% threshold`,
        confidence: 1 - errorRate,
      };
    }

    return {
      valid: true,
      reason: `${confirmedErrors.length}/${totalClaims} claims contain errors (${(
        errorRate * 100
      ).toFixed(1)}%)`,
      confidence: errorRate,
      evidence: {
        errors: confirmedErrors,
        totalClaims,
        errorRate,
      },
    };
  }

  async verifyFactualClaim(
    claim: FactualClaim,
    mamvEvidence: MMVEvidence
  ): Promise<{ isError: boolean; explanation: string }> {
    const claimRecord = mamvEvidence.claims.find((record) => record.text === claim.text);
    const claimSources = claimRecord?.sources ?? [];

    if (claimSources.length === 0) {
      return { isError: true, explanation: 'Claim lacks citations' };
    }

    const currentSources = await Promise.all(
      claimSources.map((source) => this.dependencies.fetchSource(source.url))
    );

    const supportingCount = (
      await Promise.all(
        currentSources.map((source) =>
          this.dependencies.sourceSupportsClaimLLM(source.content, claim.text)
        )
      )
    ).filter(Boolean).length;

    if (supportingCount === 0) {
      return { isError: true, explanation: 'No sources currently support this claim' };
    }

    const contradictingCount = (
      await Promise.all(
        currentSources.map((source) =>
          this.dependencies.sourceContradictsClaimLLM(source.content, claim.text)
        )
      )
    ).filter(Boolean).length;

    if (contradictingCount > supportingCount) {
      return { isError: true, explanation: 'More sources contradict than support' };
    }

    return {
      isError: false,
      explanation: `${supportingCount}/${claimSources.length} sources support claim`,
    };
  }
}
