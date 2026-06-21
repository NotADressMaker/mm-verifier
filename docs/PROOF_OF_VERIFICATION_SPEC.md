# MAMV: Proof of Verification Design Specification

## Executive Summary

This document proposes a design for two interconnected mechanisms in MAMV:

1. **Proof of Verification (PoV)**: A system where verifiers earn rewards (tokens or points) for performing AI output verification work, with accuracy-based incentives and penalties for misbehavior.

2. **Forced Verification**: A gating mechanism where applications and AI agents would be required to attach valid MAMV verification receipts to AI outputs before those outputs can be consumed or acted upon.

These mechanisms aim to create economic incentives for honest verification and make verification a default trust requirement rather than an optional add-on. This specification provides concrete implementation paths for both a minimal MVP (off-chain points) and a full protocol version (on-chain token).

**Important limitations**: AI correctness cannot be proven cryptographically—it remains probabilistic. MAMV provides economic and consensus-based assurance, not mathematical certainty. The system proves that verification *occurred* and *what the outcome was*, not that the AI output is objectively "true."

---

## Section 1: Architecture

### 1.1 Goals

- Incentivize verifiers to perform accurate, timely verification work
- Penalize dishonest, low-quality, or non-revealed verifications
- Create a sustainable economic loop where verification demand funds verification supply
- Enable applications to require verification as a precondition for using AI outputs
- Maintain privacy by storing hashes and URIs on-chain, not raw content

### 1.2 Non-Goals

- Proving AI outputs are objectively "correct" (this is not possible)
- Replacing human judgment for high-stakes decisions
- Storing raw prompts, outputs, or chain-of-thought on-chain
- Creating speculative token dynamics disconnected from utility
- Competing with or replacing Ethereum's base layer functionality

### 1.3 System Model

#### Actors

| Actor | Role | Assets |
|-------|------|--------|
| **Submitter** | Requests verification of an AI output | Pays fees (ETH or tokens); receives receipt |
| **Verifier** | Evaluates AI outputs using LLM ensemble | Stakes collateral; earns rewards or faces slashing |
| **Consumer** | Application, agent, or smart contract that uses AI outputs | Requires valid receipt to proceed |
| **Auditor** | Selected (via VRF) to adjudicate disputes | Earns audit fees; faces slashing for collusion |
| **Protocol** | Smart contracts + off-chain infrastructure | Collects fees; distributes rewards; burns tokens (if applicable) |

#### Assets

| Asset | Description |
|-------|-------------|
| **Verification Receipt** | Canonical proof that verification occurred; includes task_id, input_hash, output_hash, score_bps, verdict, signatures |
| **Stake** | Collateral locked by verifiers; subject to slashing |
| **Reward Points / Tokens** | Earned for honest verification work |
| **Reputation Score** | Non-transferable metric tracking verifier accuracy over time |

#### Flow: Verification Lifecycle

```
┌─────────────┐     submit job      ┌─────────────┐
│  Submitter  │ ──────────────────► │   API       │
└─────────────┘     + fee           └──────┬──────┘
                                           │
                                           ▼
                                    ┌─────────────┐
                                    │  Job Queue  │
                                    └──────┬──────┘
                                           │ assign
                                           ▼
                                    ┌─────────────┐
                                    │  Verifier   │ ◄─── staked
                                    │    Node     │
                                    └──────┬──────┘
                                           │
                              ┌────────────┴────────────┐
                              ▼                         ▼
                       ┌───────────┐             ┌───────────┐
                       │  Commit   │             │  Reveal   │
                       │  (hash)   │             │ (evidence)│
                       └─────┬─────┘             └─────┬─────┘
                             │                         │
                             ▼                         ▼
                       ┌───────────────────────────────────┐
                       │     VerificationMarketplace       │
                       │  (Revealed / Finalized events)    │
                       └───────────────┬───────────────────┘
                                       │
                                       ▼
                       ┌───────────────────────────────────┐
                       │      Verification Receipt         │
                       │  (task_id, hashes, score, sigs)   │
                       └───────────────┬───────────────────┘
                                       │
                          ┌────────────┴────────────┐
                          ▼                         ▼
                   ┌─────────────┐          ┌─────────────┐
                   │  Submitter  │          │  Consumer   │
                   │  (result)   │          │  (gating)   │
                   └─────────────┘          └─────────────┘
```

