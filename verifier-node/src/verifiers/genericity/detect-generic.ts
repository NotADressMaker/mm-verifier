export type GenericDetection = {
  isGeneric: boolean;
  confidence: number;
  subject?: string;
  predicate?: string;
  reason: string;
  limitations: string[];
};

const NON_ASSERTIVE = /\b(if|unless|suppose|imagine|would|could|might)\b/i;
const REPORTING_REJECTION =
  /\b(said|claimed|wrote|quoted|reported)\b[\s\S]*[“"'][\s\S]+[”"'][\s\S]*\b(reject(?:ed|s)?|deny|denied|disagree(?:d)?|false)\b/i;
const EXPLICIT = /^(?:all|most|some|many|few|three|\d+)\b/i;

/** Cautious surface detector; it deliberately does not decide whether a generic is true. */
export function detectGeneric(claim: string): GenericDetection {
  const text = claim.trim();
  if (!text)
    return {
      isGeneric: false,
      confidence: 0,
      reason: "Empty claim.",
      limitations: ["Surface heuristics cannot parse an empty claim."],
    };
  if (
    REPORTING_REJECTION.test(text) ||
    (/[“"][\s\S]+[”"]/.test(text) && /\b(said|claimed|quoted)\b/i.test(text))
  )
    return {
      isGeneric: false,
      confidence: 0.9,
      reason: "The apparent claim is quoted or reported rather than asserted.",
      limitations: ["Quotation attribution is heuristic."],
    };
  if (NON_ASSERTIVE.test(text))
    return {
      isGeneric: false,
      confidence: 0.85,
      reason:
        "The statement is hypothetical or modal rather than asserted as fact.",
      limitations: ["Modal language can be assertive in some contexts."],
    };
  if (/^the\s+/i.test(text) || EXPLICIT.test(text))
    return {
      isGeneric: false,
      confidence: 0.92,
      reason:
        "A determiner, number, or explicit quantifier marks a non-bare-plural statement.",
      limitations: [
        "Some explicitly quantified statements still make broad claims.",
      ],
    };
  const match = text.match(
    /^([A-Z][A-Za-z-]*(?:\s+[A-Za-z-]+){0,3}s)\s+(.+?)[.!?]?$/,
  );
  if (!match)
    return {
      isGeneric: false,
      confidence: 0.45,
      reason: "No likely bare-plural subject was found.",
      limitations: [
        "English morphology and sentence structure are handled conservatively.",
      ],
    };
  return {
    isGeneric: true,
    confidence: 0.7,
    subject: match[1],
    predicate: match[2],
    reason: "Likely asserted English bare-plural characteristic sentence.",
    limitations: [
      "Detection is a cautious linguistic heuristic, not a semantic parser.",
    ],
  };
}
