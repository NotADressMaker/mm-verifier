# Guide: Verify Receipts Publicly

Public receipt verification lets a user, app, marketplace, or auditor verify that a MAMV receipt is real and unchanged.

MAMV checks AI outputs offchain and anchors receipt hashes onchain so anyone can verify the receipt is authentic, unchanged, and timestamped.

Onchain anchoring makes receipts tamper-evident. It does not guarantee that the AI output is correct.

## Verification checklist

1. Recompute the receipt hash from the receipt JSON.
2. Recompute the evidence bundle hash if evidence is available.
3. Recompute or independently obtain the verification program hash.
4. Recompute the subject/output hash if the checked output is available.
5. Query `MAMVAnchor.getAnchor(receiptHash)` or `verifyAnchor(...)` from an independent RPC.
6. Confirm the issuer has `ANCHORER_ROLE` or was authorized at anchoring time.
7. Confirm score and status in the UI match the anchored record.

This process can verify that a MAMV receipt is real and unchanged. The blockchain verifies the record, not the truth of the claim.
