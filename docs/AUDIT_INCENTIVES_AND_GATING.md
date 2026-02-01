# MMV Audit: Incentives (Verification Mining) + Forced Verification Readiness

## Scope & Sources
This audit focuses on whether the current MMV system can safely support:
- **Verification mining / incentives** (points, reputation, stake+slashing, emissions readiness)
- **Forced verification / gating** for downstream apps

Reviewed artifacts include:
- System schemas in `shared/` (evidence bundles, receipts, canonical hashing, verified outputs).
- Verifier-node bundlers, IPFS storage, and blockchain integration.
- API routes and SDK surface area.
- Solidity contracts and ABI wiring.
- Docs and OpenAPI descriptions (architecture, integration, proof-of-verification spec).

## Executive Summary (Neutral)
- **Multiple schema surfaces drift from one another** (task_id vs jobId, bytes32 vs uint256, receipt format, evidence bundle versioning). This creates ambiguity for incentives and gating systems that depend on deterministic, cross-layer identity and hashing.
- **Hashing and canonicalization are mostly consistent in code**, but **evidence integrity checks are incomplete** (CID vs content hash verification is explicitly a TODO), which weakens enforceability for incentives and gating that rely on evidence availability.
- **Contract integration is functionally wired** for create/commit/reveal, but **system-level protocol coherence is incomplete** (e.g., on-chain contract TODOs for canonical hashing/type usage and missing receipt verification contracts).
- **Forced verification readiness is partial**: SDK/OpenAPI describe receipt endpoints that are not implemented; contract-level receipt verification for gating exists only as a doc-only interface.
- **Incentives feasibility** is limited by missing adjudication/anti-farming signals, and no reliable, on-chain finalization signal is exposed to downstream apps (beyond reading raw events).

---

## 1) System Contract Coherence
### 1.1 Evidence Bundle Schemas
**Evidence bundle version drift:**
- Shared types define **v0.1 and v0.2** bundles, with `bundle_version` defaulting to **v0.2** in code, while docs still describe **v0.1 as canonical**. This introduces ambiguity for downstream incentives that need stable schemas.
  - Shared types + default: `EvidenceBundleV02`, `BUNDLE_VERSION_DEFAULT: '0.2'`.【F:shared/types.ts†L54-L144】【F:shared/types.ts†L660-L707】
  - Verifier-node constructs v0.2 bundles when no env override is set.【F:verifier-node/src/evidence/evidenceBundlerV2.ts†L203-L316】
  - Docs still present v0.1 as canonical (example shows `bundle_version: "0.1"`).【F:docs/ARCHITECTURE.md†L210-L279】

**Task identifier format drift:**
- Evidence bundle schemas accept `task_id` as `number | string` and docs show hex strings, while on-chain tasks are `uint256` and API returns decimal strings.
  - Evidence bundle schema allows number or string for `task_id`.【F:shared/types.ts†L10-L44】
  - Docs show `task_id: "0x..."` (hex).【F:docs/ARCHITECTURE.md†L210-L279】
  - On-chain `createTask` returns `uint256`, and API uses that numeric string throughout (`taskId`/`task_id`).【F:contracts/contracts/VerificationMarketplace.sol†L108-L186】【F:api/src/services/blockchain.ts†L65-L146】

### 1.2 Receipt Schema(s)
**Two receipt schemas exist with different goals:**
- `VerificationReceipt` (shared/receipt.ts) is a canonical proof for verification tasks with score, verdict, evidence bundle, chain context, etc. It is not wired to API endpoints yet.
- `MMVReceipt` (shared/types.ts) is used by the MMV gating flow and scores are on a 0–100 scale, later converted to basis points in `VerifiedOutputRecord`.
  - `VerificationReceipt` schema is defined with `score_bps` and `bundle_hash`/`bundle_uri` references.【F:shared/receipt.ts†L22-L158】
  - `MMVReceipt` schema uses `decision.overall_score` (0–100) and `selected_output_hash` for gating receipts.【F:shared/types.ts†L517-L615】
  - `VerifiedOutputRecord` converts `overall_score * 100` to bps, indicating different unit expectations across schemas.【F:shared/verifiedOutput.ts†L180-L220】

**Gating receipt mismatch vs spec:**
- The proof-of-verification spec defines a `GatableReceipt` that includes `chain_id`, `verifier_signatures`, and `evidence_bundle_hash`, but no matching implementation exists in contracts or API.
  - Spec-only receipt format in docs.【F:docs/PROOF_OF_VERIFICATION_SPEC.md†L330-L401】
  - No receipt verifier contract exists in `contracts/` (no implementation of the documented interface).

