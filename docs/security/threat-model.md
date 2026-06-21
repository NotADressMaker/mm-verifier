# Threat Model

This document enumerates the concrete threats MAMV defends against, the specific components impacted, and which mitigations are **implemented** vs **planned**. It also includes validation checks, residual risk, and out-of-scope items.

## Scope

**In scope:**
- On-chain verification and dispute workflow (`contracts/`)
- Verifier-node, auditor tooling, and evidence bundles (`verifier-node/`, `programs/`, `shared/`)
- API, storage, and evidence publication (`api/`, `shared/`, `docs/`)

**Out of scope:**
- LLM provider internal weights, data center compromises, or undisclosed model changes beyond published commitments.
- Inference-time side-channel attacks against third-party providers.
- User-side malware or compromised client machines.

## System Overview & Trust Boundaries

```
User
  |
  v
API  ---> verifier-node ---> evidence store (IPFS/Arweave/DB)
  |              |                    |
  |              v                    v
  |          evidence hash      evidence bundle URI
  |              |                    |
  v              v                    v
Chain <----- disputes/commitments ---- auditors
```

**Trust boundaries:**
- Off-chain evidence storage is *integrity-protected* via on-chain hashes, but availability depends on storage providers.
- Auditor selection relies on VRF when enabled; deterministic fallback is a testing/contingency mode.
- Verifier nodes and auditors are assumed to manage keys securely.

## Security Assumptions

- **Chain finality:** MAMV assumes finality based on Arbitrum/ETH reorg depth. Chain finality liveness assumptions are required for dispute windows and slashing payouts.
- **VRF / oracle assumptions:** Chainlink VRF (when enabled) is assumed to provide unbiased randomness; deterministic fallback is not adversarially secure and is intended for test/emergency use.
- **Storage assumptions:** IPFS/Arweave/DB storage is assumed to be *tamper-evident* (hash-checked) but not necessarily durable or censorship-resistant.
- **Key management:** Verifiers and auditors must protect private keys and avoid key reuse across environments.

---

## Threat 1: Malicious Verifier Submits Fabricated Evidence

**Summary**
A verifier submits a fabricated evidence bundle or falsifies model output metadata to improve score or evade accountability.

**Affected Components**
- `verifier-node/` (evidence bundling)
- `shared/` (hashing + schema validation)
- `contracts/BundleRegistry.sol`, `contracts/DisputeLadder.sol`

**Attack Preconditions & Capabilities**
- Verifier controls its node and can craft evidence bundles.
- Verifier can submit bundle commitments on-chain.

**Impact**
- **Integrity:** Incorrect verification results accepted.
- **Economics:** Verifier avoids slashing and earns rewards.
- **Privacy:** Potential exposure of fabricated/unauthorized data.

**Attack Narrative (step-by-step)**
1. Verifier fabricates an evidence bundle off-chain.
2. Verifier commits a hash/URI on-chain that does not match the underlying content.
3. Verifier relies on the lack of checks or audit participation to avoid detection.

**Detection Signals / Observables**
- Evidence bundle hash mismatch with on-chain commitments.
- Missing/invalid schema fields in evidence bundle.
- Divergence between verifier metadata and auditor re-runs.

**Mitigations**
- **Implemented:**
  - On-chain evidence hash commitments enforced in disputes (bundle hash + URI hash). (`contracts/BundleRegistry.sol`, `contracts/DisputeLadder.sol`)
  - Evidence schema validation in verifier-node and program registry (`shared/schemas`, `programs/registry.ts`).
- **Planned:**
  - Optional TEE-based bundle attestations to harden against verifier tampering.

**How to Verify Implemented**
- Confirm `DisputeLadder.submitEvidence` enforces evidence hash/URI commitments.
- Verify `hashEvidenceBundle` usage and schema validation in `programs/registry.ts`.

**Residual Risk**
- A malicious verifier could still fabricate evidence if no disputes are opened or auditors fail to participate.

---

## Threat 2: Bribed Auditors / Collusive Jury

**Summary**
Auditors accept bribes or collude to vote in favor of an incorrect verifier outcome.

