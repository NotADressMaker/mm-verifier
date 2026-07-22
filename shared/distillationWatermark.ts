import type { VerdictInputs } from "./verdicts";

/** Experimental only: no compatible MAMV-Model emitter or real calibration is bundled. */
export const DISTILLATION_WATERMARK_EXPERIMENTAL = true as const;

export type WatermarkAssessmentSubject = {
  subjectType: "text_sample_set";
  sampleSetId: string;
  modelIdentifier?: string;
  endpointIdentifier?: string;
  collectionMethod: "provided" | "controlled_generation" | "observed_output";
  collectionProtocolId?: string;
  collectionStartedAt?: string;
  collectionCompletedAt?: string;
  promptSetHash?: string;
  sampleHashes: string[];
  limitations: string[];
};
export type MultipleTestingCorrection =
  "none" | "bonferroni" | "holm" | "benjamini_hochberg";
export type DistillationWatermarkPolicy = {
  policyId: string;
  policyVersion: string;
  minimumIndependentSessions: number;
  minimumEligibleTokens: number;
  detectionPValueThreshold: number;
  borderlinePValueThreshold: number;
  minimumEffectSize?: number;
  multipleTestingCorrection: MultipleTestingCorrection;
  requireCompatibleTokenizer: boolean;
  requireKnownCalibrationArtifact: boolean;
  requireDemonstratedSessionIndependence: boolean;
};
export const DISTILLATION_WATERMARK_POLICIES: Record<
  "default" | "legal_cautious",
  DistillationWatermarkPolicy
> = {
  default: {
    policyId: "distillation-watermark-default",
    policyVersion: "1",
    minimumIndependentSessions: 1,
    minimumEligibleTokens: 100,
    detectionPValueThreshold: 0.01,
    borderlinePValueThreshold: 0.05,
    multipleTestingCorrection: "bonferroni",
    requireCompatibleTokenizer: true,
    requireKnownCalibrationArtifact: false,
    requireDemonstratedSessionIndependence: false,
  },
  legal_cautious: {
    policyId: "distillation-watermark-legal-cautious",
    policyVersion: "1",
    minimumIndependentSessions: 3,
    minimumEligibleTokens: 1000,
    detectionPValueThreshold: 0.001,
    borderlinePValueThreshold: 0.01,
    minimumEffectSize: 0.05,
    multipleTestingCorrection: "holm",
    requireCompatibleTokenizer: true,
    requireKnownCalibrationArtifact: true,
    requireDemonstratedSessionIndependence: true,
  },
};
export type GreenRedListSchemeConfig = {
  schemeId: string;
  schemeVersion: string;
  keyVersion: string;
  tokenizerId: string;
  tokenizerRevision?: string;
  vocabularyHash?: string;
  normalizationVersion: string;
  greenListFraction: number;
  contextWidth: number;
  seedingAlgorithm: string;
  eligibilityRule: string;
  specialTokenPolicy: string;
  decodingConstraints?: string;
};
export type WatermarkCalibrationArtifact = {
  artifactId: string;
  artifactVersion: string;
  artifactHash: string;
  schemeId: string;
  schemeVersion: string;
  detectorVersion: string;
  tokenizerId: string;
  tokenizerRevision?: string;
  vocabularyHash?: string;
  corpusDescription: string;
  languageScope: string[];
  domainScope: string[];
  nullSampleCount: number;
  positiveSampleCount: number;
  minimumEligibleTokens: number;
  evaluatedThresholds: number[];
  estimatedFalsePositiveRates: Record<string, number>;
  estimatedFalseNegativeRates?: Record<string, number>;
  createdAt: string;
  limitations: string[];
};
export type DistillationWatermarkAssessment = {
  schemaVersion: "distillation-watermark-assessment/v1";
  assessmentId: string;
  subject: WatermarkAssessmentSubject;
  status:
    | "not_evaluated"
    | "insufficient_sample"
    | "signal_not_detected"
    | "borderline"
    | "signal_detected"
    | "incompatible_configuration"
    | "invalid_sample";
  detected: boolean;
  method: "green_red_list_bias";
  schemeId: string;
  schemeVersion: string;
  detectorVersion: string;
  keyVersion: string;
  tokenizerId: string;
  tokenizerRevision?: string;
  vocabularyHash?: string;
  normalizationVersion: string;
  sampleCount: number;
  independentSessionCount: number;
  totalTokenCount: number;
  eligibleTokenCount: number;
  excludedTokenCount: number;
  observedGreenCount: number;
  expectedGreenRate: number;
  observedGreenRate: number;
  zScore: number | null;
  pValue: number | null;
  adjustedPValue: number | null;
  effectSize: number | null;
  testDirection: "one_sided";
  nullHypothesis: string;
  alternativeHypothesis: string;
  minimumEligibleTokens: number;
  detectionThreshold: number;
  borderlineThreshold: number;
  calibrationArtifactId: string;
  calibrationArtifactHash: string;
  falsePositiveBaseRate: number | null;
  falsePositiveBaseRateContext: string | null;
  multipleTestingCorrection: MultipleTestingCorrection;
  hypothesisCount: number;
  detectorPlanHash?: string;
  independenceAssessment: {
    status:
      "demonstrated" | "partial" | "unknown" | "correlated" | "not_independent";
    sessionIds: string[];
    duplicateSampleCount: number;
    overlapWarnings: string[];
    limitations: string[];
  };
  alternativeExplanations: string[];
  warnings: string[];
  limitations: string[];
  humanReviewRequired: boolean;
  humanReviewReasonCodes: string[];
};
export type WatermarkVerdictContext = {
  assessmentType: "distillation_watermark";
  proposition: "sample_exhibits_tested_watermark_signal";
  assessmentId: string;
};
export type WatermarkCorroborationInput = {
  independentEvidenceRoutes?: number;
  sufficientlyPoweredNegative?: boolean;
};
/** This mapping is scoped only to the stated watermark-signal proposition. Same-detector sessions never add method independence. */
export function watermarkVerdictInputs(
  assessment: DistillationWatermarkAssessment,
  corroboration: WatermarkCorroborationInput = {},
): VerdictInputs {
  const noCoverage =
    assessment.status === "insufficient_sample" ||
    assessment.status === "incompatible_configuration" ||
    assessment.status === "invalid_sample";
  if (noCoverage)
    return {
      evidenceCoverage: 0.49,
      supportedClaimRatio: 0,
      contradictedClaimRatio: 0,
      independentSupportCount: 0,
      hasMaterialContradiction: false,
    };
  if (assessment.status === "borderline")
    return {
      evidenceCoverage: 1,
      supportedClaimRatio: 0.5,
      contradictedClaimRatio: 0.5,
      independentSupportCount: 0,
      hasMaterialContradiction: true,
    };
  if (assessment.status === "signal_detected")
    return {
      evidenceCoverage: 1,
      supportedClaimRatio: 0.8,
      contradictedClaimRatio: 0,
      independentSupportCount: corroboration.independentEvidenceRoutes ?? 0,
      hasMaterialContradiction: false,
    };
  return {
    evidenceCoverage: 1,
    supportedClaimRatio: 0,
    contradictedClaimRatio: corroboration.sufficientlyPoweredNegative ? 0.2 : 0,
    independentSupportCount: 0,
    hasMaterialContradiction: false,
  };
}