### 1.3 API/SDK Surface Drift (Task ID vs Job ID)
- `/api/verify` endpoints use **jobId** and return `status: 'pending'`, while `/v1/verify` and `/v1/tasks/:taskId` return **task_id** and standard status values.
  - `/api/verify` returns `jobId` and status `pending`.【F:api/src/routes/verify.ts†L130-L199】
  - `/v1/verify` and `/v1/tasks` return `task_id` and normalized statuses (`queued`, `running`, `finalized`).【F:api/src/routes/v1/verify.ts†L137-L220】【F:api/src/routes/v1/tasks.ts†L17-L70】
  - Docs still reference `/api/verify/:jobId` patterns, creating integration ambiguity.【F:docs/ARCHITECTURE.md†L94-L132】

**Severity:** **P1** (Schema drift increases risk of downstream mismatches, signature failures, and audit inconsistency.)

---

## 2) Hashing + Canonicalization Consistency
### 2.1 Canonical JSON
- Canonicalization uses deep key sorting and deterministic JSON for hashing (`hashCanonical`), which is used for receipt hashes and evidence bundle hashes.
  - Canonical JSON implementation and keccak hashing.【F:shared/canonicalJson.ts†L1-L45】
  - Receipt hash uses `hashCanonical` over normalized fields.【F:shared/receipt.ts†L178-L239】
  - Evidence bundle hash uses `hashCanonical` over the bundle without signatures.【F:verifier-node/src/evidence/evidenceBundlerV2.ts†L292-L306】

**Docs confirm the same hashing rule** for MMV integration (deep-sorted canonical JSON with 0x-prefixed keccak).【F:docs/mmv-integration.md†L54-L63】

### 2.2 Commit Hash Derivation
- The verifier-node uses `computeCommitHash` with Solidity packed encoding to compute commit hashes; the on-chain marketplace uses `keccak256(abi.encodePacked(...))` with the same field order.
  - Off-chain commit hash derivation.【F:shared/commitHash.ts†L1-L19】
  - On-chain commit hash check.【F:contracts/contracts/VerificationMarketplace.sol†L205-L231】

**Severity:** **P2** (Hashing is consistent, but depends on shared assumptions about task ID formatting.)

### 2.3 Evidence Integrity (CID vs Content)
- IPFS v2 retrieval does **not verify that the CID matches the bundle content**. It only checks required fields and explicitly notes that CID verification is not implemented.
  - `verifyBundleIntegrity` is structural only and notes CID verification is TODO.【F:verifier-node/src/evidence/ipfsStorageV2.ts†L300-L357】
- v1 IPFS storage does not verify bundle hash vs content at all.
  - v1 IPFS upload and retrieval lack content hash checks.【F:verifier-node/src/evidence/ipfsStorage.ts†L20-L88】

**Severity:** **P0** for incentives/gating (content-addressability and evidence integrity are prerequisites).

---

## 3) Blockchain Contract Integration Correctness
### 3.1 ABI ↔ Solidity
- The ABI used by API and verifier-node matches the on-chain `VerifierMarketplace` contract (createTask, commitEvaluation, revealEvaluation, events).
  - ABI definitions for create/commit/reveal match the contract signature types.【F:shared/abi/VerifierMarketplace.json†L1-L76】
  - Contract definitions align with ABI usage in API and verifier-node services.【F:contracts/contracts/VerificationMarketplace.sol†L120-L235】【F:api/src/services/blockchain.ts†L45-L133】【F:verifier-node/src/services/blockchain.ts†L27-L114】

### 3.2 Coherence Gaps in Solidity
- `VerificationMarketplace` contains explicit TODOs to migrate to canonical types and hashing, indicating known drift from `VerifierHash` and bytes32 task IDs.
  - Contract TODOs on canonical types and bytes32 task IDs.【F:contracts/contracts/VerificationMarketplace.sol†L10-L28】

**Severity:** **P1** (Known drift increases risk of incentive/gating tool mismatch.)

---

## 4) Incentives Readiness (Mining / Points / Tokenomics Feasibility)
### 4.1 Verifier Identity & Accountability
- Verifier identity is currently tied to:
  - **On-chain evaluator address** (commit/reveal uses `msg.sender`).【F:contracts/contracts/VerificationMarketplace.sol†L179-L235】
  - **EIP-712 bundle signature** in evidence bundles (`bundle_sig_eip712` over `BundleEIP712Message`).【F:shared/types.ts†L422-L456】【F:verifier-node/src/evidence/evidenceBundlerV2.ts†L317-L405】