---

## Section 2: Tokenomics / Points Economy

### 2.1 Two Variants

| Aspect | Variant 1: Points (MVP) | Variant 2: Token (Protocol) |
|--------|-------------------------|----------------------------|
| Reward unit | Off-chain points in database | On-chain MAMV token (ERC-20) |
| Staking | ETH only | MAMV token (with ETH fallback) |
| Slashing | ETH slashed | MAMV token slashed |
| Transferability | Non-transferable | Transferable |
| Governance | None | Token-weighted voting |
| Fee payment | ETH | MAMV token (or ETH converted) |

### 2.2 Issuance Model (Tokenized Variant)

**Initial supply**: Fixed cap (e.g., 1,000,000,000 MAMV)

**Emission schedule**:
- Verification rewards: 40% of supply, emitted over 10 years with halving every 2 years
- Protocol treasury: 20% (for development, grants, audits)
- Initial contributors: 15% (4-year vesting, 1-year cliff)
- Ecosystem incentives: 15% (integrator grants, bug bounties)
- Reserve: 10% (emergency fund, future needs)

**Emission per verification**:
```
base_reward = current_epoch_emission / total_verifications_in_epoch
actual_reward = base_reward * quality_multiplier * difficulty_factor
```

### 2.3 Fee Structure

| Fee Type | Amount | Distribution |
|----------|--------|--------------|
| Verification fee | Set by submitter (min floor) | 70% to verifier, 20% to protocol, 10% burned |
| Dispute fee | 2x verification fee | Winner takes loser's stake + fee |
| Audit fee | Paid from dispute loser's stake | Split among auditor committee |

### 2.4 Staking and Slashing

**Minimum stake**: 0.1 ETH (or equivalent MAMV tokens)

**Stake tiers** (higher stake = priority job assignment):
| Tier | Stake | Job Priority | Max Concurrent Jobs |
|------|-------|--------------|---------------------|
| Bronze | 0.1 ETH | Low | 5 |
| Silver | 1 ETH | Medium | 20 |
| Gold | 10 ETH | High | 100 |
| Platinum | 100 ETH | Highest | Unlimited |

**Slashing conditions**:
| Offense | Slash Amount | Detection Method |
|---------|--------------|------------------|
| Non-reveal (commit but no reveal) | 100% of job stake | Timeout (reveal window expires) |
| Revealed evaluation contradicts finalized consensus | 10-50% based on deviation | Comparison with final score |
| Proven collusion (multiple verifiers, same incorrect answer) | 100% + ban | Statistical analysis + dispute |
| Failure to participate when assigned | 5% per missed job | Liveness monitoring |

### 2.5 Quality Multiplier

"Accuracy" in AI verification is measured by **consensus alignment**, not objective truth:

```typescript
quality_multiplier = calculate_quality_multiplier(
  verifier_score: number,      // This verifier's score_bps
  final_score: number,         // Consensus score after all verifiers
  historical_accuracy: number  // Verifier's 30-day accuracy rate
): number {
  // Deviation from consensus (0 = perfect alignment)
  const deviation = Math.abs(verifier_score - final_score) / 10000;

  // Base multiplier: 1.0 for exact match, decreasing with deviation
  const base = Math.max(0.1, 1.0 - (deviation * 2));

  // Historical bonus: up to 1.5x for consistent accuracy
  const history_bonus = 1.0 + (historical_accuracy * 0.5);

  return base * history_bonus;
}
```

