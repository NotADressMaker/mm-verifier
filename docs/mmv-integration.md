# Multi-Agent Model Verification (MAMV) Integration Guide

## Architecture Diagram (Text)

```
┌───────────────────────────┐
│  Orchestrator / API Node   │
│  (Decision Gate)           │
└─────────────┬─────────────┘
              │ task + candidates
              ▼
┌───────────────────────────┐
│ MAMV Verifier (off-chain)   │
│ - OpenAI evaluation        │
│ - scoring + rationale      │
│ - audit log                │
└─────────────┬─────────────┘
              │ attestation (EIP-712)
              ▼
┌───────────────────────────┐
│ Attestation Signer         │
│ - signs MAMV result         │
└─────────────┬─────────────┘
              │ signature(s)
              ▼
┌───────────────────────────┐
│ On-chain MAMVAttestation    │
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

1. **Configure MAMV settings**
   - Set `MAMV_MODEL`, `MAMV_MAX_ROLLOUTS`, `MAMV_MIN_PASS_SCORE`, `MAMV_MIN_CANDIDATE_SCORE`, `MAMV_TIMEOUT_MS`, and `MAMV_RATE_LIMIT_PER_MINUTE`.
   - Configure signer + chain details (`MAMV_SIGNER_PRIVATE_KEY`, `MAMV_CHAIN_ID`, `MAMV_ATTESTATION_CONTRACT`).

2. **Submit candidates to MAMV**
   - Call `POST /api/mamv/verify` with the task input, candidate outputs, and evidence.

3. **Gate risky actions**
   - Use `POST /api/mamv/guard` to block actions unless the verifier passes.
   - The response includes the selected output, attestation, and signature.

4. **Submit on-chain**
   - Send the attestation + signatures to `MAMVAttestation.consumeAttestation`.
   - Your protected contract checks the attestation before executing.

## Minimal End-to-End Flow Example

1. Generate candidates (multi-rollout from your LLM).
2. Call `/api/mamv/verify` to score candidates and get structured rationale.
3. Call `/api/mamv/guard` to sign an attestation for the chosen output.
4. Submit `consumeAttestation(attestation, signatures)` on-chain.
5. The guarded contract checks replay protection, expiry, and signer quorum.
6. If valid, execute the action (transfer, proposal execution, bridge release).

## Notes on Safety

- The verifier prompt explicitly ignores prompt injection inside candidates.
- Hashing is deterministic: `keccak256(canonical_json(payload))`, where `canonical_json` deep-sorts object keys, preserves array order, omits `undefined`, and emits compact JSON (no whitespace). Hashes are **0x-prefixed** hex.
- Audit logs are persisted to `logs/mamv-audit.jsonl` for traceability.
