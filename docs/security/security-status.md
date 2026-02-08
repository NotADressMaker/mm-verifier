# Security Status Matrix

| Feature | Status | Code Reference | Notes |
| --- | --- | --- | --- |
| Commit–reveal evaluator workflow | Implemented | `contracts/VerificationMarketplace.sol` | Commit/reveal for evaluator scores. |
| Evidence bundle hashing | Implemented | `verifier-node/src/evidence/evidenceBundlerV2.ts` | Hashes evidence bundles and commits. |
| Evidence hash + URI commitments | Implemented | `contracts/BundleRegistry.sol`, `contracts/DisputeLadder.sol` | Enforced during disputes. |
| Dispute ladder (L0–L3) | Implemented | `contracts/DisputeLadder.sol` | Multi-round appealable ladder. |
| Dispute response window | Implemented | `contracts/DisputeLadder.sol` | Verifier response deadline + default resolution. |
| Appeal bonds & windows | Implemented | `contracts/DisputeLadder.sol` | Configurable per round. |
| Juror rewards & treasury cut | Implemented | `contracts/DisputeLadder.sol` | Bond split between winner, jurors, treasury. |
| VRF auditor selection | Partial | `contracts/DisputeLadder.sol` | Chainlink VRF supported; deterministic fallback for tests. |
| Auditor staking & reputation | Implemented | `contracts/AuditorRegistry.sol` | Stake + reputation updates. |
| Program hashing | Implemented | `shared/programs.ts`, `programs/registry.ts` | Deterministic program hash checks. |
| Schema validation (bundles/receipts) | Implemented | `shared/schemas/*`, `programs/registry.ts` | AJV validation. |
| Rate limits | Partial | `api/` | API rate limits vary by deployment. |
| Optional TEE attestations | Planned | `docs/security/threat-model.md` | No on-chain enforcement yet. |
| ZK proofs for verification | Planned | `shared/types.ts` | ZK proof attachments supported in schema only. |

