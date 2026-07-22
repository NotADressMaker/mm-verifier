import {
  assessDistillationWatermark,
  DISTILLATION_WATERMARK_POLICIES,
  GreenRedListSchemeConfig,
  WatermarkTokenScorer,
  watermarkVerdictInputs,
} from "..";
import { verdictFromEvidence } from "../../../../../shared/verdicts";
const scheme: GreenRedListSchemeConfig = {
  schemeId: "green_red_list_bias",
  schemeVersion: "1",
  keyVersion: "test-alias",
  tokenizerId: "test-tokenizer",
  vocabularyHash: "vocab",
  normalizationVersion: "n1",
  greenListFraction: 0.5,
  contextWidth: 1,
  seedingAlgorithm: "test",
  eligibilityRule: "non-special",
  specialTokenPolicy: "exclude",
};
const subject = {
  subjectType: "text_sample_set" as const,
  sampleSetId: "set-1",
  collectionMethod: "provided" as const,
  sampleHashes: ["b", "a"],
  limitations: ["Provided samples have limited collection provenance."],
};
function run(
  result: ReturnType<WatermarkTokenScorer["score"]>,
  patch: object = {},
) {
  return assessDistillationWatermark(
    {
      subject,
      samples: [
        { sampleId: "a", sessionId: "s1", text: "sample one" },
        { sampleId: "b", sessionId: "s2", text: "sample two" },
      ],
      scheme,
      detectorVersion: "experimental-v1",
      policy: DISTILLATION_WATERMARK_POLICIES.default,
      collectionIndependence: "demonstrated",
      ...patch,
    },
    { score: () => result },
  );
}
describe("experimental distillation watermark assessment", () => {
  test("returns insufficient sample without detection", () => {
    const a = run({
      totalTokenCount: 20,
      eligibleTokenCount: 20,
      excludedTokenCount: 0,
      observedGreenCount: 20,
    });
    expect(a.status).toBe("insufficient_sample");
    expect(a.detected).toBe(false);
    expect(a.limitations.length).toBeGreaterThan(0);
  });
  test("detects a strong calibrated signal and requires review", () => {
    const calibration = {
      artifactId: "c",
      artifactVersion: "1",
      artifactHash: "hash",
      schemeId: scheme.schemeId,
      schemeVersion: "1",
      detectorVersion: "experimental-v1",
      tokenizerId: scheme.tokenizerId,
      corpusDescription: "synthetic fixture only",
      languageScope: ["en"],
      domainScope: ["test"],
      nullSampleCount: 1,
      positiveSampleCount: 1,
      minimumEligibleTokens: 100,
      evaluatedThresholds: [0.01],
      estimatedFalsePositiveRates: { "0.01": 0.01 },
      createdAt: "2026-01-01",
      limitations: ["synthetic"],
    };
    const a = run(
      {
        totalTokenCount: 200,
        eligibleTokenCount: 200,
        excludedTokenCount: 0,
        observedGreenCount: 150,
      },
      { calibration },
    );
    expect(a.status).toBe("signal_detected");
    expect(a.detected).toBe(true);
    expect(a.humanReviewRequired).toBe(true);
    expect(a.effectSize).toBe(0.25);
    expect(
      verdictFromEvidence(
        watermarkVerdictInputs(a, { independentEvidenceRoutes: 1 }),
      ),
    ).toBe("Mostly supported");
  });
  test("marks borderline and applies correction rather than selecting raw p-value", () => {
    const a = run({
      totalTokenCount: 200,
      eligibleTokenCount: 200,
      excludedTokenCount: 0,
      observedGreenCount: 120,
      hypothesisPValues: [0.02, 0.9],
    });
    expect(a.adjustedPValue).toBe(0.04);
    expect(a.status).toBe("borderline");
    expect(a.humanReviewRequired).toBe(true);
    expect(verdictFromEvidence(watermarkVerdictInputs(a))).toBe(
      "Mixed evidence",
    );
  });
  test("returns no signal for adequate null-like count", () => {
    const a = run({
      totalTokenCount: 200,
      eligibleTokenCount: 200,
      excludedTokenCount: 0,
      observedGreenCount: 100,
    });
    expect(a.status).toBe("signal_not_detected");
    expect(a.pValue).toBeGreaterThanOrEqual(0);
    expect(a.pValue).toBeLessThanOrEqual(1);
  });
  test("rejects incompatible tokenizer without a p-value", () => {
    const a = run({
      totalTokenCount: 200,
      eligibleTokenCount: 200,
      excludedTokenCount: 0,
      observedGreenCount: 150,
      compatibility: { tokenizerId: "other" },
    });
    expect(a.status).toBe("incompatible_configuration");
    expect(a.pValue).toBeNull();
    expect(a.humanReviewRequired).toBe(true);
    expect(verdictFromEvidence(watermarkVerdictInputs(a))).toBe(
      "Unable to verify",
    );
  });
  test("deduplicates texts and session identities", () => {
    const a = assessDistillationWatermark(
      {
        subject,
        samples: [
          { sampleId: "a", sessionId: "same", text: "same" },
          { sampleId: "b", sessionId: "same", text: "same" },
        ],
        scheme,
        detectorVersion: "experimental-v1",
        policy: DISTILLATION_WATERMARK_POLICIES.default,
      },
      {
        score: () => ({
          totalTokenCount: 100,
          eligibleTokenCount: 100,
          excludedTokenCount: 0,
          observedGreenCount: 50,
        }),
      },
    );
    expect(a.sampleCount).toBe(1);
    expect(a.independentSessionCount).toBe(1);
    expect(a.independenceAssessment.duplicateSampleCount).toBe(1);
  });
  test("fails non-finite scorer outputs without secret disclosure", () =>
    expect(() =>
      run({
        totalTokenCount: Infinity,
        eligibleTokenCount: 1,
        excludedTokenCount: 0,
        observedGreenCount: 1,
      }),
    ).toThrow("Invalid non-secret watermark scorer numeric output"));
});
