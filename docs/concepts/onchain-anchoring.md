# Onchain Receipt Anchoring

Onchain receipt anchoring is the process of writing compact receipt commitments to `MAMVAnchor.sol` after MAMV finishes its offchain checks.

MAMV checks AI outputs offchain and anchors receipt hashes onchain so anyone can verify the receipt is authentic, unchanged, and timestamped.

Onchain anchoring makes receipts tamper-evident. It does not guarantee that the AI output is correct.

## Stored onchain

`MAMVAnchor` stores only compact metadata:

- receipt hash
- evidence bundle hash
- verification program hash
- subject/output hash
- score
- status
- issuer/verifier address
- timestamp/block number
- optional URI/CID pointing to the receipt or evidence bundle

## Never stored onchain

Do not put private or raw content in an anchor transaction. The blockchain does not store:

- raw prompts
- raw AI outputs
- sports picks text
- stock thesis text
- legal/medical text
- private evidence
- model traces
- API keys
- emails
- user IDs
- PII/secrets

Use hashes and, when appropriate, a URI/CID for encrypted or access-controlled offchain artifacts.
