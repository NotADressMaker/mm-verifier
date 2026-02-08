# Privacy & Data Minimization Policy

This document describes what MMV stores, where it is stored, and for how long.

## Default: hashed-only storage

By default (`HASHED_ONLY_DEFAULT=true`), verification jobs store **only**:

* `task_id`
* `bundle_hash` (commitment)
* minimal metadata (program id/version, timestamps)

Plaintext prompts, model outputs, and transcripts are **not stored** in job records or receipts.

## Encrypted evidence bundles (opt-in)

If a requester opts in (`store_evidence: true`), MMV stores an **encrypted** evidence bundle:

* AES-256-GCM encryption for stored bundles.
* A master key from `EVIDENCE_MASTER_KEY_BASE64`.
* Per-bundle keys derived with HKDF using the bundle hash as salt and
  `EVIDENCE_KEY_VERSION` as info.

The stored payload contains:

* `encrypted_blob` (ciphertext + IV + auth tag)
* `bundle_hash` (commitment)
* `key_version` + encryption version

MMV does not return plaintext evidence bundles via API endpoints in the default configuration.

## Storage locations

Encrypted bundles may be stored in:

* Local encrypted evidence storage (`EVIDENCE_STORAGE_DIR`, default `./evidence-storage/encrypted`)
* IPFS gateway storage when configured (`EVIDENCE_STORAGE_MODE=ipfs`)

Receipts and commitments are stored in application DB/Redis and on-chain records.

## Retention policy

* **Encrypted evidence bundles**: retained for `RETENTION_DAYS` (default 7 days) and
  periodically purged.
* **Commitments/receipts**: retained indefinitely for auditability.

Operators can purge evidence bundles manually:

```
mmv admin purge-evidence --older-than 7d
```

## Access & redaction guarantees

* Access is limited to operators and authorized auditors.
* Logs never include plaintext prompts or outputs.
* Evidence retrieval endpoints return “not stored” when hashed-only mode is used.
