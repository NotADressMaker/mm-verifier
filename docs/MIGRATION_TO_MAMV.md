# Migration to MAMV

MAMV is the new product name and expands to **Multi-Agent Model Verification**.

Public description: “MAMV is an open accountability layer for AI outputs. It turns model responses into portable verification receipts backed by multi-agent review, evidence bundles, transparent scoring, and optional onchain anchoring.”

MAMV records how an AI output was checked; it does not prove objective truth or guarantee correctness.

## Package renames

| Old | New |
| --- | --- |
| `llm-verifier` | `mamv` |
| `@llm-verifier/api` | `@mamv/api` |
| `@llm-verifier/dashboard` | `@mamv/dashboard` |
| `@llm-verifier/sdk`, `@mmv/sdk` | `@mamv/sdk` |

## SDK symbol renames

| Old | New |
| --- | --- |
| `MMVClient` | `MAMVClient` |
| `MMVReceipt` | `MAMVReceipt` |
| `MMVAttestation` | `MAMVAttestation` |
| `MMV_EIP712_DOMAIN` | `MAMV_EIP712_DOMAIN` |
| `MMV_EIP712_TYPES` | `MAMV_EIP712_TYPES` |

Deprecated aliases remain for one release where feasible.

## Environment variables

Use `MAMV_*` variables for new deployments. Existing `MMV_*` variables remain supported as fallbacks for one release, including verifier config and chain ID settings.

Examples:

| Old | New |
| --- | --- |
| `MMV_MODEL` | `MAMV_MODEL` |
| `MMV_MAX_ROLLOUTS` | `MAMV_MAX_ROLLOUTS` |
| `MMV_MIN_PASS_SCORE` | `MAMV_MIN_PASS_SCORE` |
| `MMV_CHAIN_ID` | `MAMV_CHAIN_ID` |
| `MMV_AUDITOR_ALLOW_NETWORK` | `MAMV_AUDITOR_ALLOW_NETWORK` |
| `MMV_API_BASE_URL` | `MAMV_API_BASE_URL` |

## Routes

New API route prefix: `/api/mamv`.

Deprecated compatibility route prefix: `/api/mmv` remains mounted as an alias for one release.

## Smart-contract renames

| Old | New |
| --- | --- |
| `TruthChain.sol` / `TruthChain` | `MAMVAnchor.sol` / `MAMVAnchor` |
| `ITruthChain.sol` / `ITruthChain` | `IMAMVAnchor.sol` / `IMAMVAnchor` |
| `VerifyToken.sol` / `VerifyToken` | `MAMVToken.sol` / `MAMVToken` |
| `VerifyGovernor.sol` / `VerifyGovernor` | `MAMVGovernor.sol` / `MAMVGovernor` |
| `VERIFYVault.sol` / `VERIFYVault` | `MAMVVault.sol` / `MAMVVault` |

## Trademark and provider disclaimer

MAMV integrates with third-party model providers. All third-party names, logos, and trademarks are the property of their respective owners. No endorsement or affiliation is implied.
