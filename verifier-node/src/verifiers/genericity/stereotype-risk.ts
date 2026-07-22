import { OvergeneralizationAssessment } from "./overgeneralization";
export type StereotypeRiskAssessment = {
  risk: "none" | "low" | "medium" | "high";
  explicitGroupReference: boolean;
  universalizationRisk: boolean;
  reason: string;
  suggestedRewrite?: string;
};
const GROUPS =
  /\b(lawyers|employees|immigrants|women|men|children|politicians|people|[A-Z][a-z]+ people)\b/i;
const NEGATIVE =
  /\b(dishonest|fraud|criminal|lazy|dangerous|corrupt|violent|bad)\b/i;
export function assessStereotypeRisk(
  claim: string,
  overgeneralization: OvergeneralizationAssessment,
): StereotypeRiskAssessment {
  const group = GROUPS.test(claim);
  const broad = /^all\b/i.test(claim) || /^[A-Z][\w -]+s\b/.test(claim);
  const negative = NEGATIVE.test(claim);
  const risk =
    group && broad && negative
      ? overgeneralization.detected
        ? "high"
        : "medium"
      : "none";
  return {
    risk,
    explicitGroupReference: group,
    universalizationRisk: group && broad,
    reason:
      risk === "none"
        ? "No explicit broad negative social-group claim was identified."
        : "Explicit group wording, broad scope, and a negative predicate warrant a cautionary evidence warning.",
    suggestedRewrite:
      risk !== "none" && overgeneralization.evidenceSupportedStrength === "some"
        ? "Some people in the reviewed examples have acted this way."
        : undefined,
  };
}
