import { validateReceiptV1 } from "../../../../../shared/schemaValidation";
import {
  buildReceipt,
  computeReceiptHash,
  getReceiptCanonicalJson,
  validateReceipt,
} from "../../../../../shared/receipt";
import {
  assessDistillationWatermark,
  DISTILLATION_WATERMARK_POLICIES,
} from "..";
const assessment = assessDistillationWatermark(
  {
    subject: {
      subjectType: "text_sample_set",
      sampleSetId: "s",
      collectionMethod: "provided",
      sampleHashes: ["x"],
      limitations: ["limited"],
    },
    samples: [{ sampleId: "s", sessionId: "session", text: "text" }],
    scheme: {
      schemeId: "green_red_list_bias",
      schemeVersion: "1",
      keyVersion: "public-alias",
      tokenizerId: "t",
      normalizationVersion: "n",
      greenListFraction: 0.5,
      contextWidth: 1,
      seedingAlgorithm: "fixture",
      eligibilityRule: "non-special",
      specialTokenPolicy: "exclude",
    },
    detectorVersion: "experimental-v1",
    policy: DISTILLATION_WATERMARK_POLICIES.default,
    collectionIndependence: "demonstrated",
  },
  {
    score: () => ({
      totalTokenCount: 100,
      eligibleTokenCount: 100,
      excludedTokenCount: 0,
      observedGreenCount: 50,
    }),
  },
);
const params = {
  task_id: "t",
  input_hash: ("0x" + "1".repeat(64)) as `0x${string}`,
  output_hash: ("0x" + "2".repeat(64)) as `0x${string}`,
  score_bps: 1,
  bundle_hash: ("0x" + "3".repeat(64)) as `0x${string}`,
  bundle_uri: "ipfs://x",
  llm_provider: "test",
  llm_model: "test",
};
describe("watermark receipt commitment", () => {
  test("commits optional assessment only when present and redacts key material", () => {
    const plain = buildReceipt(params);
    const withAssessment = buildReceipt({
      ...params,
      distillation_watermark_assessment: assessment,
    });
    expect(computeReceiptHash(plain)).not.toBe(
      computeReceiptHash(withAssessment),
    );
    const serialized = getReceiptCanonicalJson(withAssessment);
    expect(serialized).toContain("public-alias");
    expect(serialized).not.toContain("secret-watermark-key");
    expect(serialized).not.toContain("watermarkDetected");
    expect(validateReceipt(withAssessment).valid).toBe(true);
  });
  test("rejects unknown assessment version", () => {
    const receipt = buildReceipt({
      ...params,
      distillation_watermark_assessment: assessment,
    });
    (receipt.distillation_watermark_assessment as any).schemaVersion =
      "distillation-watermark-assessment/v2";
    expect(validateReceipt(receipt).valid).toBe(false);
  });
});
