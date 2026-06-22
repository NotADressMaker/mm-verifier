import {
  buildMerkleVoteTree,
  hashResponse,
  ModelVote,
} from "../src/scoring/merkleVotes";
import {
  scorePolicyCompliance,
  scoreVerification,
} from "../src/scoring/scorer";
import { recordProviderError } from "../src/providers/trust";
import Ajv from "ajv";
import receiptSchemaV1 from "../../shared/schemas/receipt.v1.schema.json";

const response = (provider: string, model: string, text: string) => ({
  provider,
  model,
  response: text,
  timestamp: 1,
  metadata: {},
});

const sharedText =
  "The capital of France is Paris. This answer is supported by common geographic records.";

describe("scoring consensus safety", () => {
  it("compiles and runs with multiple model responses", async () => {
    const result = await scoreVerification(
      "capital?",
      [
        response("openai", "a", sharedText),
        response("anthropic", "b", sharedText),
        response("google", "c", sharedText),
      ],
      "general",
    );
    expect(result.vote_merkle_root).toMatch(/^0x[a-fA-F0-9]{64}$/);
    expect(result.bft_quorum).toBe(true);
  });

  it("excludes slashed providers from quorum", async () => {
    for (let i = 0; i < 4; i++) recordProviderError("slash-me", "bad", "hard");
    const result = await scoreVerification(
      "capital?",
      [
        response("slash-me", "bad", sharedText),
        response("openai", "a", sharedText),
      ],
      "general",
    );
    expect(result.bft_quorum).toBe(false);
  });

  it("fails quorum when too few unslashed providers respond", async () => {
    const result = await scoreVerification(
      "capital?",
      [response("solo", "a", sharedText)],
      "general",
    );
    expect(result.bft_quorum).toBe(false);
  });

  it("succeeds quorum when enough weighted providers agree", async () => {
    const result = await scoreVerification(
      "capital?",
      [
        response("p1", "a", sharedText),
        response("p2", "b", sharedText),
        response(
          "p3",
          "c",
          "A very different unsupported answer about Mars and engines.",
        ),
      ],
      "general",
    );
    expect(result.bft_quorum).toBe(true);
  });

  it("flags clear outlier responses", async () => {
    const result = await scoreVerification(
      "capital?",
      [
        response("p4", "a", sharedText),
        response("p5", "b", sharedText),
        response("p6", "c", sharedText),
        response(
          "p7",
          "d",
          "Bananas quantum staircase unrelated tokens volcano.",
        ),
      ],
      "general",
    );
    expect(result.outliers).toContain("p7:d");
  });

  it("does not over-filter when MAD is zero", async () => {
    const result = await scoreVerification(
      "capital?",
      [
        response("p8", "a", sharedText),
        response("p9", "b", sharedText),
        response("p10", "c", sharedText),
      ],
      "general",
    );
    expect(result.outliers).toEqual([]);
    expect(result.bft_quorum).toBe(true);
  });

  it("does not misclassify non-compliant as compliant", () => {
    const score = scorePolicyCompliance([
      response("p1", "a", "non-compliant: unsafe output"),
      response("p2", "b", "non-compliant due to policy"),
      response("p3", "c", "unclear"),
    ]);
    expect(score).toBeCloseTo((2 / 3) * 100);
  });
});

describe("vote Merkle tree", () => {
  const votes = (): ModelVote[] => [
    {
      vote_id: `0:dup:${hashResponse("a")}`,
      model_id: "dup",
      response_hash: hashResponse("a"),
      score_bps: 9000,
    },
    {
      vote_id: `1:dup:${hashResponse("b")}`,
      model_id: "dup",
      response_hash: hashResponse("b"),
      score_bps: 8000,
    },
    {
      vote_id: `2:other:${hashResponse("c")}`,
      model_id: "other",
      response_hash: hashResponse("c"),
      score_bps: 7000,
    },
  ];

  it("is deterministic", () => {
    const first = buildMerkleVoteTree(votes()).root;
    const second = buildMerkleVoteTree([...votes()].reverse()).root;
    expect(first).toBe(second);
  });

  it("does not overwrite duplicate model id proofs", () => {
    const tree = buildMerkleVoteTree(votes());
    expect(Object.keys(tree.proofs)).toHaveLength(3);
    expect(tree.proofs[`0:dup:${hashResponse("a")}`]).toBeDefined();
    expect(tree.proofs[`1:dup:${hashResponse("b")}`]).toBeDefined();
  });
});

describe("receipt explain schema", () => {
  it("accepts consensus audit fields", () => {
    const receipt = {
      schema_version: "1",
      version: "1.0.0",
      receipt_version: "1.0.0",
      task_id: "t",
      generated_at: 1,
      input_hash: `0x${"1".repeat(64)}`,
      output_hash: `0x${"2".repeat(64)}`,
      score_bps: 9000,
      verdict: true,
      worthy: true,
      evidence: {
        bundle_hash: `0x${"3".repeat(64)}`,
        bundle_uri: "ipfs://bundle",
        bundle_version: "0.3",
      },
      provenance: { llm_provider: "p", llm_model: "m" },
      explain: {
        version: "1.0.0",
        score_components: [],
        score_components_detail: {
          coverage_bps: 0,
          contradiction_penalty_bps: 0,
          citation_quality_bps: 0,
          final_score_bps: 0,
        },
        claim_summary: [],
        highlights: [],
        checks: {},
        checks_fired: [],
        uncertain_claims: [],
        score_adjustments: [],
        contradictions_found: [],
        citation_checks: [],
        model_disagreement: { models: [], agreement_rate: 1 },
        bft_quorum: true,
        outliers: ["p:m"],
        vote_merkle_root: `0x${"4".repeat(64)}`,
        vote_merkle_proofs: { "0:p:m": [`0x${"5".repeat(64)}`] },
      },
    };
    const validate = new Ajv({ allErrors: true }).compile(receiptSchemaV1);
    expect(validate(receipt)).toBe(true);
  });
});
