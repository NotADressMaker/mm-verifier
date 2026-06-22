# Public Receipt Verification

MAMV checks AI outputs offchain and anchors receipt hashes onchain so anyone can verify the receipt is authentic, unchanged, and timestamped.

Public receipt verification lets other people, apps, marketplaces, and auditors verify that a MAMV receipt is real and unchanged without trusting the dashboard or API that displayed it. The receipt remains portable: users can share the receipt JSON, its evidence bundle hash, the verification program hash, and the chain transaction that anchored the record.

Onchain anchoring makes receipts tamper-evident. It does not guarantee that the AI output is correct.

## What the blockchain verifies

The chain stores tamper-evident verification records that bind a receipt to compact commitments:

- receipt hash
- evidence bundle hash
- verification program hash
- subject/output hash
- score
- status
- issuer/verifier address
- timestamp/block number
- optional URI/CID pointing to the receipt or evidence bundle

These commitments support independently verifiable receipts by proving that the same record existed at anchoring time and was issued by an authorized verifier.

## What the blockchain does not verify

The blockchain verifies the record, not the truth of the claim. Offchain MAMV verification programs evaluate the AI output, produce evidence, calculate the score/status, and sign the receipt. The onchain record only makes the resulting receipt metadata durable and tamper-evident.