**Multiplier ranges**:
- Exact consensus match + high history: 1.5x rewards
- Close to consensus (within 5%): 1.0x rewards
- Moderate deviation (5-15%): 0.5x rewards
- Large deviation (>15%): 0.1x rewards + reputation penalty

### 2.6 Difficulty Adjustment

As more verifiers join, the system would adjust to maintain economic sustainability:

```typescript
interface DifficultyParameters {
  target_verifications_per_epoch: number;  // e.g., 10,000/day
  actual_verifications: number;
  adjustment_factor: number;               // 0.5 = halve, 2.0 = double
}

function adjust_difficulty(params: DifficultyParameters): number {
  const ratio = params.actual_verifications / params.target_verifications_per_epoch;

  if (ratio > 1.2) {
    // Too many verifications: reduce rewards per verification
    return params.adjustment_factor * 0.9;
  } else if (ratio < 0.8) {
    // Too few verifications: increase rewards per verification
    return params.adjustment_factor * 1.1;
  }
  return params.adjustment_factor;
}
```

**Operational meaning**:
- High demand + few verifiers = higher rewards per job = attracts verifiers
- Low demand + many verifiers = lower rewards per job = verifiers seek other work
- Equilibrium forms where rewards match opportunity cost of running verifier nodes

### 2.7 Parameter Defaults

| Parameter | Default | Rationale |
|-----------|---------|-----------|
| `MIN_VERIFIERS_PER_JOB` | 3 | Byzantine fault tolerance (can tolerate 1 bad actor) |
| `QUORUM_BPS` | 6667 (66.67%) | 2/3 majority for consensus |
| `WORTHY_MIN_BPS` | 8000 (80%) | High confidence threshold |
| `REVEAL_WINDOW_SECONDS` | 300 (5 min) | Balance speed vs. verifier availability |
| `DISPUTE_WINDOW_SECONDS` | 86400 (24 hr) | Allow time for dispute submission |
| `MIN_STAKE_ETH` | 0.1 | Low barrier to entry |
| `SLASH_NON_REVEAL_BPS` | 10000 (100%) | Strong deterrent for abandonment |
| `SLASH_DEVIATION_BASE_BPS` | 1000 (10%) | Proportional to deviation severity |
| `REWARD_PROTOCOL_FEE_BPS` | 2000 (20%) | Sustainable protocol revenue |
| `REWARD_BURN_BPS` | 1000 (10%) | Deflationary pressure (tokenized only) |

---

## Section 3: Forced Verification

### 3.1 Concept

"Forced verification" means that AI outputs would not be accepted by downstream systems unless accompanied by a valid MAMV verification receipt. This shifts verification from opt-in to default.

### 3.2 Off-Chain Gating (API Middleware)

Applications would use middleware that intercepts AI outputs and validates receipts:

```typescript
// Middleware pattern
interface GatingMiddleware {
  // Validates receipt before allowing output to proceed
  validateReceipt(receipt: VerificationReceipt): GatingResult;

  // Policy: what score threshold is required?
  policy: GatingPolicy;
}

interface GatingPolicy {
  min_score_bps: number;           // e.g., 8000 = 80%
  required_verifier_count: number; // e.g., 3
  max_receipt_age_seconds: number; // e.g., 3600 = 1 hour
  allowed_programs?: string[];     // Optional: only accept specific verification programs
}

interface GatingResult {
  allowed: boolean;
  reason?: string;
  receipt_id?: string;
}
```

**Integration pattern**:
```typescript
// In application code
import { MMVGate } from '@mamv/sdk';

const gate = new MMVGate({
  policy: { min_score_bps: 8000, required_verifier_count: 3 }
});

async function handleAIOutput(output: string, receipt: VerificationReceipt) {
  const result = await gate.validate(receipt);

  if (!result.allowed) {
    throw new Error(`Output blocked: ${result.reason}`);
  }

  // Proceed with output
  return processOutput(output);
}
```

### 3.3 On-Chain Gating (Smart Contract)