**Affected Components**
- `contracts/DisputeLadder.sol`
- `contracts/AuditorRegistry.sol`
- Auditor CLI (`verifier-node/src/cli/auditor.ts`)

**Attack Preconditions & Capabilities**
- Attacker can pay/bribe auditors or control enough auditor keys.
- Jury selection is not sufficiently large or diverse for the dispute level.

**Impact**
- **Integrity:** Incorrect dispute outcomes.
- **Economics:** Honest challenger or verifier is unfairly slashed.
- **Availability:** Dispute resolution becomes less trustworthy.

**Attack Narrative**
1. Challenger opens a dispute against an incorrect verifier.
2. An attacker bribes enough auditors to reach quorum.
3. Auditors submit dishonest votes to protect the verifier.

**Detection Signals / Observables**
- Auditor votes consistently deviate from program outputs.
- High rate of disputes resolved against majority evidence.
- Reputation trends for specific auditors drop in registry.

**Mitigations**
- **Implemented:**
  - Bonded disputes with economic penalties (loser loses bond; jurors paid from pool).
  - Multi-juror selection with VRF when enabled; deterministic fallback for tests.
  - Auditor staking + reputation updates (`AuditorRegistry.sol`).
- **Planned:**
  - Larger juries on higher-stakes appeals.
  - Randomized audit programs or spot checks by independent auditors.

**How to Verify Implemented**
- Inspect `DisputeLadder.appeal` and `DisputeLadder.finalize` for bond handling.
- Confirm juror selection and reward distribution in `DisputeLadder`.

**Residual Risk**
- Bribery can still occur if the economic reward outweighs the slashing risk.

---

## Threat 3: Colluding LLM Providers / Model Consistency Attacks

**Summary**
Multiple LLM providers coordinate to return consistent but incorrect outputs, undermining multi-LLM checks.

**Affected Components**
- `verifier-node/` provider integrations
- `programs/` verification logic
- `shared/transparency.ts` (model commitments)

**Attack Preconditions & Capabilities**
- Multiple providers (or a single controlling party) can coordinate outputs.
- Verification programs rely on provider diversity for correctness.

**Impact**
- **Integrity:** False consensus scores.
- **Economics:** Verifiers earn rewards despite incorrect outcomes.

**Attack Narrative**
1. Colluding providers agree on a fabricated answer.
2. Verifier-node collects consistent outputs and produces a high score.
3. Evidence bundle appears consistent despite being incorrect.

**Detection Signals / Observables**
- Low diversity of model commitments for independent tasks.
- Correlated outputs across providers.
- External auditor reruns producing different evidence.

**Mitigations**
- **Implemented:**
  - Model commitment hashes and provenance metadata (`shared/transparency.ts`).
  - Multi-provider evidence bundles with provenance sections.
- **Planned:**
  - Provider diversity requirements, configurable per verification program.
  - External oracle cross-checks for critical tasks.

**How to Verify Implemented**
- Confirm evidence bundle includes model commitments and provenance.

**Residual Risk**
- Collusion remains possible if all providers are controlled or compromised.

---

## Threat 4: Prompt/Data Exfiltration via Evidence Bundles

**Summary**
Sensitive prompt or data is exfiltrated through evidence bundles or audit logs.

**Affected Components**
- `verifier-node/` evidence bundling
- `shared/` transparency commitments
- `api/` storage of bundles

**Attack Preconditions & Capabilities**
- Verifier or API has access to raw prompts/outputs.
- Evidence bundle policy allows inclusion of raw content.

**Impact**
- **Privacy:** Leakage of sensitive prompts or proprietary data.
- **Compliance:** Potential violations of data handling requirements.

**Attack Narrative**
1. Verifier includes sensitive raw inputs in evidence bundle.
2. Evidence is stored on IPFS/Arweave or DB.
3. Third parties retrieve data via bundle URI.

**Detection Signals / Observables**
- Evidence bundles contain raw content instead of hash commitments.
- Bundle URI exposes sensitive data publicly.

**Mitigations**
- **Implemented:**
  - Hash-based commitments for reasoning traces and model inputs/outputs (`shared/transparency.ts`).
  - Evidence bundle schema supports content hashes + optional URIs.
