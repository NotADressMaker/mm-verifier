# Guide: Anchor Receipts

Use onchain receipt anchoring after MAMV has completed offchain verification and produced a signed receipt.

MAMV checks AI outputs offchain and anchors receipt hashes onchain so anyone can verify the receipt is authentic, unchanged, and timestamped.

Onchain anchoring makes receipts tamper-evident. It does not guarantee that the AI output is correct.

## Steps

1. Run the MAMV verification program offchain.
2. Build the portable receipt and evidence bundle.
3. Hash the receipt, evidence bundle, verification program, and subject/output.
4. Submit `anchorReceipt(receiptHash, evidenceHash, programHash, subjectHash, scoreBps, status, uri)` from an authorized anchorer address.
5. Store the transaction hash, chain ID, and optional URI/CID with the receipt.

Do not send raw prompts, raw AI outputs, sports picks text, stock thesis text, legal/medical text, private evidence, model traces, API keys, emails, user IDs, or PII/secrets to the contract.
