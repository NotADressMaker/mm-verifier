# MAMV API

## Create a verification receipt

`POST /api/mamv/verify`

```json
{
  "taskId": "demo-1",
  "input": "Question or prompt",
  "candidates": ["AI answer to check"],
  "evidence": { "sources": ["https://example.com/source"] }
}
```

Response:

```json
{ "taskId": "demo-1", "receipt": { "receipt_id": "0x...", "verification_status": "Likely" } }
```

## Fetch a receipt

`GET /api/jobs/{jobId}/receipt` returns a receipt in mock/demo mode. Production deployments can expose the same receipt shape from their receipt store.

## Verify a receipt hash/signature

Use `packages/receipt-verifier` to recompute the canonical hash and validate signatures with independently trusted verifier keys. API deployments may expose this as `POST /api/mamv/receipts/verify`.

## Optional anchoring

If anchoring is enabled, use an anchor endpoint to submit `receipt_hash`, then poll anchor status. Anchoring is for tamper-evident accountability and does not prove answer correctness.

```json
{ "receipt_hash": "0x...", "anchor_status": "anchored", "tx_hash": "0x..." }
```
