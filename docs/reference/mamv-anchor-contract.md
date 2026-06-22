# MAMVAnchor Contract Reference

`MAMVAnchor.sol` implements public receipt verification for MAMV by storing tamper-evident verification records keyed by `receiptHash`.

MAMV checks AI outputs offchain and anchors receipt hashes onchain so anyone can verify the receipt is authentic, unchanged, and timestamped.

Onchain anchoring makes receipts tamper-evident. It does not guarantee that the AI output is correct.

## Roles

- `DEFAULT_ADMIN_ROLE`: grants and revokes anchorers.
- `ANCHORER_ROLE`: anchors independently verifiable receipts.

## AnchorRecord

The onchain record contains:

- `receiptHash`: canonical hash of the portable MAMV receipt.
- `evidenceHash`: hash of the evidence bundle.
- `programHash`: hash identifying the verification program and version.
- `subjectHash`: hash of the checked output or subject.
- `scoreBps`: score in basis points, from `0` to `10000`.
- `status`: compact application-defined status code.
- `issuer`: authorized verifier address that submitted the anchor.
- `anchoredAt`: block timestamp captured when anchored.
- `uri`: optional URI/CID for the receipt or evidence bundle.

## Public checks

- `isAnchored(receiptHash)` returns whether a receipt hash has an anchor.
- `getAnchor(receiptHash)` returns anchored metadata or reverts if missing.
- `verifyAnchor(...)` compares supplied receipt metadata to the onchain record.

The blockchain verifies the record, not the truth of the claim.