For on-chain agents or DeFi protocols that consume AI outputs:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IMAMVReceiptVerifier {
    struct ReceiptProof {
        bytes32 taskId;
        bytes32 inputHash;
        bytes32 outputHash;
        uint16 scoreBps;
        bool verdict;
        bytes[] verifierSignatures;
        bytes32 evidenceBundleHash;
    }

    function verifyReceipt(
        ReceiptProof calldata proof,
        uint16 minScoreBps,
        uint8 minVerifiers
    ) external view returns (bool valid);

    function isVerifierRegistered(address verifier) external view returns (bool);
}

// Example: AI-gated contract
contract AIGatedAction {
    IMAMVReceiptVerifier public immutable receiptVerifier;
    uint16 public constant MIN_SCORE = 8000; // 80%
    uint8 public constant MIN_VERIFIERS = 3;

    modifier requiresVerification(IMAMVReceiptVerifier.ReceiptProof calldata proof) {
        require(
            receiptVerifier.verifyReceipt(proof, MIN_SCORE, MIN_VERIFIERS),
            "Invalid or insufficient verification"
        );
        _;
    }

    function executeWithAI(
        bytes calldata aiOutput,
        IMAMVReceiptVerifier.ReceiptProof calldata proof
    ) external requiresVerification(proof) {
        // Only executes if receipt is valid
        _processOutput(aiOutput);
    }
}
```

### 3.4 Receipt Format for Gating

```typescript
interface GatableReceipt {
  // Core identification
  receipt_version: '1.0';
  task_id: string;
  chain_id: number;

  // Content hashes (no raw content)
  input_hash: `0x${string}`;
  output_hash: `0x${string}`;

  // Verification outcome
  score_bps: number;
  verdict: boolean;
  worthy: boolean;

  // Verifier attestations
  verifier_signatures: Array<{
    verifier_address: `0x${string}`;
    signature: `0x${string}`;  // EIP-712 signature
    score_bps: number;
  }>;

  // Timing
  finalized_at: number;
  expires_at?: number;  // Optional expiry for time-sensitive verifications

  // Evidence reference (not content)
  evidence_bundle_hash: `0x${string}`;
  evidence_uri: string;

  // Program reference
  program_fingerprint?: string;
}
```

### 3.5 SDK Helpers for Integration

```typescript
// @mamv/sdk exports
export class MAMVClient {
  // Submit job and wait for receipt
  async verifyAndWait(input: string, output: string, options?: VerifyOptions): Promise<GatableReceipt>;

  // Validate existing receipt
  async validateReceipt(receipt: GatableReceipt, policy: GatingPolicy): Promise<GatingResult>;

  // Verify receipt signatures on-chain (read-only)
  async verifyReceiptOnChain(receipt: GatableReceipt): Promise<boolean>;

  // Helper: compute hashes for comparison
  computeInputHash(input: string): `0x${string}`;
  computeOutputHash(output: string): `0x${string}`;
}

export function createGatingMiddleware(policy: GatingPolicy): GatingMiddleware;

