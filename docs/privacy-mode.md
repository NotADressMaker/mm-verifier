# Privacy Mode (Encrypted Evidence Bundles)

Privacy mode protects sensitive prompts, transcripts, and model outputs by encrypting the full plaintext evidence bundle off-chain. On-chain or public metadata stores only commitments and encrypted blob references.

## Threat Model

**Protects against:**
- Public disclosure of prompts, transcripts, or model outputs.
- Tampering with encrypted blobs (hash commitments detect changes).

**Does not protect against:**
- Compromise of recipients’ private keys.
- Metadata leakage (task IDs, hashes, bundle sizes, and timing remain visible).
- Malicious verifier behavior (plaintext can still be fabricated before encryption).

## Bundle Fields

Privacy mode adds the following fields to EvidenceBundle:

- `privacy_mode`: `true` when encrypted payload is used.
- `encrypted_payload_uri`: URI (or local path) for encrypted blob.
- `encrypted_payload_hash`: hash of the encrypted blob.
- `plaintext_commitment_hash`: hash of the canonical plaintext bundle.
- `key_envelopes`: array of encrypted symmetric key envelopes for recipients.

## Key Sharing

Each bundle uses a unique symmetric key (AES-256-GCM). The key is shared via ECIES-style envelopes:

1. Generate a per-recipient ephemeral secp256k1 keypair.
2. Derive a shared secret using ECDH.
3. Encrypt the symmetric key with AES-256-GCM.

Recipients use their private key to recover the symmetric key and decrypt the payload.

**Key format**: recipient public keys are expected as uncompressed secp256k1 hex (0x04...).

## Signed Verified-Plaintext Statement

Verifiers can sign the statement:

```
I verified plaintext evidence bundle hash = <plaintext_commitment_hash>
```

The signature and signer address are stored in receipts or explainability checks so auditors can confirm that the verifier attested to the decrypted payload.

## CLI

Encrypt a bundle for recipients:

```
mamv encrypt-bundle bundle.json --recipients <pubkey...> --out bundle.encrypted.json
```

Decrypt a bundle:

```
mamv decrypt-bundle bundle.encrypted.json --key <hex-private-key> --out bundle.json
```

## Notes

- Payload encryption is deterministic only at the commitment layer: ciphertexts change due to random IVs.
- The verifier node never needs to serve plaintext publicly; auditors can request the key envelopes.
