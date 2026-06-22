# Receipt Schema Reference

MAMV checks AI outputs offchain and anchors receipt hashes onchain so anyone can verify the receipt is authentic, unchanged, and timestamped.

Onchain anchoring makes receipts tamper-evident. It does not guarantee that the AI output is correct.

## Chain anchor fields

Receipts that use public receipt verification should include a `chain_anchor` object with:

- `enabled`: whether onchain receipt anchoring was performed.
- `chain_id`: chain that contains the anchor transaction.
- `contract_address`: `MAMVAnchor` contract address.
- `tx_hash`: transaction hash for the anchor.
- `receipt_hash`: canonical receipt hash.
- `evidence_hash`: evidence bundle hash.
- `program_hash`: verification program hash.
- `subject_hash`: subject/output hash.
- `score_bps`: score in basis points.
- `status`: compact status code shown to users.
- `issuer`: verifier address that anchored the record.
- `anchored_at`: onchain timestamp or block-derived time.
- `uri`: optional URI/CID pointing to the receipt or evidence bundle.

The blockchain verifies the record, not the truth of the claim. Do not include raw prompts, raw AI outputs, sports picks text, stock thesis text, legal/medical text, private evidence, model traces, API keys, emails, user IDs, or PII/secrets in onchain fields.
