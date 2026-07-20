import { AssessmentReceiptForDiff, VerificationFrame, applyVerdictPolicy, createInformationalRelativityReceipt, diffAssessmentReceipts, evaluateEvidence, hashVerificationFrame, VersionedVerdictPolicy, verifyInFrame } from "../src/scoring/informationalRelativity";

const frame: VerificationFrame = {
  id: "frame_456",
  program: { id: "mamv-general-factual", version: 3 },
  interpretation: "interpretation_A",
  possibility_space_hash: "0xpossibility",
  evidence_scope: { sources: ["primary"] },
  policy_hash: "0xpolicy",
  jurisdiction: "US",
  domain: "general",
  assessment_time: "2026-07-20T14:30:00Z",
  method_manifest_hash: "0xmethod",
};

describe("VerificationFrame", () => {
  it("hashes the same frame deterministically", () => {
    expect(hashVerificationFrame(frame)).toBe(hashVerificationFrame({ ...frame, evidence_scope: { sources: ["primary"] } }));
  });

  it.each([
    ["id", { ...frame, id: "frame_457" }],
    ["program", { ...frame, program: { ...frame.program, version: 4 } }],
    ["interpretation", { ...frame, interpretation: "interpretation_B" }],
    ["possibility space", { ...frame, possibility_space_hash: "0xother" }],
    ["evidence scope", { ...frame, evidence_scope: { sources: ["secondary"] } }],
    ["policy", { ...frame, policy_hash: "0xother" }],
    ["jurisdiction", { ...frame, jurisdiction: "CA" }],
    ["domain", { ...frame, domain: "medical" }],
    ["assessment time", { ...frame, assessment_time: "2026-07-21T14:30:00Z" }],
    ["method", { ...frame, method_manifest_hash: "0xother" }],
  ] as Array<[string, VerificationFrame]>)
  ("changes when %s changes", (_field, changedFrame) => {
    expect(hashVerificationFrame(changedFrame)).not.toBe(hashVerificationFrame(frame));
  });
});

describe("informational relativity receipt", () => {
  it("keeps integrity commitments exclusively under integrity", () => {
    const policy: VersionedVerdictPolicy = { id: "general", version: 1, thresholds: { minimum_coverage: 0, minimum_source_independence: 0, maximum_unresolved_ambiguity: 1, mostly_supported_minimum_support: .5, mostly_supported_maximum_contradiction: .5 } };
    const verification = verifyInFrame(frame, { covered_claims: 1, total_claims: 1, supporting_relations: 1, contradicting_relations: 0, source_quality: .9, source_independence: .9, unresolved_ambiguity: 0, process_reliability: .9 }, policy);
    const receipt = createInformationalRelativityReceipt({ claim: { id: "claim-1", canonical_form: { text: "Paris is France's capital." } }, verification, evidence_root: "0xevidence", explanation: "Independent sources support the claim." });
    expect(receipt.integrity).toEqual(expect.objectContaining({ claim_hash: receipt.claim.hash, frame_hash: hashVerificationFrame(frame), evidence_root: "0xevidence", receipt_hash: expect.any(String), signatures: [] }));
    expect(receipt.measurements).not.toHaveProperty("receipt_hash");
    expect(receipt.assessment.verdict).toBe("mostly_supported");
  });
});

describe("receipt frame diffs", () => {
  it("reports material frame changes with normalized attribution", () => {
    const policy: VersionedVerdictPolicy = { id: "general", version: 1, thresholds: { minimum_coverage: 0, minimum_source_independence: 0, maximum_unresolved_ambiguity: 1, mostly_supported_minimum_support: .5, mostly_supported_maximum_contradiction: .5 } };
    const measurements = { coverage: .9, support_ratio: .8, contradiction_ratio: .1, source_quality: .8, source_independence: .8, unresolved_ambiguity: .1, process_reliability: .9 };
    const left: AssessmentReceiptForDiff = { claim: { id: "claim-1" }, verification_frame: frame, measurements, assessment: applyVerdictPolicy(measurements, policy) };
    const right: AssessmentReceiptForDiff = { ...left, verification_frame: { ...frame, interpretation: "interpretation_B", evidence_scope: { sources: ["primary", "secondary"] }, policy_hash: "0xnew-policy" }, measurements: { ...measurements, support_ratio: .7 } };
    const diff = diffAssessmentReceipts(left, right);
    expect(diff.changed_components).toEqual(["interpretation", "evidence", "policy"]);
    expect(diff.assessment_delta.support_ratio).toBeCloseTo(-.1);
    expect(diff.attributions.reduce((sum, item) => sum + item.materiality, 0)).toBeCloseTo(1);
  });
});

describe("versioned verdict policy", () => {
  const measurements = { coverage: .9, support_ratio: .8, contradiction_ratio: .1, source_quality: .8, source_independence: .8, unresolved_ambiguity: .1, process_reliability: .9 };
  const permissive: VersionedVerdictPolicy = { id: "general", version: 1, thresholds: { minimum_coverage: .5, minimum_source_independence: .5, maximum_unresolved_ambiguity: .5, mostly_supported_minimum_support: .75, mostly_supported_maximum_contradiction: .15 } };
  const strict: VersionedVerdictPolicy = { ...permissive, version: 2, thresholds: { ...permissive.thresholds, mostly_supported_minimum_support: .85 } };

  it("reaches different verdicts under different policies without recomputing measurements", () => {
    expect(applyVerdictPolicy(measurements, permissive).verdict).toBe("mostly_supported");
    expect(applyVerdictPolicy(measurements, strict).verdict).toBe("mixed_evidence");
  });

  it("returns abstention as a first-class verification result", () => {
    const result = verifyInFrame(frame, { covered_claims: 0, total_claims: 1, supporting_relations: 0, contradicting_relations: 0, source_quality: .8, source_independence: .8, unresolved_ambiguity: 0, process_reliability: .9 }, permissive);
    expect(result.assessment).toMatchObject({ verdict: "unable_to_verify", abstention: { reason: "insufficient_coverage" } });
  });
});

describe("evidence evaluation", () => {
  it("returns only the multidimensional measurement vector", () => {
    expect(evaluateEvidence(frame, {
      covered_claims: 9, total_claims: 10, supporting_relations: 8,
      contradicting_relations: 2, source_quality: .82, source_independence: .75,
      unresolved_ambiguity: .12, process_reliability: .96,
    })).toEqual({
      coverage: .9, support_ratio: .8, contradiction_ratio: .2, source_quality: .82,
      source_independence: .75, unresolved_ambiguity: .12, process_reliability: .96,
    });
  });
});
