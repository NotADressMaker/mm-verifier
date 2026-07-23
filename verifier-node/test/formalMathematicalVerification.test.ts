import { VERIFICATION_CLAIM_TYPES } from "../../shared/types";
import type {
  EducationClaimType,
  EducationOnlyClaimType,
} from "../../shared/education/types";
import { DEFAULT_VERIFICATION_POSSIBILITY_SPACE } from "../../shared/possibilitySpace";
import {
  FORMAL_PROOF_VERIFIER_CAPABILITY,
  createFormalMathematicalReceiptEntry,
  evaluateFormalMathematicalClaim,
  type FormalMathematicalAssessment,
  type FormalMathematicalClaim,
} from "../../shared/formalMathematicalVerification";
import { buildReceipt } from "../../shared/receipt";

const checkedAt = "2026-07-23T00:00:00.000Z";
const barrier = {
  name: "Relativization",
  citation: "Baker, Gill, and Solovay (1975)",
  applies_to: "relativizing proof techniques",
  limitation: "This does not establish the truth or falsity of P ≠ NP.",
};
const claim = (
  content: Partial<FormalMathematicalClaim["content"]> = {},
): FormalMathematicalClaim => ({
  claim_type: "formal_mathematical",
  claim_id: "p-vs-np",
  proposition: "P ≠ NP is true",
  content: { modality: "asserted", ...content },
});
const assessment = (
  overrides: Partial<FormalMathematicalAssessment> = {},
): FormalMathematicalAssessment => ({
  proof_status: "open",
  known_barriers: [barrier],
  accepted_proof_references: [],
  accepted_refutation_references: [],
  proof_checks: [],
  assessed_at: checkedAt,
  human_review_required: false,
  ...overrides,
});
const acceptedProof = {
  citation: "Checked proof",
  publication_status: "formally_published" as const,
  community_status: "accepted" as const,
  proof_artifact: {
    assistant: "lean" as const,
    assistant_version: "4",
    artifact_hash: "proof-a",
    kernel_check_passed: true,
  },
};

describe("formal mathematical verification", () => {
  it("uses one canonical claim-type taxonomy with explicit education-only extensions", () => {
    const formal: EducationClaimType = "formal_mathematical";
    const pedagogical: EducationOnlyClaimType = "procedural";
    expect(VERIFICATION_CLAIM_TYPES).toContain(formal);
    expect(pedagogical).toBe("procedural");
    expect(DEFAULT_VERIFICATION_POSSIBILITY_SPACE.allowed_claim_types).toEqual(
      expect.arrayContaining([...VERIFICATION_CLAIM_TYPES]),
    );
  });

  it("returns Unable to verify for a recognized open problem and preserves barriers in the receipt", () => {
    const result = evaluateFormalMathematicalClaim(claim(), assessment());
    expect(result.verdict).toBe("Unable to verify");
    expect(result.abstention_reason).toBe(
      "No accepted formal proof or refutation exists; this is an open problem.",
    );
    const entry = createFormalMathematicalReceiptEntry(claim(), assessment(), [
      "expert-belief-survey",
    ]);
    const receipt = buildReceipt({
      task_id: "formal-1",
      input_hash: `0x${"a".repeat(64)}`,
      output_hash: `0x${"b".repeat(64)}`,
      score_bps: 0,
      bundle_hash: `0x${"c".repeat(64)}`,
      bundle_uri: "ipfs://bundle",
      llm_provider: "test",
      llm_model: "test",
      formal_mathematical_claims: [entry],
    });
    expect(
      receipt.formal_mathematical_claims?.[0].assessment.known_barriers[0],
    ).toEqual(barrier);
    expect(
      receipt.formal_mathematical_claims?.[0].linked_factual_claim_ids,
    ).toEqual(["expert-belief-survey"]);
  });

  it("does not turn a failed lookup or claimant-supplied proof status into an open or proven assessment", () => {
    expect(
      evaluateFormalMathematicalClaim(
        claim({ claimed_proof_status: "proven" }),
        assessment({ proof_status: "status_unknown" }),
      ).verdict,
    ).toBe("Unable to verify");
    expect(
      evaluateFormalMathematicalClaim(
        claim({ claimed_proof_status: "proven" }),
        assessment({ proof_status: "open" }),
      ).verdict,
    ).toBe("Unable to verify");
  });

  it("requires independent accepted checks rather than peer review, duplicate sources, popularity, or a claimed counterexample", () => {
    const singleCheck = [
      {
        checker_id: "checker-a",
        checker_kind: "proof_assistant_kernel" as const,
        result: "passed" as const,
        checked_at: checkedAt,
      },
    ];
    expect(
      evaluateFormalMathematicalClaim(
        claim(),
        assessment({
          proof_status: "proven",
          accepted_proof_references: [
            { ...acceptedProof, publication_status: "peer_reviewed" },
            { ...acceptedProof, citation: "Repeated account" },
          ],
          proof_checks: singleCheck,
        }),
      ).verdict,
    ).toBe("Mixed evidence");
    expect(
      evaluateFormalMathematicalClaim(
        claim(),
        assessment({
          proof_status: "disproven",
          accepted_refutation_references: [
            { ...acceptedProof, community_status: "claimed" },
          ],
          proof_checks: singleCheck,
        }),
      ).verdict,
    ).toBe("Mixed evidence");
  });

  it("supports a checked conditional derivation without promoting its open assumption", () => {
    const conditional = claim({
      modality: "conditional",
      assumptions: [
        {
          claim_id: "p-vs-np",
          role: "complexity_assumption",
          assessed_status: "open",
        },
      ],
    });
    const result = evaluateFormalMathematicalClaim(
      conditional,
      assessment({
        proof_status: "proven",
        accepted_proof_references: [acceptedProof],
        proof_checks: [
          {
            checker_id: "kernel-a",
            checker_kind: "proof_assistant_kernel",
            result: "passed",
            checked_at: checkedAt,
          },
          {
            checker_id: "review-b",
            checker_kind: "independent_formalization",
            result: "passed",
            checked_at: checkedAt,
          },
        ],
      }),
    );
    expect(result.verdict).toBe("Supported");
    expect(result.conditional_notice).toMatch(
      /conditional on the listed unresolved assumption/i,
    );
    expect(evaluateFormalMathematicalClaim(claim(), assessment()).verdict).toBe(
      "Unable to verify",
    );
  });

  it("downgrades independence without a named formal system and rejects generic verifier capability", () => {
    const result = evaluateFormalMathematicalClaim(
      claim(),
      assessment({ proof_status: "independent" }),
    );
    expect(result.assessment.proof_status).toBe("status_unknown");
    expect(result.verdict).toBe("Unable to verify");
    expect(() =>
      evaluateFormalMathematicalClaim(claim(), assessment(), {
        ...FORMAL_PROOF_VERIFIER_CAPABILITY,
        allowed_claim_types: ["factual"] as never,
      }),
    ).toThrow("limited to formal_mathematical");
  });

  it("requires every barrier to state its truth-value limitation", () => {
    expect(() =>
      evaluateFormalMathematicalClaim(
        claim(),
        assessment({
          known_barriers: [
            { ...barrier, limitation: "It constrains a technique family." },
          ],
        }),
      ),
    ).toThrow("does not establish truth or falsity");
  });
});