export function withVerification<T>(
  fn: (output: string) => T,
  policy: GatingPolicy
): (output: string, receipt: GatableReceipt) => T;
```

---

## Section 4: Security / Threat Model

### 4.1 Threat Matrix

| Attack | Description | Mitigation | Residual Risk |
|--------|-------------|------------|---------------|
| **Collusion** | Multiple verifiers coordinate to produce false consensus | VRF-random assignment; statistical detection of correlated answers; diverse verifier pool requirements | Possible if >66% of verifiers collude; economically expensive due to staking |
| **Bribery** | Submitter pays verifiers off-chain to produce specific verdict | Commit-reveal (verifiers can't prove their answer before reveal); slashing makes bribery expensive | Off-chain coordination remains possible; reputation tracking provides weak mitigation |
| **Sybil** | One entity runs many verifier nodes to dominate consensus | Minimum stake requirement; unique identity verification (optional); diminishing returns for multiple nodes from same entity | Wealthy attackers can still run many nodes; stake requirements create plutocracy trade-off |
| **Griefing** | Submitting invalid jobs to waste verifier resources | Upfront fees; spam detection; rate limiting | Low-value attacks remain possible; fees may deter legitimate low-value verifications |
| **Liveness** | Verifiers go offline, stalling the network | Timeout-based reassignment; slashing for non-participation; over-provisioning of verifier assignments | Network depends on verifier availability; cold-start problem for new deployments |
| **Front-running** | Observing pending commitments to gain advantage | Commit-reveal with hashed commitments; commitments don't reveal verdict | Miners/sequencers could still manipulate ordering; use private mempools if available |
| **Receipt forgery** | Creating fake receipts without verification | EIP-712 signatures from registered verifiers; on-chain verifier registry | Requires verifier private key compromise; registry is single point of trust |
| **Stale receipts** | Using old receipts for changed outputs | Receipt includes output_hash; consumers verify hash matches current output | Consumers must implement hash verification; optional expiry timestamps |

### 4.2 Economic Security Assumptions

1. **Honest majority**: System assumes >50% of staked value is controlled by honest verifiers (>66% for Byzantine fault tolerance)
2. **Rational actors**: Verifiers act to maximize expected returns; slashing makes dishonesty unprofitable
3. **Stake > bribe**: Minimum stake must exceed expected bribery value for most verification jobs
4. **Observable misbehavior**: Collusion and manipulation must be detectable (statistically or via disputes)

### 4.3 What Cannot Be Proven

| Claim | Why Unprovable | Best Available Assurance |
|-------|----------------|--------------------------|
| "AI output is correct" | Correctness is subjective/domain-specific | Multi-model consensus; human dispute escalation |
| "AI reasoning is sound" | Neural networks are not interpretable at reasoning level | Reasoning trace commitments (proves reasoning occurred, not that it's valid) |
| "LLM provider is honest" | Closed-source APIs are trusted third parties | Model commitment hashes detect changes; can't prove no backdoors |
| "Verifiers read the evidence" | Can't prove human/computational attention | Economic incentives; spot-check audits; accuracy tracking |

---

## Section 5: Integration UX

### 5.1 Developer Journey (MVP)

```
1. Install SDK
   npm install @mamv/sdk

2. Initialize client
   const mamv = new MAMVClient({ apiKey: '...' });

3. Submit verification
   const receipt = await mamv.verifyAndWait(prompt, response);

4. Use receipt for gating
   if (receipt.worthy && receipt.score_bps >= 8000) {
     // Proceed with high confidence
   }
```

### 5.2 Agent Integration Pattern

For AI agents that call other AI systems:

```typescript
class VerifiedAgent {
  private mamv: MAMVClient;
  private gate: GatingMiddleware;

  async callAI(prompt: string): Promise<{ response: string; receipt: GatableReceipt }> {
    // 1. Get AI response
    const response = await this.llm.complete(prompt);

    // 2. Submit for verification
    const receipt = await this.mamv.verifyAndWait(prompt, response);

    // 3. Self-gate: only return if verified
    const result = this.gate.validate(receipt);
    if (!result.allowed) {
      throw new VerificationFailedError(result.reason);
    }

    return { response, receipt };
  }

