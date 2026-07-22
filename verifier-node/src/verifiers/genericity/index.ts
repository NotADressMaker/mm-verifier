import { detectGeneric } from "./detect-generic";
import { generateQuantifierVariants } from "./quantifier-variants";
import {
  DeterministicMockQuantifierScorer,
  QuantifierScorer,
  estimateQuantifier,
} from "./estimate-quantifier";
import { analyzeContextSensitivity } from "./context-analysis";
import {
  assessOvergeneralization,
  OvergeneralizationAssessment,
} from "./overgeneralization";
import {
  assessStereotypeRisk,
  StereotypeRiskAssessment,
} from "./stereotype-risk";
export type {
  Quantifier,
  QuantifierAssessment,
  QuantifierScorer,
} from "./estimate-quantifier";
export type { OvergeneralizationAssessment } from "./overgeneralization";
export type { StereotypeRiskAssessment } from "./stereotype-risk";
export type GenericityAssessment = {
  isGeneric: boolean;
  detectionConfidence: number;
  inferredQuantifier: "all" | "most" | "some" | null;
  quantifierScores: { all: number; most: number; some: number };
  contextSensitivity: number;
  weakGeneralization: boolean;
  overgeneralization: OvergeneralizationAssessment;
  stereotypeRisk: StereotypeRiskAssessment;
  warnings: string[];
  limitations: string[];
  suggestedRewrite?: string;
};
export async function assessGenericity(input: {
  claim: string;
  context?: string;
  evidenceRelations?: unknown[];
  scorer?: QuantifierScorer;
}): Promise<GenericityAssessment> {
  const detection = detectGeneric(input.claim);
  const explicit = /^(all|most|some)\b/i.test(input.claim);
  const variants = detection.isGeneric
    ? generateQuantifierVariants(input.claim)
    : [];
  const scorer = input.scorer ?? new DeterministicMockQuantifierScorer();
  const quantifier = await estimateQuantifier(variants, scorer, input.context);
  const context = await analyzeContextSensitivity(
    variants,
    scorer,
    input.context,
  );
  const overgeneralization = assessOvergeneralization(
    input.claim,
    quantifier.inferredQuantifier,
    input.evidenceRelations,
  );
  const stereotypeRisk = assessStereotypeRisk(input.claim, overgeneralization);
  const meaningful =
    overgeneralization.detected || stereotypeRisk.risk !== "none";
  const warnings = [
    context.contextSensitive && input.context
      ? "Context-sensitive generic"
      : "",
    overgeneralization.detected
      ? "Evidence may not support universal wording"
      : "",
    stereotypeRisk.risk !== "none"
      ? "Possible social-group overgeneralization"
      : "",
    detection.isGeneric && quantifier.inferredQuantifier === "some"
      ? "Possible weak generalization"
      : "",
  ].filter(Boolean);
  return {
    isGeneric: detection.isGeneric,
    detectionConfidence: detection.confidence,
    inferredQuantifier: quantifier.inferredQuantifier,
    quantifierScores: quantifier.scores,
    contextSensitivity: context.score,
    weakGeneralization:
      detection.isGeneric && quantifier.inferredQuantifier === "some",
    overgeneralization,
    stereotypeRisk,
    warnings,
    limitations: [
      ...detection.limitations,
      ...quantifier.limitations,
      ...(explicit
        ? [
            "Explicit quantifier wording is assessed alongside genericity signals.",
          ]
        : []),
    ],
    suggestedRewrite:
      overgeneralization.suggestedRewrite ??
      stereotypeRisk.suggestedRewrite ??
      (meaningful ? undefined : undefined),
  };
}