- **Planned:**
  - Encrypted evidence bundle storage with per-auditor access controls.
  - PII scrubbing policies in verifier-node.

**How to Verify Implemented**
- Check evidence bundle schema for hash-only reasoning commitments.
- Inspect bundling code for hashing before storage.

**Residual Risk**
- Verifier nodes can still include sensitive content unless policy enforcement is stricter.

---

## Threat 5: Answer Copying / Plagiarism / Response Laundering

**Summary**
A verifier copies another model’s response, or reuses a prior bundle to launder results.

**Affected Components**
- `shared/programs.ts` (program hashing)
- `programs/` (verification logic)
- `contracts/BundleRegistry.sol`

**Attack Preconditions & Capabilities**
- Attacker can access previous evidence bundles or responses.
- Programs do not detect duplication or replay across tasks.

**Impact**
- **Integrity:** Stale or copied outputs pass as valid.
- **Economics:** Incentives skewed toward lazy or malicious verifiers.

**Attack Narrative**
1. Verifier reuses a prior response or bundle.
2. Submits evidence bundle with slight modifications.
3. Attempts to claim credit for originality or correctness.

**Detection Signals / Observables**
- Duplicate bundle hashes across tasks.
- Program hash mismatches or missing program commitments.
- Evidence bundles with reused response hashes.

**Mitigations**
- **Implemented:**
  - Program hash commitments and evidence hashing (`shared/programs.ts`, `BundleRegistry.sol`).
  - Receipt hashes tied to evidence bundle and task data (`shared/receipt.ts`).
- **Planned:**
  - Cross-task bundle hash registry alerts.
  - Similarity analysis and plagiarism checks in programs.

**How to Verify Implemented**
- Confirm program hashes are computed deterministically and stored in receipts.

**Residual Risk**
- Copying may still succeed if challenge volume is low or auditors fail to detect reuse.

---

## Threat 6: Censorship or Availability Attacks on Disputes

**Summary**
Attackers attempt to block disputes or prevent evidence availability.

**Affected Components**
- `contracts/DisputeLadder.sol`
- Evidence storage (IPFS/Arweave/DB)
- Auditor CLI and API access

**Attack Preconditions & Capabilities**
- Adversary can censor or throttle evidence distribution.
- Storage providers fail or delete data.

**Impact**
- **Availability:** Dispute resolution stalls or defaults.
- **Integrity:** Missing evidence can bias dispute outcomes.

**Attack Narrative**
1. Attacker prevents evidence bundles from being available.
2. Challenger cannot provide evidence in time.
3. Dispute stalls or resolves incorrectly.

**Detection Signals / Observables**
- Evidence fetch failures or missing bundle URIs.
- Dispute response deadlines missed.
- Dispute rounds stuck in evidence phase.

**Mitigations**
- **Implemented:**
  - Evidence commitment checks on-chain (hash + URI hash).
  - Configurable response and appeal windows.
- **Planned:**
  - Multi-storage replication and pinning services.
  - Automated alerts for evidence fetch failures.

**How to Verify Implemented**
- Confirm `responseWindow` and `challengeWindow` exist in `DisputeLadder.sol`.

**Residual Risk**
- Storage availability depends on external providers; on-chain commitments only detect tampering.

---

## Abuse Cases (Explicit)

- Verifiers can self-verify without opening disputes; system relies on challengers.
- Auditors can abstain; low audit participation reduces deterrence.
- Proof-of-correctness is probabilistic unless cryptographic proofs (TEE/ZK) are enabled.

## What We Explicitly Do NOT Protect Against

- Model providers lying about model internals or training data.
- Client-side malware or compromised user machines.
- Attacks requiring network-level censorship beyond MAMV’s control.

## Implementation Checks (Quick List)

- `DisputeLadder.submitEvidence` enforces evidence hash + URI hash commitments.
- `DisputeLadder.appeal` enforces appeal window and higher bond.
- `AuditorRegistry` enforces staking and reputation updates.
- `programs/registry.ts` enforces schema validation and program hash checks.
