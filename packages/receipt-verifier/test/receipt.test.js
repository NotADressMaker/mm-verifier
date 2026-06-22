const test = require("node:test");
const assert = require("node:assert/strict");
const { Wallet } = require("ethers");

test("a third party verifies a receipt without an MAMV server", async () => {
  const { createReceipt, hashArtifact, verifyReceipt } =
    await import("../dist/index.js");
  const wallet = Wallet.createRandom();
  const input = { prompt: "What is the capital of France?" };
  const output = { text: "Paris." };
  const claim = { text: "Paris is the capital of France." };
  const evidence = {
    sources: [{ uri: "https://example.org/france", supports: true }],
  };

  const receipt = await createReceipt(
    {
      receipt_version: "1.0",
      created_at: "2026-06-13T12:00:00Z",
      input_hash: hashArtifact(input),
      output_hash: hashArtifact(output),
      claim_hash: hashArtifact(claim),
      verdict: "supported",
      score: 0.91,
      program_id: "factuality-v1",
      program_version: "1.0.0",
      evidence_bundle_hash: hashArtifact(evidence),
      evidence_uri: "ipfs://bafy-test",
      verifier_id: "mamv-default-verifier",
    },
    (receiptId) => wallet.signMessage(receiptId),
  );

  const result = verifyReceipt(receipt, {
    verifier_keys: { "mamv-default-verifier": wallet.address },
    input,
    output,
    claim,
    evidence_bundle: evidence,
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.checks.signature, true);
  assert.equal(result.checks.evidence_bundle_hash, true);
});

test("tampering with a signed receipt is detected", async () => {
  const { createReceipt, hashArtifact, verifyReceipt } =
    await import("../dist/index.js");
  const wallet = Wallet.createRandom();
  const receipt = await createReceipt(
    {
      receipt_version: "1.0",
      created_at: "2026-06-13T12:00:00Z",
      input_hash: hashArtifact("input"),
      output_hash: hashArtifact("output"),
      claim_hash: hashArtifact("claim"),
      verdict: "supported",
      score: 0.91,
      program_id: "factuality-v1",
      program_version: "1.0.0",
      evidence_bundle_hash: hashArtifact("evidence"),
      evidence_uri: "ipfs://bafy-test",
      verifier_id: "mamv-default-verifier",
    },
    (receiptId) => wallet.signMessage(receiptId),
  );

  const result = verifyReceipt(
    { ...receipt, score: 0.1 },
    {
      verifier_keys: { "mamv-default-verifier": wallet.address },
    },
  );
  assert.equal(result.valid, false);
  assert.equal(result.checks.receipt_id, false);
});

test("public receipt verification checks onchain receipt anchoring metadata", async () => {
  const { createReceipt, hashArtifact, verifyReceipt, verifyAnchoredRecord } =
    await import("../dist/index.js");
  const { keccak256, toUtf8Bytes } = await import("ethers");
  const wallet = Wallet.createRandom();
  const input = { prompt: "Summarize the evidence." };
  const output = { text: "The evidence supports the claim." };
  const claim = { text: "The summary is evidence-backed." };
  const evidence = { checks: ["source-match", "citation-present"] };
  const programHash = keccak256(toUtf8Bytes("factuality-v1@1.0.0"));
  const base = {
    receipt_version: "1.0",
    created_at: "2026-06-13T12:00:00Z",
    input_hash: hashArtifact(input),
    output_hash: hashArtifact(output),
    claim_hash: hashArtifact(claim),
    verdict: "supported",
    score: 0.91,
    program_id: "factuality-v1",
    program_version: "1.0.0",
    evidence_bundle_hash: hashArtifact(evidence),
    evidence_uri: "ipfs://bafy-evidence",
    verifier_id: "mamv-default-verifier",
  };
  const draft = await createReceipt(base, (receiptId) =>
    wallet.signMessage(receiptId),
  );
  const receipt = {
    ...draft,
    chain_anchor: {
      enabled: true,
      chain_id: 42161,
      contract_address: wallet.address,
      tx_hash: hashArtifact("tx"),
      receipt_hash: draft.receipt_id,
      evidence_hash: draft.evidence_bundle_hash,
      program_hash: programHash,
      subject_hash: draft.output_hash,
      score_bps: 9100,
      status: 1,
      issuer: wallet.address,
      anchored_at: 1781860800,
      uri: "ipfs://bafy-receipt",
    },
  };

  const result = verifyReceipt(receipt, {
    verifier_keys: { "mamv-default-verifier": wallet.address },
    chain_transaction: {
      chain_id: 42161,
      tx_hash: receipt.chain_anchor.tx_hash,
    },
  });
  assert.equal(result.valid, true);
  assert.equal(result.checks.chain_anchor, true);
  assert.deepEqual(
    verifyAnchoredRecord(receipt, {
      receiptHash: receipt.receipt_id,
      evidenceHash: receipt.evidence_bundle_hash,
      programHash,
      subjectHash: receipt.output_hash,
      scoreBps: 9100,
      status: 1,
      issuer: wallet.address,
      uri: "ipfs://bafy-receipt",
    }),
    [],
  );
});

test("public receipt verification rejects changed anchored score or status", async () => {
  const { createReceipt, hashArtifact, verifyReceipt } =
    await import("../dist/index.js");
  const { keccak256, toUtf8Bytes } = await import("ethers");
  const wallet = Wallet.createRandom();
  const draft = await createReceipt(
    {
      receipt_version: "1.0",
      created_at: "2026-06-13T12:00:00Z",
      input_hash: hashArtifact("input"),
      output_hash: hashArtifact("output"),
      claim_hash: hashArtifact("claim"),
      verdict: "supported",
      score: 0.91,
      program_id: "factuality-v1",
      program_version: "1.0.0",
      evidence_bundle_hash: hashArtifact("evidence"),
      evidence_uri: "ipfs://bafy-evidence",
      verifier_id: "mamv-default-verifier",
    },
    (receiptId) => wallet.signMessage(receiptId),
  );
  const receipt = {
    ...draft,
    chain_anchor: {
      enabled: true,
      chain_id: 42161,
      contract_address: wallet.address,
      tx_hash: hashArtifact("tx"),
      receipt_hash: draft.receipt_id,
      evidence_hash: draft.evidence_bundle_hash,
      program_hash: keccak256(toUtf8Bytes("factuality-v1@1.0.0")),
      subject_hash: draft.output_hash,
      score_bps: 10000,
      status: 1,
      issuer: wallet.address,
      anchored_at: 1781860800,
      uri: null,
    },
  };

  const result = verifyReceipt(receipt, {
    verifier_keys: { "mamv-default-verifier": wallet.address },
    chain_transaction: {
      chain_id: 42161,
      tx_hash: receipt.chain_anchor.tx_hash,
    },
  });
  assert.equal(result.valid, false);
  assert.equal(result.checks.chain_anchor, false);
  assert.ok(
    result.errors.includes("chain_anchor score_bps does not match score"),
  );
});
