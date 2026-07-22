import {
  Quantifier,
  QuantifierAssessment,
  QuantifierScorer,
  estimateQuantifier,
} from "./estimate-quantifier";
import { QuantifierVariant } from "./quantifier-variants";
export type ContextSensitivityAssessment = {
  contextSensitive: boolean;
  score: number;
  quantifierWithoutContext: Quantifier | null;
  quantifierWithContext: Quantifier | null;
  explanation: string;
};
export async function analyzeContextSensitivity(
  variants: QuantifierVariant[],
  scorer: QuantifierScorer,
  context?: string,
): Promise<ContextSensitivityAssessment> {
  const bare = await estimateQuantifier(variants, scorer);
  const contextual = context
    ? await estimateQuantifier(variants, scorer, context)
    : bare;
  const changed =
    Boolean(context) &&
    bare.inferredQuantifier !== contextual.inferredQuantifier;
  const score = changed
    ? Math.max(0.5, Math.abs(bare.confidence - contextual.confidence))
    : Math.abs(bare.confidence - contextual.confidence);
  return {
    contextSensitive: changed || score >= 0.3,
    score,
    quantifierWithoutContext: bare.inferredQuantifier,
    quantifierWithContext: contextual.inferredQuantifier,
    explanation: context
      ? changed
        ? "Context changed the model-conditioned inferred quantifier."
        : "Context did not materially change this scorer’s inferred quantifier."
      : "No surrounding context was available; context sensitivity could not be fully assessed.",
  };
}
