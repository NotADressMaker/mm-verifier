# Multi-LLM Verifier (MMV) Integration Guide

## Architecture Diagram (Text)

```
┌───────────────────────────┐
│  Orchestrator / API Node   │
│  (Decision Gate)           │
└─────────────┬─────────────┘
              │ task + candidates
              ▼
┌───────────────────────────┐
│ MMV Verifier (off-chain)   │
│ - OpenAI evaluation        │
│ - scoring + rationale      │
│ - audit log                │
└─────────────┬─────────────┘
              │ attestation (EIP-712)
              ▼
┌───────────────────────────┐
│ Attestation Signer         │
│ - signs MMV result         │
└─────────────┬─────────────┘
              │ signature(s)
              ▼
┌───────────────────────────┐
│ On-chain MMVAttestation    │
│ - verifies signatures      │
│ - checks quorum + expiry   │
│ - replay protection        │
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│ Protected Action Contract  │
│ - executes gated action    │
└───────────────────────────┘
```

## Step-by-Step Integration

1. **Configure MMV settings**
   - Set `MMV_MODEL`, `MMV_MAX_ROLLOUTS`, `MMV_MIN_PASS_SCORE`, `MMV_MIN_CANDIDATE_SCORE`, `MMV_TIMEOUT_MS`, and `MMV_RATE_LIMIT_PER_MINUTE`.
   - Configure signer + chain details (`MMV_SIGNER_PRIVATE_KEY`, `MMV_CHAIN_ID`, `MMV_ATTESTATION_CONTRACT`).

2. **Submit candidates to MMV**
   - Call `POST /api/mmv/verify` with the task input, candidate outputs, and evidence.

3. **Gate risky actions**
   - Use `POST /api/mmv/guard` to block actions unless the verifier passes.
   - The response includes the selected output, attestation, and signature.

4. **Submit on-chain**
   - Send the attestation + signatures to `MMVAttestation.consumeAttestation`.
   - Your protected contract checks the attestation before executing.

## Minimal End-to-End Flow Example

1. Generate candidates (multi-rollout from your LLM).
2. Call `/api/mmv/verify` to score candidates and get structured rationale.
3. Call `/api/mmv/guard` to sign an attestation for the chosen output.
4. Submit `consumeAttestation(attestation, signatures)` on-chain.
5. The guarded contract checks replay protection, expiry, and signer quorum.
6. If valid, execute the action (transfer, proposal execution, bridge release).

## Notes on Safety

- The verifier prompt explicitly ignores prompt injection inside candidates.
- Hashing is deterministic: `keccak256(canonical_json(payload))`, where `canonical_json` deep-sorts object keys, preserves array order, omits `undefined`, and emits compact JSON (no whitespace). Hashes are **0x-prefixed** hex.
- Audit logs are persisted to `logs/mmv-audit.jsonl` for traceability.
