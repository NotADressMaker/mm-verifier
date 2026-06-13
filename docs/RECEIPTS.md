# MMV Receipt 1.0

The receipt is MMV's product: the artifact people trust, pass around, store,
verify, and display. An API response is only a delivery mechanism for a
receipt.

```json
{
  "receipt_version": "1.0",
  "receipt_id": "0x...",
  "created_at": "2026-06-13T12:00:00Z",
  "input_hash": "0x...",
  "output_hash": "0x...",
  "claim_hash": "0x...",
  "verdict": "supported",
  "score": 0.91,
  "program_id": "factuality-v1",
  "program_version": "1.0.0",
  "evidence_bundle_hash": "0x...",
  "evidence_uri": "ipfs://...",
  "verifier_id": "mmv-default-verifier",
  "signature": "0x...",
  "chain_anchor": {
    "enabled": false,
    "chain_id": null,
    "tx_hash": null
  }
}
```

## Can a third party verify this without trusting our server?

**Yes, with independently obtained artifacts and verifier keys.** The
`@mmv/receipt-verifier` package performs local computation and makes no network
requests:

1. Validate the closed Receipt 1.0 schema.
2. Recompute `receipt_id` as the keccak256 hash of canonical JSON containing
   every top-level field except `receipt_id`, `signature`, and `chain_anchor`.
3. Recover the Ethereum signer from the signature over `receipt_id` and compare
   it with a verifier key obtained independently of the receipt-serving API.
4. Optionally hash the input, output, claim, and downloaded evidence bundle and
   compare all four commitments.
5. If anchored, compare `chain_id` and `tx_hash` with transaction data obtained
   from an independent RPC or block explorer.

```typescript
import { verifyReceipt } from '@mmv/receipt-verifier';

const result = verifyReceipt(receipt, {
  verifier_keys: {
    'mmv-default-verifier': process.env.TRUSTED_MMV_VERIFIER_ADDRESS!,
  },
  input,
  output,
  claim,
  evidence_bundle: evidenceBundle,
});
```

The distinction is important: a valid signature proves which verifier issued
the committed verdict; it does not prove that the verdict is objectively true.
Evidence replay, program reproducibility, key governance, and optional chain
anchoring provide progressively stronger assurance.

## Canonicalization and commitments

Objects are recursively key-sorted, arrays retain their order, `undefined`
object properties are omitted, and the resulting UTF-8 JSON is hashed with
keccak256. Producers and consumers must use these exact rules.

The chain anchor is excluded from `receipt_id` because anchoring happens after
issuance. Verifiers must check an enabled anchor separately. The signature is
also excluded to avoid a circular commitment.
