import { Quantifier } from "./estimate-quantifier";
export type OvergeneralizationAssessment = {
  detected: boolean;
  severity: "none" | "low" | "medium" | "high";
  claimStrength: Quantifier | "generic" | "unknown";
  evidenceSupportedStrength: Quantifier | "unknown";
  reason: string;
  suggestedRewrite?: string;
};
function evidenceStrength(relations: unknown[] = []): Quantifier | "unknown" {
  const joined = JSON.stringify(relations).toLowerCase();
  if (!relations.length) return "unknown";
  if (/\b(all|universal|complete|every)\b/.test(joined)) return "all";
  if (/\b(most|majority)\b/.test(joined)) return "most";
  return "some";
}
export function assessOvergeneralization(
  claim: string,
  inferred: Quantifier | null,
  relations?: unknown[],
): OvergeneralizationAssessment {
  const strength: Quantifier | "generic" | "unknown" = /^all\b/i.test(claim)
    ? "all"
    : /^most\b/i.test(claim)
      ? "most"
      : /^some\b/i.test(claim)
        ? "some"
        : /^[A-Z][\w -]+s\b/.test(claim)
          ? "generic"
          : "unknown";
  const evidence = evidenceStrength(relations);
  const broad =
    strength === "all" || (strength === "generic" && inferred === "all");
  const mismatch = broad && (evidence === "some" || evidence === "unknown");
  return {
    detected: mismatch,
    severity: mismatch ? (evidence === "some" ? "high" : "medium") : "none",
    claimStrength: strength,
    evidenceSupportedStrength: evidence,
    reason: mismatch
      ? `The ${strength} wording is broader than ${evidence === "unknown" ? "the available evidence description" : `${evidence}-strength evidence`}.`
      : "No strength mismatch was identified from the available evidence relations.",
    suggestedRewrite:
      mismatch && evidence === "some"
        ? `Some ${claim.replace(/^(all|most|some)\s+/i, "").replace(/\.$/, "")} in the reviewed examples.`
        : undefined,
  };
}
