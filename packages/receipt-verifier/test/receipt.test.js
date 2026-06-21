const test = require('node:test');
const assert = require('node:assert/strict');
const { Wallet } = require('ethers');

test('a third party verifies a receipt without an MAMV server', async () => {
  const { createReceipt, hashArtifact, verifyReceipt } = await import('../dist/index.js');
  const wallet = Wallet.createRandom();
  const input = { prompt: 'What is the capital of France?' };
  const output = { text: 'Paris.' };
  const claim = { text: 'Paris is the capital of France.' };
  const evidence = { sources: [{ uri: 'https://example.org/france', supports: true }] };

  const receipt = await createReceipt(
    {
      receipt_version: '1.0',
      created_at: '2026-06-13T12:00:00Z',
      input_hash: hashArtifact(input),
      output_hash: hashArtifact(output),
      claim_hash: hashArtifact(claim),
      verdict: 'supported',
      score: 0.91,
      program_id: 'factuality-v1',
      program_version: '1.0.0',
      evidence_bundle_hash: hashArtifact(evidence),
      evidence_uri: 'ipfs://bafy-test',
      verifier_id: 'mamv-default-verifier',
    },
    (receiptId) => wallet.signMessage(receiptId)
  );

  const result = verifyReceipt(receipt, {
    verifier_keys: { 'mamv-default-verifier': wallet.address },
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

test('tampering with a signed receipt is detected', async () => {
  const { createReceipt, hashArtifact, verifyReceipt } = await import('../dist/index.js');
  const wallet = Wallet.createRandom();
  const receipt = await createReceipt(
    {
      receipt_version: '1.0',
      created_at: '2026-06-13T12:00:00Z',
      input_hash: hashArtifact('input'),
      output_hash: hashArtifact('output'),
      claim_hash: hashArtifact('claim'),
      verdict: 'supported',
      score: 0.91,
      program_id: 'factuality-v1',
      program_version: '1.0.0',
      evidence_bundle_hash: hashArtifact('evidence'),
      evidence_uri: 'ipfs://bafy-test',
      verifier_id: 'mamv-default-verifier',
    },
    (receiptId) => wallet.signMessage(receiptId)
  );

  const result = verifyReceipt({ ...receipt, score: 0.1 }, {
    verifier_keys: { 'mamv-default-verifier': wallet.address },
  });
  assert.equal(result.valid, false);
  assert.equal(result.checks.receipt_id, false);
});