  async callVerifiedAgent(otherAgent: VerifiedAgent, prompt: string): Promise<string> {
    // Require receipt from other agent
    const { response, receipt } = await otherAgent.callAI(prompt);

    // Validate their receipt before trusting
    const result = this.gate.validate(receipt);
    if (!result.allowed) {
      throw new UntrustedAgentError('Other agent failed verification');
    }

    return response;
  }
}
```

### 5.3 Smart Contract Integration

```solidity
// Minimal integration for on-chain gating
contract MyProtocol {
    IMAMVReceiptVerifier public receiptVerifier;

    function executeAIAction(
        bytes32 outputHash,
        IMAMVReceiptVerifier.ReceiptProof calldata proof
    ) external {
        // Verify the receipt
        require(
            receiptVerifier.verifyReceipt(proof, 8000, 3),
            "Verification failed"
        );

        // Verify output hash matches
        require(proof.outputHash == outputHash, "Output mismatch");

        // Execute action
        _doAction(outputHash);
    }
}
```

---

## Section 6: Privacy Considerations

### 6.1 What Goes On-Chain

| Data | On-Chain | Off-Chain | Rationale |
|------|----------|-----------|-----------|
| Task ID | Yes | Yes | Unique identifier |
| Input hash (keccak256) | Yes | - | Proves input without revealing content |
| Output hash | Yes | - | Proves output without revealing content |
| Score | Yes | Yes | Public verification outcome |
| Verifier signatures | Yes | - | Proves who verified |
| Raw prompt | No | Yes (encrypted optional) | Privacy; size |
| Raw output | No | Yes (encrypted optional) | Privacy; size |
| Evidence bundle | No | Yes (IPFS/Arweave) | Size; only hash on-chain |
| Reasoning trace | No | Optional (hash on-chain) | Privacy; size |

### 6.2 Optional Encryption

For sensitive verifications:
- Raw content encrypted with submitter's public key
- Only hashes stored publicly
- Submitter can selectively reveal to auditors during disputes
- Evidence URIs can point to access-controlled storage

### 6.3 Replayability Metadata

Evidence bundles can include a replay recipe and model commitment hash to detect silent model updates. Replay metadata records:

- Model identity (provider, model name/version)
- Deterministic transcript (messages, outputs, timestamps, request IDs)
- Invocation parameters (temperature, top_p, max_tokens, seed)
- Replay recipe with expected prompt/output hashes

Canonicalization rules normalize newlines and JSON key ordering to ensure deterministic hashing across environments.

**Limitations**: model commitment hashes rely on provider-reported metadata. They detect mismatches against the declared model/version/config, but cannot prove the provider did not serve a different model behind the scenes.

### 6.4 Reasoning Trace Handling

```typescript
interface ReasoningTracePrivacy {
  // On-chain: only the hash
  trace_hash: `0x${string}`;

  // Off-chain options:
  storage: 'none' | 'encrypted' | 'redacted' | 'full';

