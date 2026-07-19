# MAMV receipts

A MAMV receipt is the center of the product. It is a portable record that explains how an AI output was checked.

## Product flow

1. User submits an AI output or claim.
2. MAMV runs verification.
3. MAMV returns a receipt.
4. The receipt can be viewed, shared, downloaded, and independently verified.

## Public fields

Receipts are hardened to support: `receipt_id`, `created_at`, checked input/output, claim summary, verification status, confidence score, warnings/risk flags, provider/model votes, outliers, quorum status, evidence/source metadata, receipt hash, signer metadata, vote Merkle roots/proofs, and optional onchain anchor fields (`chain_id`, `contract_address`, `tx_hash`, `block_number`, `anchor_status`).

UI and docs prefer `quorum_status`. Existing `bft_quorum` fields remain accepted for backward compatibility and should be described as a BFT-style weighted quorum or supermajority quorum, not full Byzantine consensus unless the deployment truly provides that.

## Receipt labels

Receipts use the documented evidence verdicts: **Supported**, **Mostly supported**, **Mixed evidence**, **Unsupported**, **Contradicted**, and **Unable to verify**. Each label has ordered thresholds, required measurements, and explanation rules; it does not assert that an output is true. See [Public verdict policy](VERDICTS.md).

## Verification

To verify a receipt, recompute the canonical receipt hash, compare it with `receipt_hash`/`receipt_id`, verify signer metadata if present, and compare optional onchain anchor metadata against an independently fetched transaction.
