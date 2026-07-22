import { assessGenericity } from "..";
import {
  DeterministicMockQuantifierScorer,
  QuantifierScorer,
} from "../estimate-quantifier";

describe("genericity assessment", () => {
  const scorer = new DeterministicMockQuantifierScorer();
  it.each([
    "Ravens are black.",
    "Mosquitoes carry malaria.",
    "Copper conducts electricity.",
  ])("detects generic %s", async (claim) =>
    expect((await assessGenericity({ claim, scorer })).isGeneric).toBe(true),
  );
  it.each([
    "Some mosquitoes carry malaria.",
    "The mosquitoes entered the room yesterday.",
    "She said, 'Lawyers are dishonest,' but rejected that claim.",
    "If lawyers were dishonest, the policy would fail.",
  ])("does not treat %s as asserted generic", async (claim) =>
    expect((await assessGenericity({ claim, scorer })).isGeneric).toBe(false),
  );
  it("flags unsupported universal evidence", async () => {
    const result = await assessGenericity({
      claim: "All employees committed fraud.",
      evidenceRelations: [{ example: "one employee" }],
      scorer,
    });
    expect(result.overgeneralization.detected).toBe(true);
    expect(result.overgeneralization.evidenceSupportedStrength).toBe("some");
  });
  it("reports context-sensitive scoring when a scorer changes its answer", async () => {
    const contextScorer: QuantifierScorer = {
      method: "mock",
      async score(_variants, context) {
        return context
          ? { all: 0.9, most: 0.2, some: 0.1 }
          : { all: 0.1, most: 0.2, some: 0.9 };
      },
    };
    const result = await assessGenericity({
      claim: "Ravens are black.",
      context: "In this field guide, every raven observed was black.",
      scorer: contextScorer,
    });
    expect(result.contextSensitivity).toBeGreaterThanOrEqual(0.5);
    expect(result.warnings).toContain("Context-sensitive generic");
  });
  it("warns about explicit negative social-group generic", async () => {
    const result = await assessGenericity({
      claim: "Lawyers are dishonest.",
      evidenceRelations: [{ examples: 1 }],
      scorer,
    });
    expect(result.stereotypeRisk.risk).not.toBe("none");
  });
});