### 4.2 What Can Be Reliably Measured Today
- **Participation and reveal compliance** can be derived from on-chain events (`Committed`, `Revealed`, `Finalized`).【F:contracts/contracts/VerificationMarketplace.sol†L90-L237】
- **Score proximity to consensus** is available in the contract and tracked in on-chain counters (`accurateEvaluations`, `totalEvaluations`).【F:contracts/contracts/VerificationMarketplace.sol†L58-L90】

### 4.3 Missing Prerequisites for Safe Incentives
- **Dispute/adjudication signals** are not wired into API or verifier-node flows; incentives that rely on accuracy beyond median consensus lack on-chain ground truth.
  - Marketplace exposes dispute-related events and state transitions, but no API or node integration exists to drive them.【F:contracts/contracts/VerificationMarketplace.sol†L88-L121】
- **Stake/slashing enforcement** is not coupled to commit/reveal participation; commitEvaluation only requires a bond transfer, not stake verification.
  - Commit only transfers bond from evaluator, no stake enforcement shown.【F:contracts/contracts/VerificationMarketplace.sol†L179-L191】
- **Sybil and farming controls** are minimal at the protocol surface (no stake gating, rate limits, or identity binding beyond an address).
  - Evaluators are purely address-based with no registry check in the marketplace contract.【F:contracts/contracts/VerificationMarketplace.sol†L179-L191】

### 4.4 Feasibility Phases (Readiness Assessment)
- **Phase 1: Points/Reputation**
  - **Feasible with caution** using on-chain participation + reveal + consensus proximity. Needs explicit data export and stable schemas for downstream usage.
- **Phase 2: Stake + Slashing**
  - **Not ready**: stake verification and dispute adjudication signals are not wired to marketplace commit/reveal or API workflows.
- **Phase 3: Emissions**
  - **Not ready**: requires finalized, dispute-aware correctness signal and anti-farming controls.

---

## 5) Forced Verification Readiness (Gating)
### 5.1 SDK/OpenAPI vs API Implementation
- SDK expects `/api/mmv/tasks/:taskId/receipt` and `/api/mmv/tasks/:taskId/receipt/verify`, but API routes do **not** implement these endpoints.
  - SDK client uses receipt endpoints for `getReceipt` and `verifyReceiptOnChain`.【F:packages/sdk-js/src/client.ts†L103-L171】
  - OpenAPI documents receipt endpoints as supported.【F:openapi.yaml†L189-L260】
  - API routes implement `/api/mmv/verify`, `/api/mmv/guard`, `/api/mmv/tasks/:taskId/record`, `/api/mmv/records`, `/api/mmv/tasks/:taskId/verify` only.【F:api/src/routes/mmv.ts†L15-L230】

### 5.2 Contract-Level Receipt Verification
- The proof-of-verification spec defines an on-chain receipt verifier interface, but no contract implementation exists in the repo.
  - Doc-only interface and gating workflow (not implemented in Solidity).【F:docs/PROOF_OF_VERIFICATION_SPEC.md†L300-L381】

### 5.3 Security Pitfalls for Forced Verification
- **Trusting API DB vs on-chain**: current SDK paths rely on API responses without a canonical receipt endpoint, forcing users to trust API output without an on-chain receipt verification contract.
- **Replay / stale receipt risk**: receipts are not consistently tied to chain context; `VerificationReceipt` supports `chain_context`, but the receipt is not served by API routes.
  - Receipt schema includes optional chain context and signature, but API does not surface it yet.【F:shared/receipt.ts†L106-L140】【F:api/src/routes/mmv.ts†L15-L230】

**Recommended Modes (warn/label/block):**
- **Warn**: API-only receipts (no chain context) — suitable for UI labels only.
- **Label**: Receipts verified against on-chain events with bundle hash match (via a dedicated endpoint).
- **Block**: Require on-chain receipt verification (once ReceiptVerifier contract is implemented and backed by dispute-aware correctness).

---

## 6) Data Availability & Evidence Integrity
- Evidence bundles are uploaded to IPFS and sometimes locally stored, but **content address verification is not enforced**.
  - v1 IPFS storage uses raw JSON without content verification.【F:verifier-node/src/evidence/ipfsStorage.ts†L20-L88】
  - v2 storage verifies only required fields; CID verification is not implemented.【F:verifier-node/src/evidence/ipfsStorageV2.ts†L300-L357】
