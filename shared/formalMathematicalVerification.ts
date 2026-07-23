import type { Verdict } from "./verdicts";

/** Submitted content identifies a proposition and its declared assumptions; it cannot set an assessment. */
export type FormalClaimModality =
  "asserted" | "conditional" | "working_assumption" | "counterfactual";
export type FormalProofStatus =
  "open" | "proven" | "disproven" | "independent" | "status_unknown";

export interface FormalSystemReference {
  system_id?: string;
  name: string;
  version?: string;
  axioms_hash?: string;
}
export interface FormalAssumptionReference {
  claim_id: string;
  role:
    | "theorem_hypothesis"
    | "complexity_assumption"
    | "working_assumption"
    | "counterfactual";
  assessed_status: FormalProofStatus | "stipulated";
}
export interface FormalMathematicalClaimContent {
  formalization?: string;
  formal_system?: FormalSystemReference;
  modality: FormalClaimModality;
  assumptions?: FormalAssumptionReference[];
  /** Preserved as an untrusted claimant assertion and intentionally ignored by the evaluator. */
  claimed_proof_status?: FormalProofStatus;
}
export interface FormalMathematicalClaim {
  claim_type: "formal_mathematical";
  claim_id: string;
  proposition: string;
  content: FormalMathematicalClaimContent;
}

export interface FormalBarrierReference {
  name: string;
  citation: string;
  applies_to: string;
  limitation: string;
}
export interface FormalProofArtifact {
  assistant: "lean" | "coq" | "isabelle" | "agda" | "other";
  assistant_version: string;
  artifact_hash: string;
  dependency_manifest_hash?: string;
  kernel_check_passed: boolean;
}
export interface FormalProofReference {
  citation: string;
  venue?: string;
  publication_status:
    "unpublished" | "preprint" | "peer_reviewed" | "formally_published";
  community_status:
    "claimed" | "under_review" | "accepted" | "disputed" | "retracted";
  proof_artifact?: FormalProofArtifact;
}
export interface FormalProofCheck {
  checker_id: string;
  checker_kind:
    | "proof_assistant_kernel"
    | "independent_formalization"
    | "expert_review"
    | "artifact_integrity";
  proof_artifact_hash?: string;
  result: "passed" | "failed" | "inconclusive";
  checked_at: string;
}
export interface FormalMathematicalAssessment {
  proof_status: FormalProofStatus;
  independent_of?: FormalSystemReference;
  consistency_assumptions?: string[];
  known_barriers: FormalBarrierReference[];
  accepted_proof_references: FormalProofReference[];
  accepted_refutation_references: FormalProofReference[];
  proof_checks: FormalProofCheck[];
  assessed_at: string;
  human_review_required: boolean;
}

export interface FormalProofVerifierCapability {
  verifier_id: string;
  allowed_claim_types: readonly ["formal_mathematical"];
  allowed_methods: readonly (
    | "formal_proof_checking"
    | "proof_status_registry_lookup"
    | "formal_literature_review"
    | "artifact_integrity_check"
  )[];
  prohibited_assertions: readonly string[];
}

export const FORMAL_PROOF_VERIFIER_CAPABILITY: FormalProofVerifierCapability = {
  verifier_id: "formal-proof-verifier-v1",
  allowed_claim_types: ["formal_mathematical"],
  allowed_methods: [
    "proof_status_registry_lookup",
    "formal_literature_review",
    "artifact_integrity_check",
  ],
  prohibited_assertions: [
    "cannot assert truth or falsity without an accepted checked proof or refutation",
    "cannot infer proof from expert consensus or public plausibility",
    "cannot infer truth from absence of known counterexamples",
    "cannot infer openness merely from failure to locate a proof",
    "cannot report independence without naming the relevant formal system",
  ],
};

export interface FormalMathematicalVerdict {
  verdict: Verdict;
  assessment: FormalMathematicalAssessment;
  abstention_reason?: string;
  conditional_notice?: string;
}

const truthLimitation =
  /does not establish (the )?(truth|falsity)|does not prove (p\s*≠\s*np|p\s*=\s*np|either side)/i;
const acceptableCheckKinds = new Set<FormalProofCheck["checker_kind"]>([
  "proof_assistant_kernel",
  "independent_formalization",
  "expert_review",
]);

/** Runtime boundary: generic, lexical, coherence, and consensus verifiers are not formal-proof verifiers. */
export function assertFormalProofVerifierCapability(
  capability: FormalProofVerifierCapability,
): void {
  if (
    capability.allowed_claim_types.length !== 1 ||
    capability.allowed_claim_types[0] !== "formal_mathematical"
  )
    throw new Error(
      "Formal verifier capability must be limited to formal_mathematical claims.",
    );
  if (
    !capability.prohibited_assertions.includes(
      "cannot assert truth or falsity without an accepted checked proof or refutation",
    )
  )
    throw new Error(
      "Formal verifier capability must prohibit unearned truth assertions.",
    );
}

