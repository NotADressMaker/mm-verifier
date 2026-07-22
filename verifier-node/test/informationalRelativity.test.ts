import { AssessmentReceiptForDiff, FRAME_SEMANTICS, VerificationFrame, VersionedVerdictPolicy, createInformationalRelativityReceipt, diffAssessmentReceipts, evaluateEvidence, hashVerdictPolicy, hashVerificationFrame, predictUnderFrame, registerPolicy, validateAssessmentReceipt, verifyInFrame } from "../src/scoring/informationalRelativity";

const policy: VersionedVerdictPolicy = { id: "general", version: 1, thresholds: { minimum_coverage: .5, minimum_source_independence: .5, maximum_unresolved_ambiguity: .5, mostly_supported_minimum_support: .75, mostly_supported_maximum_contradiction: .15 } };
const policyHash = registerPolicy(policy);
const authority = { authorityId: "general-factual-v1", verifierId: "mamv-test", authorizedClaimTypes: ["factual"], authorizedEvidenceTypes: ["document"], authorizedMethods: ["0xmethod"], jurisdictionScope: ["US", "CA"], prohibitedAssertions: [], limitations: ["Test authority only."] };
const frame: VerificationFrame = { id: "frame_456", program: { id: "mamv-general-factual", version: 3 }, interpretation: "ordinary-v1", possibility_space_hash: "0xpossibility", evidence_scope: { sources: ["primary"] }, policy_hash: policyHash, jurisdiction: "US", domain: "general", assessment_time: "2026-07-20T14:30:00Z", method_manifest_hash: "0xmethod", verifier: { verifierId: "mamv-test", verifierType: "software", verifierVersion: "1" }, verifier_authority: authority };
const input = { covered_claims: 9, total_claims: 10, supporting_relations: 8, contradicting_relations: 2, source_quality: .82, source_independence: .75, unresolved_ambiguity: .12, process_reliability: .96 };

describe("rule-governed assessment frames", () => {
  it("hashes canonical frames and every material field names a consuming computation", () => {
    expect(hashVerificationFrame(frame)).toBe(hashVerificationFrame({ ...frame, evidence_scope: { sources: ["primary"] } }));
    for (const field of Object.values(FRAME_SEMANTICS.fields)) if (field.materialToAssessment) expect(field.consumedBy.length).toBeGreaterThan(0);
  });
  it("binds the resolved policy and rejects policy substitution", () => {
    expect(() => verifyInFrame({ ...frame, policy_hash: "0xnot-registered" }, input)).toThrow("Unknown policy hash");
    expect(() => verifyInFrame(frame, input, { ...policy, version: 2 })).toThrow("does not match");
    expect(hashVerdictPolicy(policy)).toBe(policyHash);
  });
  it("uses interpretation only through its declared ambiguity rule and keeps jurisdiction descriptive", () => {
    expect(evaluateEvidence({ ...frame, jurisdiction: "CA" }, input)).toEqual(evaluateEvidence(frame, input));
    expect(evaluateEvidence({ ...frame, interpretation: "strict-literal-v1" }, input).unresolved_ambiguity).toBeCloseTo(.22);
  });
});

describe("recognition and typed receipt comparisons", () => {
  const verification = verifyInFrame(frame, input);
  const receipt = createInformationalRelativityReceipt({ claim: { id: "claim-1", canonical_form: { text: "Paris is France's capital." } }, verification, evidence_root: "0xevidence", explanation: "Reviewed relations support the claim." });
  it("records attributable verification and validates bindings separately from the verdict", () => {
    expect(receipt.verification_frame.verifier?.verifierId).toBe("mamv-test");
    expect(receipt.verification_frame.verifier?.verifierVersion).toBe("1");
    expect(receipt.verification_frame.verifier_authority?.authorityId).toBe("general-factual-v1");
    expect(validateAssessmentReceipt(receipt).status).toBe("valid");
    expect(validateAssessmentReceipt({ ...receipt, claim: { ...receipt.claim, hash: "0xwrong" } }).status).toBe("invalid_claim_binding");
    expect(validateAssessmentReceipt({ ...receipt, verification_frame: { ...frame, verifier: undefined } }).status).toBe("missing_verifier_identity");
  });
  it("distinguishes different claims, evidence, and policy without weighting descriptive jurisdiction", () => {
    const left: AssessmentReceiptForDiff = { claim: receipt.claim, verification_frame: frame, measurements: receipt.measurements, assessment: receipt.assessment, evidence_root: "0xevidence" };
    expect(diffAssessmentReceipts(left, { ...left, verification_frame: { ...frame, jurisdiction: "CA" } }).attributions).toEqual([]);
    expect(diffAssessmentReceipts(left, { ...left, evidence_root: "0xother" }).relation).toBe("same_claim_different_evidence");
    expect(diffAssessmentReceipts(left, { ...left, claim: { ...receipt.claim, hash: "0xother" } }).relation).toBe("different_claim");
    const strict = { ...policy, version: 2, thresholds: { ...policy.thresholds, mostly_supported_minimum_support: .85 } };
    const strictHash = registerPolicy(strict);
    expect(diffAssessmentReceipts(left, { ...left, verification_frame: { ...frame, id: "strict", policy_hash: strictHash } }).relation).toBe("same_subject_different_primary_rules");
  });
  it("predicts only a threshold reapplication and does not mutate the receipt", () => {
    const strict = { ...policy, version: 3, thresholds: { ...policy.thresholds, mostly_supported_minimum_support: .85 } };
    const target = { ...frame, id: "strict", policy_hash: registerPolicy(strict) };
    const before = receipt.integrity.receipt_hash;
    const prediction = predictUnderFrame(receipt, target);
    expect(prediction).toMatchObject({ status: "predicted", predictionBasis: "threshold_reapplication", reusedMeasurements: expect.arrayContaining(["coverage"]) });
    expect(prediction.limitations).not.toHaveLength(0);
    expect(receipt.integrity.receipt_hash).toBe(before);
    expect(predictUnderFrame(receipt, { ...target, interpretation: "strict-literal-v1" }).status).toBe("requires_reverification");
  });
});
