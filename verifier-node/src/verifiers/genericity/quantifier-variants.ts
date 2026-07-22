import { detectGeneric } from "./detect-generic";
export type QuantifierVariant = {
  quantifier: "generic" | "all" | "most" | "some";
  text: string;
};
export function generateQuantifierVariants(claim: string): QuantifierVariant[] {
  const detected = detectGeneric(claim);
  if (!detected.isGeneric || !detected.subject || !detected.predicate)
    return [];
  const subject = detected.subject;
  const predicate = detected.predicate;
  const punctuation = claim.trim().match(/[.!?]$/)?.[0] ?? "";
  return (["generic", "all", "most", "some"] as const).map((quantifier) => ({
    quantifier,
    text: `${quantifier === "generic" ? subject : `${quantifier[0].toUpperCase()}${quantifier.slice(1)} ${subject.toLowerCase()}`} ${predicate.replace(/[.!?]$/, "")}${punctuation}`,
  }));
}