function acceptedChecks(
  assessment: FormalMathematicalAssessment,
): FormalProofCheck[] {
  return assessment.proof_checks.filter(
    (check) =>
      check.result === "passed" && acceptableCheckKinds.has(check.checker_kind),
  );
}

function hasAcceptedCheckedResolution(
  references: FormalProofReference[],
  assessment: FormalMathematicalAssessment,
): boolean {
  if (
    !references.some((reference) => reference.community_status === "accepted")
  )
    return false;
  // Distinct checkers, not repeated publications, supply independent checking routes.
  return (
    new Set(acceptedChecks(assessment).map((check) => check.checker_id)).size >=
    2
  );
}

function validateAssessment(
  assessment: FormalMathematicalAssessment,
): FormalMathematicalAssessment {
  for (const barrier of assessment.known_barriers) {
    if (
      !barrier.name ||
      !barrier.citation ||
      !barrier.applies_to ||
      !truthLimitation.test(barrier.limitation)
    )
      throw new Error(
        "Each formal proof barrier requires a citation, technique scope, and limitation that it does not establish truth or falsity.",
      );
  }
  if (
    assessment.proof_status === "independent" &&
    (!assessment.independent_of?.name ||
      !assessment.consistency_assumptions?.length ||
      (!assessment.accepted_proof_references.length &&
        !acceptedChecks(assessment).length))
  ) {
    return {
      ...assessment,
      proof_status: "status_unknown",
      human_review_required: true,
    };
  }
  return assessment;
}

/**
 * Maps a verifier-supplied assessment to the existing public verdict vocabulary.
 * Claimant-supplied status, popularity, consensus, and citation count are not inputs.
 */
export function evaluateFormalMathematicalClaim(
  claim: FormalMathematicalClaim,
  suppliedAssessment: FormalMathematicalAssessment,
  capability = FORMAL_PROOF_VERIFIER_CAPABILITY,
): FormalMathematicalVerdict {
  assertFormalProofVerifierCapability(capability);
  const assessment = validateAssessment(suppliedAssessment);
  const proofChecked = hasAcceptedCheckedResolution(
    assessment.accepted_proof_references,
    assessment,
  );
  const refutationChecked = hasAcceptedCheckedResolution(
    assessment.accepted_refutation_references,
    assessment,
  );
  const conditionalNotice =
    claim.content.modality === "conditional" &&
    claim.content.assumptions?.some(
      (assumption) => assumption.assessed_status !== "proven",
    )
      ? "This conclusion is supported conditional on the listed unresolved assumption. The assumption itself has not been verified."
      : undefined;

  if (assessment.proof_status === "open" && !proofChecked && !refutationChecked)
    return {
      verdict: "Unable to verify",
      assessment,
      abstention_reason:
        "No accepted formal proof or refutation exists; this is an open problem.",
      conditional_notice: conditionalNotice,
    };
  if (assessment.proof_status === "status_unknown")
    return {
      verdict: "Unable to verify",
      assessment,
      abstention_reason:
        "No authoritative proof-status classification is recorded; failure to locate a proof does not establish that this is open.",
      conditional_notice: conditionalNotice,
    };
  if (assessment.proof_status === "independent")
    return {
      verdict: "Unable to verify",
      assessment,
      abstention_reason:
        "Independence is recorded only relative to the named formal system and remains subject to the declared consistency assumptions.",
      conditional_notice: conditionalNotice,
    };
  if (assessment.proof_status === "proven" && proofChecked)
    return {
      verdict: "Supported",
      assessment,
      conditional_notice: conditionalNotice,
    };
  if (assessment.proof_status === "disproven" && refutationChecked)
    return {
      verdict: "Contradicted",
      assessment,
      conditional_notice: conditionalNotice,
    };
  return {
    verdict: "Mixed evidence",
    assessment: { ...assessment, human_review_required: true },
    abstention_reason:
      "A proof or refutation is claimed but has not met the accepted independent checking requirements.",
    conditional_notice: conditionalNotice,
  };
}

/** Receipt projection keeps the proposition, assessment, and visible dependencies separate. */
export interface FormalMathematicalReceiptEntry extends FormalMathematicalVerdict {
  claim_id: string;
  proposition: string;
  content: FormalMathematicalClaimContent;
  linked_factual_claim_ids?: string[];
}
export function createFormalMathematicalReceiptEntry(
  claim: FormalMathematicalClaim,
  assessment: FormalMathematicalAssessment,
  linked_factual_claim_ids?: string[],
): FormalMathematicalReceiptEntry {
  return {
    claim_id: claim.claim_id,
    proposition: claim.proposition,
    content: claim.content,
    linked_factual_claim_ids,
    ...evaluateFormalMathematicalClaim(claim, assessment),
  };
}