  // If 'redacted': summaries only, no raw chain-of-thought
  // If 'encrypted': full trace encrypted to submitter
  // If 'full': stored in evidence bundle (not recommended for production)
}
```

---

## Section 7: Roadmap

### Phase 1: MVP (Variant 1 - Points)

**Timeline**: Could be implemented incrementally

**Features**:
- Off-chain points tracking in database
- Verifier reputation scores (non-transferable)
- Basic quality multiplier based on consensus alignment
- SDK with gating middleware
- Receipt format with verifier signatures
- API endpoints for receipt validation

**Not included**:
- On-chain token
- On-chain staking/slashing (use existing ETH staking)
- Governance
- Fee burning

### Phase 2: On-Chain Gating

**Timeline**: After MVP stability

**Features**:
- ReceiptVerifier contract for on-chain validation
- Receipt-gated contract examples
- Gas-optimized signature verification
- Integration guides for DeFi/agent protocols

### Phase 3: Tokenization (Variant 2)

**Timeline**: After demonstrated product-market fit

**Features**:
- MAMV token (ERC-20) deployment
- Staking contract with token collateral
- Reward distribution contract
- Fee burning mechanism
- Difficulty adjustment oracle
- Governance framework

### Phase 4: Advanced Features

**Timeline**: Long-term

**Features**:
- ZK proof integration for trustless receipt verification
- Cross-chain receipt bridging
- Specialized verification programs (domain-specific)
- Verifier reputation NFTs (soulbound)
- Insurance/slashing pools

---

## Section 8: Open Questions

1. **Minimum viable verifier count**: What's the minimum number of independent verifiers needed for meaningful consensus? 3? 5? 10?

2. **Accuracy oracle**: How do we measure "accuracy" for the quality multiplier when there's no ground truth? Options:
   - Consensus deviation (current proposal)
   - Dispute outcomes over time
   - Spot-check audits by trusted parties

3. **Cold start**: How do we bootstrap the verifier network before there's enough fee revenue to attract verifiers?

4. **Token necessity**: Is a token actually needed, or can the system work indefinitely with ETH + off-chain points?

5. **Regulatory classification**: Would an MAMV token be classified as a security? How does this affect design?

6. **Privacy vs. auditability**: How much evidence should be publicly auditable vs. encrypted to submitter?

7. **Dispute finality**: When does a disputed verification become "final"? After N audit rounds? Time-based?

8. **Cross-program scoring**: Can receipts from different verification programs be compared, or are scores only meaningful within a program?

---

## Section 9: Implementation Plan - Repo Changes

### Variant 1: MVP (Points-Based)

| Module | File/Directory | Change Type | Description |
|--------|---------------|-------------|-------------|
| **contracts/** | - | None | Reuse existing VerificationMarketplace events |
| **api/** | `src/services/pointsService.ts` | New | Points tracking, issuance, quality multiplier calculation |
| **api/** | `src/services/reputationService.ts` | New | Verifier reputation scores, historical accuracy |
| **api/** | `src/routes/v1/points.ts` | New | Endpoints: GET /points/:verifier, GET /leaderboard |
| **api/** | `src/routes/v1/receipts.ts` | New | Endpoints: POST /receipts/validate, GET /receipts/:taskId |
| **api/** | `src/middleware/gating.ts` | New | Gating middleware for API consumers |
| **verifier-node/** | `src/services/qualityTracker.ts` | New | Track per-verifier quality metrics |
| **verifier-node/** | `src/services/jobProcessor.ts` | Modify | Emit quality events; integrate with points service |
| **shared/** | `types.ts` | Modify | Add GatableReceipt, GatingPolicy, PointsBalance types |
| **shared/** | `gating.ts` | New | Receipt validation logic, hash verification |
| **shared/** | `quality.ts` | New | Quality multiplier calculation, deviation scoring |
| **shared/** | `constants.ts` | Modify | Add WORTHY_MIN_BPS, QUORUM_BPS, timing constants |
| **packages/sdk-js/** | `src/client.ts` | Modify | Add verifyAndWait(), validateReceipt() methods |
| **packages/sdk-js/** | `src/gating.ts` | New | GatingMiddleware class, withVerification helper |
| **packages/sdk-js/** | `src/types.ts` | Modify | Export gating types |
| **docs/** | `TOKENOMICS.md` | New | Points economy explanation |
| **docs/** | `GATING_INTEGRATION.md` | New | How to integrate receipt gating |
| **docs/** | `VERIFIER_REWARDS.md` | New | How verifier rewards work |
| **tests/** | `api/points.test.ts` | New | Points issuance, quality multiplier tests |
| **tests/** | `api/gating.test.ts` | New | Receipt validation, policy enforcement |
| **tests/** | `shared/quality.test.ts` | New | Multiplier calculation edge cases |

### Variant 2: Tokenized Protocol (Additions to Variant 1)

| Module | File/Directory | Change Type | Description |
|--------|---------------|-------------|-------------|
| **contracts/** | `MMVToken.sol` | New | ERC-20 token with minting restricted to protocol |
| **contracts/** | `MMVStaking.sol` | New | Token staking, slashing, tier management |
| **contracts/** | `MMVRewards.sol` | New | Reward distribution, difficulty adjustment |
| **contracts/** | `ReceiptVerifier.sol` | New | On-chain receipt validation for gating |
| **contracts/** | `MMVGovernor.sol` | New | Token-weighted parameter governance |
| **contracts/** | `interfaces/IReceiptVerifier.sol` | New | Interface for receipt-gated contracts |
| **api/** | `src/services/tokenService.ts` | New | Token balance queries, reward calculations |
| **api/** | `src/services/stakingService.ts` | New | Staking state sync, tier management |
| **api/** | `src/routes/v1/staking.ts` | New | Endpoints for staking operations |
| **shared/** | `tokenomics.ts` | New | Emission schedule, difficulty adjustment logic |
| **packages/sdk-js/** | `src/staking.ts` | New | Staking helpers, tier queries |
| **packages/sdk-js/** | `src/onchain.ts` | Modify | Add ReceiptVerifier contract bindings |
| **docs/** | `TOKEN_SPEC.md` | New | Full token specification |
| **docs/** | `STAKING_GUIDE.md` | New | How to stake and earn rewards |
| **docs/** | `ONCHAIN_GATING.md` | New | Smart contract integration guide |
| **tests/** | `contracts/MMVToken.test.ts` | New | Token minting, transfer, burn tests |
| **tests/** | `contracts/Staking.test.ts` | New | Stake, slash, tier tests |
| **tests/** | `contracts/ReceiptVerifier.test.ts` | New | On-chain receipt validation tests |
| **tests/** | `contracts/Gating.test.ts` | New | Receipt-gated contract tests |

---

## Appendix A: Receipt Validation Pseudocode

```typescript
function validateReceipt(
  receipt: GatableReceipt,
  policy: GatingPolicy
): GatingResult {
  // 1. Check receipt version
  if (receipt.receipt_version !== '1.0') {
    return { allowed: false, reason: 'Unsupported receipt version' };
  }

  // 2. Check score threshold
  if (receipt.score_bps < policy.min_score_bps) {
    return { allowed: false, reason: `Score ${receipt.score_bps} below threshold ${policy.min_score_bps}` };
  }

  // 3. Check verifier count
  if (receipt.verifier_signatures.length < policy.required_verifier_count) {
    return { allowed: false, reason: `Only ${receipt.verifier_signatures.length} verifiers, need ${policy.required_verifier_count}` };
  }

  // 4. Check receipt age
  const age = Date.now() / 1000 - receipt.finalized_at;
  if (age > policy.max_receipt_age_seconds) {
    return { allowed: false, reason: `Receipt is ${age}s old, max allowed is ${policy.max_receipt_age_seconds}s` };
  }

  // 5. Verify signatures (if on-chain verification available)
  for (const sig of receipt.verifier_signatures) {
    if (!verifyEIP712Signature(receipt, sig)) {
      return { allowed: false, reason: `Invalid signature from ${sig.verifier_address}` };
    }
    if (!isRegisteredVerifier(sig.verifier_address)) {
      return { allowed: false, reason: `${sig.verifier_address} is not a registered verifier` };
    }
  }

  // 6. Check program allowlist (if specified)
  if (policy.allowed_programs && receipt.program_fingerprint) {
    if (!policy.allowed_programs.includes(receipt.program_fingerprint)) {
      return { allowed: false, reason: 'Verification program not in allowlist' };
    }
  }

  return { allowed: true, receipt_id: receipt.task_id };
}
```

---

## Appendix B: Quality Multiplier Examples

| Scenario | Verifier Score | Final Score | History | Multiplier | Reward |
|----------|---------------|-------------|---------|------------|--------|
| Perfect alignment, good history | 8500 | 8500 | 0.9 | 1.45x | 145 points |
| Perfect alignment, new verifier | 8500 | 8500 | 0.5 | 1.25x | 125 points |
| Small deviation | 8200 | 8500 | 0.8 | 0.94x | 94 points |
| Moderate deviation | 7500 | 8500 | 0.7 | 0.65x | 65 points |
| Large deviation | 5000 | 8500 | 0.6 | 0.10x | 10 points |
| Outlier (likely wrong) | 2000 | 8500 | 0.3 | 0.07x | 7 points + reputation penalty |

---

*This specification proposes a design direction and would require implementation, testing, security audits, and iteration before deployment.*