- Multiple gateway checks exist in v2, but they only prove availability at time of fetch, not content correctness.
  - Gateway availability checks are best-effort.【F:verifier-node/src/evidence/ipfsStorageV2.ts†L131-L204】

**Risk:** Evidence loss or tampering undermines incentives (rewarding unverifiable work) and gating (accepting unverifiable receipts).

---

## 7) Developer Experience & Integration Surface
- **OpenAPI and SDK imply features that the API does not implement** (receipt endpoints). This creates integration pitfalls for forced verification.
  - OpenAPI includes receipt endpoints.【F:openapi.yaml†L189-L260】
  - SDK calls those endpoints directly.【F:packages/sdk-js/src/client.ts†L103-L171】
  - API lacks those routes.【F:api/src/routes/mmv.ts†L15-L230】
- **Two parallel API surfaces (`/api/*` vs `/v1/*`)** with mismatched schemas (jobId vs task_id) increase integration complexity for incentives and gating.
  - `/api/verify` returns jobId and status `pending`.【F:api/src/routes/verify.ts†L130-L199】
  - `/v1/verify` returns task_id and standard status set. 【F:api/src/routes/v1/verify.ts†L137-L220】

---

# Prioritized Remediation Plan

## P0 (Blockers for Incentives & Forced Verification)
1) **Evidence integrity verification**
   - Implement deterministic bundle hash verification against content (keccak of canonical JSON) and bind it to the stored URI/CID.
   - Files: `verifier-node/src/evidence/ipfsStorage.ts`, `verifier-node/src/evidence/ipfsStorageV2.ts`, `shared/onchainVerify.ts`.
2) **Receipt API endpoints**
   - Implement `/api/mmv/tasks/:taskId/receipt` and `/api/mmv/tasks/:taskId/receipt/verify` using `shared/receipt.ts` and `shared/onchainVerify.ts`.
   - Files: `api/src/routes/mmv.ts`, `api/src/services/recordsService.ts`, `shared/receipt.ts`, `shared/onchainVerify.ts`.
3) **Receipt verification contract**
   - Add on-chain receipt verification contract (as specified in docs) or clearly remove/flag the feature in docs/SDK until implemented.
   - Files: `contracts/contracts/` (new), `docs/PROOF_OF_VERIFICATION_SPEC.md`, `packages/sdk-js/src/client.ts`.

## P1 (High Priority)
1) **Schema unification across surfaces**
   - Standardize `task_id` vs `jobId` across `/api/*`, `/v1/*`, docs, and SDK.
   - Files: `api/src/routes/verify.ts`, `api/src/routes/v1/verify.ts`, `packages/sdk-js/src/client.ts`, `docs/ARCHITECTURE.md`.
2) **Task ID type normalization**
   - Define a canonical task ID representation (uint256 decimal string vs bytes32 hex) and enforce it in evidence bundles and receipts.
   - Files: `shared/types.ts`, `verifier-node/src/evidence/evidenceBundlerV2.ts`, `docs/ARCHITECTURE.md`.
3) **Explicit receipt schema selection**
   - Clarify when `VerificationReceipt` vs `MMVReceipt` applies and provide explicit versioning in API responses.
   - Files: `shared/receipt.ts`, `shared/types.ts`, `api/src/routes/mmv.ts`, `docs/INTEGRATION.md`.

## P2 (Medium Priority)
1) **Marketplace contract coherence**
   - Complete TODOs to migrate to canonical `VerifierHash` and bytes32 task IDs (or document why not).
   - Files: `contracts/contracts/VerificationMarketplace.sol`, `contracts/contracts/libraries/VerifierHash.sol`.
2) **Upgrade docs for bundle v0.2**
   - Update architecture and integration docs to show v0.2 as default bundle version and include new fields.
   - Files: `docs/ARCHITECTURE.md`, `docs/AUDITOR_DUTIES.md`.
3) **Add API-supported export endpoints**
   - Provide an audit pack endpoint (receipt + bundle + chain context) for downstream apps.
   - Files: `api/src/routes/mmv.ts`, `openapi.yaml`, `packages/sdk-js/src/client.ts`.

---

## Optional Minimal Fixes (P0 Only)
No P0 changes are applied in this report. The audit focuses on findings and remediation planning only.
