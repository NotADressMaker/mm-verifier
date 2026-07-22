import { createHash } from "crypto";
import {
  DISTILLATION_WATERMARK_EXPERIMENTAL,
  DistillationWatermarkAssessment,
  DistillationWatermarkPolicy,
  GreenRedListSchemeConfig,
  MultipleTestingCorrection,
  WatermarkAssessmentSubject,
  WatermarkCalibrationArtifact,
} from "../../../../shared/distillationWatermark";
export * from "../../../../shared/distillationWatermark";

export type WatermarkTextSample = {
  sampleId: string;
  sessionId: string;
  text: string;
  promptHash?: string;
  generatedAt?: string;
  metadata?: Record<string, unknown>;
};
export type WatermarkScoringInput = {
  samples: WatermarkTextSample[];
  scheme: GreenRedListSchemeConfig;
  detectorPolicy: DistillationWatermarkPolicy;
};
export type WatermarkScoringResult = {
  totalTokenCount: number;
  eligibleTokenCount: number;
  excludedTokenCount: number;
  observedGreenCount: number;
  hypothesisPValues?: number[];
  compatibility?: Partial<GreenRedListSchemeConfig>;
  compatibilityFailures?: string[];
};
/** Deliberately has no enforcement callback and makes no network calls. */
export interface WatermarkTokenScorer {
  score(input: WatermarkScoringInput): WatermarkScoringResult;
}
export type DistillationWatermarkInput = {
  subject: WatermarkAssessmentSubject;
  samples: WatermarkTextSample[];
  scheme: GreenRedListSchemeConfig;
  detectorVersion: string;
  policy: DistillationWatermarkPolicy;
  calibrationArtifact?: WatermarkCalibrationArtifact;
  detectorPlanHash?: string;
  collectionIndependence?: "demonstrated" | "partial" | "unknown";
};
const limitations = [
  "Paraphrasing can weaken or remove the statistical signal.",
  "Further fine-tuning can weaken, transform, or remove the signal.",
  "RLHF or other preference optimization can alter the signal.",
  "Quantization and decoding changes may alter detectability.",
  "Tokenizer or vocabulary mismatch can invalidate the test.",
  "A negative result means no signal was detected in this sample under this detector configuration; it does not establish that distillation did not occur.",
  "A positive result reports statistical compatibility with the tested watermark; it does not prove training, copying, intent, actor identity, or authorization status.",
  "Copied public output, retrieval, prompt inclusion, mixed-model routing, post-processing, translation, truncation, code-heavy or non-English text, and domain shift can change interpretation.",
];
const alternatives = [
  "Direct copying of watermarked output.",
  "Retrieval of watermarked public text.",
  "Prompt inclusion of watermarked text.",
  "Output post-processing that preserves token bias.",
  "Shared generation middleware.",
  "Benchmark contamination or evaluation harness reuse.",
  "Text assembled from MAMV-Model outputs.",
  "Synthetic-data ingestion without weight-level distillation.",
];
const finite = (n: number) => Number.isFinite(n);
function normalTail(z: number): number {
  const x = Math.abs(z);
  const t = 1 / (1 + 0.2316419 * x);
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z >= 0 ? Math.max(0, Math.min(1, p)) : Math.max(0, Math.min(1, 1 - p));
}
function adjusted(values: number[], method: MultipleTestingCorrection): number {
  const p = values[0] ?? 1;
  if (method === "none" || values.length < 2) return p;
  if (method === "bonferroni") return Math.min(1, p * values.length);
  const sorted = [...values].sort((a, b) => a - b);
  const rank = sorted.indexOf(p) + 1;
  return Math.min(1, (p * values.length) / rank);
}
function compatible(
  scheme: GreenRedListSchemeConfig,
  observed?: Partial<GreenRedListSchemeConfig>,
): string[] {
  if (!observed) return [];
  const fields: (keyof GreenRedListSchemeConfig)[] = [
    "schemeId",
    "schemeVersion",
    "keyVersion",
    "tokenizerId",
    "tokenizerRevision",
    "vocabularyHash",
    "normalizationVersion",
    "greenListFraction",
    "contextWidth",
    "seedingAlgorithm",
    "eligibilityRule",
    "specialTokenPolicy",
    "decodingConstraints",
  ];
  return fields
    .filter(
      (key) => observed[key] !== undefined && observed[key] !== scheme[key],
    )
    .map((key) => `${String(key)} mismatch`);
}
export function assessDistillationWatermark(
  input: DistillationWatermarkInput,
  scorer: WatermarkTokenScorer,
): DistillationWatermarkAssessment {
  const unique = new Map<string, WatermarkTextSample>();
  input.samples.forEach((s) => {
    const h = createHash("sha256").update(s.text).digest("hex");
    if (!unique.has(h)) unique.set(h, s);
  });
  const samples = [...unique.values()];
  const duplicateSampleCount = input.samples.length - samples.length;
  const sessions = [
    ...new Set(samples.map((s) => s.sessionId).filter(Boolean)),
  ].sort();
  const base = scorer.score({
    samples,
    scheme: input.scheme,
    detectorPolicy: input.policy,
  });
  for (const n of [
    base.totalTokenCount,
    base.eligibleTokenCount,
    base.excludedTokenCount,
    base.observedGreenCount,
  ])
    if (!finite(n) || n < 0)
      throw new Error("Invalid non-secret watermark scorer numeric output");
  if (
    base.totalTokenCount !==
      base.eligibleTokenCount + base.excludedTokenCount ||
    base.observedGreenCount > base.eligibleTokenCount
  )
    throw new Error("Invalid non-secret watermark scorer token counts");
  const failures = [
    ...(base.compatibilityFailures ?? []),
    ...compatible(input.scheme, base.compatibility),
  ];
  const independence = input.collectionIndependence ?? "unknown";
  const independenceStatus =
    sessions.length < input.policy.minimumIndependentSessions
      ? "correlated"
      : independence;
  const pValues = base.hypothesisPValues ?? [];
  if (pValues.some((p) => !finite(p) || p < 0 || p > 1))
    throw new Error("Invalid non-secret watermark scorer p-value");
  const tested =
    base.eligibleTokenCount >= input.policy.minimumEligibleTokens &&
    !failures.length;
  const p =
    pValues[0] ??
    (tested
      ? normalTail(
          (base.observedGreenCount -
            base.eligibleTokenCount * input.scheme.greenListFraction) /
            Math.sqrt(
              base.eligibleTokenCount *
                input.scheme.greenListFraction *
                (1 - input.scheme.greenListFraction),
            ),
        )
      : null);
  const adj =
    p === null
      ? null
      : adjusted(
          pValues.length ? pValues : [p],
          input.policy.multipleTestingCorrection,
        );
  const effect = tested
    ? base.observedGreenCount / base.eligibleTokenCount -
      input.scheme.greenListFraction
    : null;
  const calibration = input.calibrationArtifact;
  const calibrationMatches =
    calibration &&
    calibration.schemeId === input.scheme.schemeId &&
    calibration.schemeVersion === input.scheme.schemeVersion &&
    calibration.detectorVersion === input.detectorVersion &&
    calibration.tokenizerId === input.scheme.tokenizerId;
  let status: DistillationWatermarkAssessment["status"] = failures.length
    ? "incompatible_configuration"
    : !tested
      ? "insufficient_sample"
      : adj! <= input.policy.detectionPValueThreshold &&
          (!input.policy.minimumEffectSize ||
            effect! >= input.policy.minimumEffectSize) &&
          (!input.policy.requireKnownCalibrationArtifact ||
            !!calibrationMatches) &&
          (!input.policy.requireDemonstratedSessionIndependence ||
            independenceStatus === "demonstrated")
        ? "signal_detected"
        : adj! <= input.policy.borderlinePValueThreshold
          ? "borderline"
          : "signal_not_detected";
  const warnings = [
    ...failures,
    ...(calibrationMatches
      ? []
      : [
          "No valid real-world calibration artifact governs this experimental detector.",
        ]),
    ...(pValues.length > 1
      ? [
          "Multiple testing correction applied; no favorable hypothesis was silently selected.",
        ]
      : []),
  ];
  if (
    input.policy.requireKnownCalibrationArtifact &&
    !calibrationMatches &&
    status === "signal_detected"
  )
    status = "borderline";
  const review =
    status === "borderline" ||
    status === "signal_detected" ||
    status === "incompatible_configuration" ||
    independenceStatus !== "demonstrated";
  const reasons = [
    ...(status === "signal_detected" ? ["WATERMARK_SIGNAL_DETECTED"] : []),
    ...(status === "borderline" ? ["WATERMARK_SIGNAL_BORDERLINE"] : []),
    ...(independenceStatus !== "demonstrated"
      ? ["COLLECTION_INDEPENDENCE_UNCERTAIN"]
      : []),
    ...(!calibrationMatches ? ["CALIBRATION_LIMITED"] : []),
    ...(failures.some((f) => f.includes("tokenizer"))
      ? ["TOKENIZER_COMPATIBILITY_UNCERTAIN"]
      : []),
    ...(pValues.length > 1 ? ["MULTIPLE_TESTING_APPLIED"] : []),
    "ALTERNATIVE_EXPLANATIONS_UNRESOLVED",
  ];
  const assessmentId = createHash("sha256")
    .update(
      JSON.stringify({
        subject: input.subject.sampleSetId,
        hashes: input.subject.sampleHashes.slice().sort(),
        scheme: input.scheme,
        policy: input.policy.policyId,
      }),
    )
    .digest("hex")
    .slice(0, 32);
  return {
    schemaVersion: "distillation-watermark-assessment/v1",
    assessmentId: `watermark-${assessmentId}`,
    subject: {
      ...input.subject,
      sampleHashes: [...input.subject.sampleHashes].sort(),
      limitations: input.subject.limitations.length
        ? input.subject.limitations
        : ["Collection context is limited."],
    },
    status,
    detected: status === "signal_detected",
    method: "green_red_list_bias",
    schemeId: input.scheme.schemeId,
    schemeVersion: input.scheme.schemeVersion,
    detectorVersion: input.detectorVersion,
    keyVersion: input.scheme.keyVersion,
    tokenizerId: input.scheme.tokenizerId,
    tokenizerRevision: input.scheme.tokenizerRevision,
    vocabularyHash: input.scheme.vocabularyHash,
    normalizationVersion: input.scheme.normalizationVersion,
    sampleCount: samples.length,
    independentSessionCount: sessions.length,
    totalTokenCount: base.totalTokenCount,
    eligibleTokenCount: base.eligibleTokenCount,
    excludedTokenCount: base.excludedTokenCount,
    observedGreenCount: base.observedGreenCount,
    expectedGreenRate: input.scheme.greenListFraction,
    observedGreenRate: base.eligibleTokenCount
      ? base.observedGreenCount / base.eligibleTokenCount
      : 0,
    zScore: tested
      ? (base.observedGreenCount -
          base.eligibleTokenCount * input.scheme.greenListFraction) /
        Math.sqrt(
          base.eligibleTokenCount *
            input.scheme.greenListFraction *
            (1 - input.scheme.greenListFraction),
        )
      : null,
    pValue: p,
    adjustedPValue: adj,
    effectSize: effect,
    testDirection: "one_sided",
    nullHypothesis:
      "Eligible tokens follow the declared green-list rate under this configuration.",
    alternativeHypothesis:
      "Eligible tokens have a greater green-token rate than the declared null rate.",
    minimumEligibleTokens: input.policy.minimumEligibleTokens,
    detectionThreshold: input.policy.detectionPValueThreshold,
    borderlineThreshold: input.policy.borderlinePValueThreshold,
    calibrationArtifactId: calibrationMatches
      ? calibration!.artifactId
      : "unavailable",
    calibrationArtifactHash: calibrationMatches
      ? calibration!.artifactHash
      : "unavailable",
    falsePositiveBaseRate: calibrationMatches
      ? (calibration!.estimatedFalsePositiveRates[
          String(input.policy.detectionPValueThreshold)
        ] ?? null)
      : null,
    falsePositiveBaseRateContext: calibrationMatches
      ? calibration!.corpusDescription
      : null,
    multipleTestingCorrection: input.policy.multipleTestingCorrection,
    hypothesisCount: Math.max(1, pValues.length),
    detectorPlanHash: input.detectorPlanHash,
    independenceAssessment: {
      status: independenceStatus,
      sessionIds: sessions,
      duplicateSampleCount,
      overlapWarnings: duplicateSampleCount
        ? ["Duplicate text hashes were counted once."]
        : [],
      limitations: [
        "Sessions describe collection independence, not independent detector methods.",
      ],
    },
    alternativeExplanations: alternatives,
    warnings,
    limitations: [
      ...limitations,
      ...(DISTILLATION_WATERMARK_EXPERIMENTAL
        ? [
            "Experimental capability only: a compatible MAMV-Model emitter and real-world calibration are not yet implemented.",
          ]
        : []),
    ],
    humanReviewRequired: review,
    humanReviewReasonCodes: reasons,
  };
}
