import { QuantifierVariant } from "./quantifier-variants";
export type Quantifier = "all" | "most" | "some";
export type QuantifierAssessment = {
  inferredQuantifier: Quantifier | null;
  scores: Record<Quantifier, number>;
  confidence: number;
  method: "p-acceptability" | "heuristic" | "mock";
  insufficientEvidence: boolean;
  limitations: string[];
};
/** Provider-neutral extension point. A causal LM adapter should return predicate-token surprisal for each variant. */
export interface QuantifierScorer {
  score(
    variants: QuantifierVariant[],
    context?: string,
  ): Promise<Partial<Record<Quantifier, number>>>;
  method?: QuantifierAssessment["method"];
}
const empty = (): Record<Quantifier, number> => ({ all: 0, most: 0, some: 0 });
export class DeterministicMockQuantifierScorer implements QuantifierScorer {
  method = "mock" as const;
  async score(
    variants: QuantifierVariant[],
  ): Promise<Record<Quantifier, number>> {
    const text = variants[0]?.text.toLowerCase() ?? "";
    if (/mosquitoes.*malaria/.test(text))
      return { all: 0.1, most: 0.35, some: 0.95 };
    if (/ravens.*black/.test(text)) return { all: 0.75, most: 0.95, some: 0.4 };
    return { all: 0.45, most: 0.7, some: 0.65 };
  }
}
export async function estimateQuantifier(
  variants: QuantifierVariant[],
  scorer: QuantifierScorer = new DeterministicMockQuantifierScorer(),
  context?: string,
): Promise<QuantifierAssessment> {
  if (!variants.length)
    return {
      inferredQuantifier: null,
      scores: empty(),
      confidence: 0,
      method: scorer.method ?? "heuristic",
      insufficientEvidence: true,
      limitations: ["No generic variant was available to score."],
    };
  const raw = await scorer.score(variants, context);
  const scores = {
    all: raw.all ?? 0,
    most: raw.most ?? 0,
    some: raw.some ?? 0,
  };
  const ranked = (Object.entries(scores) as [Quantifier, number][]).sort(
    (a, b) => b[1] - a[1],
  );
  const confidence = Math.max(
    0,
    Math.min(1, ranked[0][1] - ranked[1][1] + 0.5),
  );
  return {
    inferredQuantifier: ranked[0][1] === 0 ? null : ranked[0][0],
    scores,
    confidence,
    method: scorer.method ?? "p-acceptability",
    insufficientEvidence: ranked[0][1] === 0,
    limitations: [
      "Scores are model-conditioned linguistic compatibility signals, not ground truth.",
      "p-acceptability compares relative predicate-token surprisal; this adapter accepts normalized compatibility scores.",
    ],
  };
}
