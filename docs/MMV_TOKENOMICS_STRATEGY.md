# MAMV Tokenomics and Platform Strategy

## Executive Summary

1. **"Mining by verifying AI" is viable but requires insurance-style mechanism design**—rewarding reliable behavior and process integrity rather than naive "accuracy," which creates majority-following and Goodhart effects.

2. **This document proposes a phased approach**: Phase 1 (points + reputation), Phase 2 (stake + slashing in ETH), Phase 3 (optional token emissions if demand justifies). A token launch before product-market fit would be premature.

3. **Accuracy is the wrong metric**. Verifiers should be rewarded for calibration (confidence matches outcomes), process integrity (evidence quality, timely reveals), and consensus contribution—not for being "right."

4. **Two token models are analyzed**: (A) Fee market + stake yield is safer and self-sustaining; (B) Emission mining is higher risk, requiring anti-farming and emissions tied to paid demand.

5. **Forced verification creates demand stability** but should roll out in "soft mode" first (warn/label), then "hard mode" (block), with SDK middleware making integration trivial.

6. **Platform hardening follows a dependency chain**: P0 (schema unification) → P1 (receipts as settlement) → P2 (provenance + model commitments) → P3 (dispute hardening) → P4 (developer surface).

7. **MAMV's trust model differs fundamentally from Ethereum's**: Ethereum verifies deterministic computation (1+1=2 is provable). MAMV verifies probabilistic trustworthiness via economic incentives + audit trails. This distinction shapes every design decision.

8. **Slashing must be tied to protocol violations and dispute outcomes**, not to "being wrong"—because "wrong" is often unknowable for AI outputs.

9. **Attack cost must exceed attack profit** for all threat vectors. This document provides formulas for calculating required stake and quorum levels.

10. **Open questions remain** around dispute finality, cross-program comparability, regulatory classification, and cold-start bootstrapping.

---

## Section 1: Should MAMV Add a Token Now?

### Recommendation: No. Use a Phased Approach.

| Phase | Mechanism | Prerequisites to Advance |
|-------|-----------|--------------------------|
| **Phase 1: Points + Reputation** | Off-chain points; non-transferable reputation scores; ETH for fees | Working verification flow; 10+ active verifiers; 1,000+ verifications completed |
| **Phase 2: Stake + Slashing** | ETH staking with slashing; fee distribution; reputation affects job priority | Dispute mechanism tested in production; clear slashing rules; 6+ months Phase 1 data |
| **Phase 3: Optional Token** | MAMV token for staking, governance, emissions (if justified) | Demonstrated demand exceeding ETH capacity; regulatory clarity; community governance framework |

### Why This Phasing?

**Phase 1 validates demand.** If verifiers won't participate for points and reputation alone (with ETH fees), token emissions would only attract mercenary capital that leaves when emissions decline.

**Phase 2 validates security.** Slashing is adversarial—bugs or unfair rules cause verifier exodus. Testing with ETH (familiar, liquid) surfaces issues before a native token complicates things.

**Phase 3 is optional.** A token is justified only if: (a) ETH staking limits participation, (b) governance rights are genuinely needed, (c) emission incentives would bootstrap a network effect that fees alone cannot. None of these are proven today.

---

## Section 2: Mechanism Design

### 2.1 The Accuracy Trap

Rewarding verifiers for "accuracy" (matching ground truth or consensus) creates pathologies:

| Pathology | Description | Example |
|-----------|-------------|---------|
| **Majority-following** | Verifiers learn to predict consensus, not evaluate evidence | Verifier ignores evidence and guesses what others will say |
| **Risk-avoidance** | Verifiers avoid controversial or edge cases | High-confidence wrong answers preferred over uncertain correct ones |
| **Collusion** | Verifiers coordinate answers off-chain | Cartel forms to always output 8000 bps |
| **Goodhart's Law** | Metric becomes target, loses meaning | Verifiers optimize for score, not verification quality |

### 2.2 Reward/Slash Rules That Avoid Traps

This design proposes rewarding **reliability** and **process integrity**, not accuracy:

```
reward = base_fee_share
       + calibration_bonus          // Confidence matches outcomes over time
       + evidence_quality_bonus     // Structured, complete evidence bundles
       - protocol_violation_penalty // Late reveals, malformed commits
       - dispute_loss_penalty       // Lost disputes (adjudicated wrong)
```

**What gets rewarded:**
| Behavior | Reward Mechanism |
|----------|------------------|
| Timely commit + reveal | Eligible for base fee share |
| Well-calibrated confidence | Brier-score bonus over 30-day rolling window |
| High-quality evidence | Evidence completeness multiplier (0.8x to 1.2x) |
| Consistent participation | Liveness bonus for 95%+ availability |

**What gets penalized:**
| Violation | Penalty |
|-----------|---------|
| Commit without reveal | 100% of job stake slashed |
| Reveal after window | 50% of job stake slashed |
| Malformed evidence | Job reward forfeited |
| Lost dispute (Tier 1+) | 10-50% of job stake slashed (proportional to severity) |
| Proven collusion | 100% stake slashed + permanent ban |

### 2.3 Model A: Fee Market + Stake Yield

This model is conservative and self-sustaining:

**How it works:**
1. Submitters pay verification fees in ETH
2. Verifiers stake ETH to participate
3. Fees are distributed to verifiers who completed the job
4. Staked ETH earns yield from protocol fees (not inflation)

**Parameters:**
| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `MIN_STAKE` | 0.5 ETH | High enough to deter casual sybils |
| `FEE_TO_VERIFIERS` | 70% | Majority goes to workers |
| `FEE_TO_PROTOCOL` | 20% | Funds development, audits |
| `FEE_TO_INSURANCE` | 10% | Dispute resolution fund |
| `STAKE_YIELD_SOURCE` | Protocol fees only | No inflation |
| `YIELD_DISTRIBUTION` | Pro-rata by stake × uptime × calibration | Rewards reliable, calibrated verifiers |

**Distribution formula:**
```
verifier_share = (stake_i × uptime_i × calibration_i) / Σ(stake_j × uptime_j × calibration_j)
verifier_reward = total_epoch_fees × FEE_TO_VERIFIERS × verifier_share
```

**Pros:** Self-sustaining; no inflation; no token speculation; simple to reason about.
**Cons:** Slower growth; requires sufficient fee volume to attract verifiers.

### 2.4 Model B: Emission Mining

This model uses token emissions to bootstrap the network:

**How it works:**
1. MAMV token is emitted to verifiers for completed verifications
2. Emissions are tied to **paid demand** (not raw verification count)
3. Difficulty adjusts so emissions per verification decrease as network grows
4. Anti-farming mechanisms prevent synthetic demand

**Parameters:**
| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `TOTAL_SUPPLY` | 1,000,000,000 MAMV | Fixed cap |
| `EMISSION_POOL` | 40% of supply | Distributed over ~10 years |
| `EMISSION_HALVING` | Every 2 years | Decreasing inflation |
| `DEMAND_MULTIPLIER` | `min(1.0, paid_fees / target_fees)` | Emissions only when demand exists |
| `DIFFICULTY_ADJUSTMENT` | Every 1,000 verifications | Smooths rewards |

**Anti-farming mechanisms:**
1. **Paid demand requirement:** Emissions only occur for jobs with fees ≥ `MIN_FEE` (e.g., 0.001 ETH)
2. **Unique submitter requirement:** Same submitter address limited to 100 jobs/day
3. **Evidence diversity requirement:** Evidence bundles must differ (hash uniqueness)
4. **Stake lockup:** Earned tokens locked for 30 days (reduces dump-and-farm)

**Difficulty adjustment:**
```typescript
function adjustDifficulty(current: DifficultyState): number {
  const ratio = current.actualVerifications / current.targetVerifications;

  if (ratio > 1.5) {
    // Too many verifications: halve emission per job
    return current.emissionPerJob * 0.5;
  } else if (ratio > 1.1) {
    // Slightly high: reduce 10%
    return current.emissionPerJob * 0.9;
  } else if (ratio < 0.5) {
    // Too few: double emission per job (capped at initial rate)
    return Math.min(INITIAL_EMISSION_RATE, current.emissionPerJob * 2.0);
  } else if (ratio < 0.9) {
    // Slightly low: increase 10%
    return Math.min(INITIAL_EMISSION_RATE, current.emissionPerJob * 1.1);
  }
  return current.emissionPerJob;
}
```

**Pros:** Can bootstrap network faster; creates tradeable asset for governance.
**Cons:** Inflation; speculation; regulatory risk; farming attacks; complexity.

### 2.5 Model Comparison

| Dimension | Model A (Fee + Yield) | Model B (Emissions) |
|-----------|----------------------|---------------------|
| Bootstrap speed | Slower | Faster |
| Sustainability | Self-sustaining | Requires demand to justify inflation |
| Speculation risk | Low | High |
| Regulatory risk | Lower (utility fees) | Higher (possible security) |
| Complexity | Simple | Complex (anti-farming, difficulty) |
| Verifier incentive alignment | Direct (paid for work) | Indirect (mine + sell) |
| Recommended for | Phase 2 | Phase 3 (if ever) |

### 2.6 Calibration Scoring

Instead of "accuracy," this design proposes using calibration—how well a verifier's confidence predicts outcomes:

**Brier-like score:**
```
calibration_score = 1 - mean((predicted_probability - actual_outcome)²)
```

Where:
- `predicted_probability` = verifier's score_bps / 10000 (treated as confidence)
- `actual_outcome` = 1 if task was ultimately deemed "worthy" (after disputes), 0 otherwise

**Rolling window:** 30-day rolling average, minimum 20 verifications to qualify.

**Bonus structure:**
| Calibration Score | Bonus Multiplier |
|-------------------|------------------|
| 0.90+ | 1.3x |
| 0.80-0.89 | 1.15x |
| 0.70-0.79 | 1.0x (baseline) |
| 0.60-0.69 | 0.85x |
| Below 0.60 | 0.7x + warning |

**Why this works:** A verifier who says "85% confidence" should be right ~85% of the time. Consistently overconfident or underconfident verifiers are penalized. This rewards honest uncertainty rather than false precision.

### 2.7 Evidence Quality Weighting

Evidence bundles are scored for completeness:

```typescript
interface EvidenceQualityScore {
  has_input_hash: boolean;           // +10 points
  has_output_hash: boolean;          // +10 points
  has_model_runs: boolean;           // +20 points (with metadata)
  has_score_breakdown: boolean;      // +15 points
  has_citations: boolean;            // +15 points (if applicable)
  has_model_commitment: boolean;     // +15 points
  has_reasoning_trace_hash: boolean; // +15 points
  // Total: 100 points max
}

function evidenceMultiplier(score: number): number {
  if (score >= 90) return 1.2;
  if (score >= 70) return 1.0;
  if (score >= 50) return 0.9;
  return 0.8;
}
```

### 2.8 Dispute and Adjudication Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     DISPUTE LADDER                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Tier 0: Auto-Check (free, immediate)                           │
│  ├─ Hash verification, signature validation                     │
│  ├─ If passes → Finalized                                       │
│  └─ If fails → Rejected (no fee refund)                         │
│                                                                  │
│  Tier 1: Single Auditor (0.1 ETH, 24h)                          │
│  ├─ VRF-selected auditor reviews evidence                       │
│  ├─ If upholds → Disputer loses fee                             │
│  └─ If overturns → Verifier slashed, disputer refunded + bonus  │
│                                                                  │
│  Tier 2: Auditor Committee (0.5 ETH, 72h)                       │
│  ├─ 5 VRF-selected auditors, 3/5 majority required              │
│  ├─ If upholds → Disputer loses fee, split among auditors       │
│  └─ If overturns → Verifier slashed 25%, auditors rewarded      │
│                                                                  │
│  Tier 3: Community Arbitration (2 ETH, 7 days)                  │
│  ├─ 15 VRF-selected auditors + public evidence disclosure       │
│  ├─ 10/15 supermajority required                                │
│  └─ Final and binding; loser pays all fees + 50% slash          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Ambiguity resolution:**
- Auditors vote on a scale: `clearly_correct`, `probably_correct`, `uncertain`, `probably_wrong`, `clearly_wrong`
- If majority is `uncertain`, verification is marked `inconclusive`—neither party slashed, fees split
- This prevents punishing verifiers for genuinely ambiguous AI outputs

---

## Section 3: Security and Threat Model

### 3.1 Threat Matrix

| Attack | Description | Mitigation | Residual Risk |
|--------|-------------|------------|---------------|
| **Collusion** | Verifiers coordinate answers | VRF random selection; statistical anomaly detection; diverse stake sources | >66% stake collusion defeats consensus |
| **Bribery** | Submitter pays verifiers off-chain | Commit-reveal hides answer until reveal; bribe must exceed slash risk | Off-chain coordination possible |
| **Sybil** | One entity runs many nodes | Minimum stake; IP/identity heuristics; diminishing returns at scale | Wealthy attackers can sybil |
| **Griefing** | Spam invalid jobs | Upfront fees; rate limits; reputation gates | Low-value spam possible |
| **Liveness** | Verifiers go offline | Timeout reassignment; slash for abandonment; over-provision quorum | Cold-start vulnerability |
| **Front-running** | Observe commits, manipulate order | Hashed commits reveal nothing; private mempool if available | Sequencer manipulation possible |
| **Receipt forgery** | Fake receipts without verification | EIP-712 signatures from registered verifiers | Key compromise required |

### 3.2 Attack Cost Reasoning

**Principle:** Attack cost must exceed attack profit.

**Variables:**
- `S` = minimum stake per verifier
- `Q` = quorum size (verifiers per job)
- `B` = Byzantine threshold (verifiers needed to corrupt outcome)
- `V` = value at risk (what attacker gains from false verification)
- `P` = detection probability
- `L` = slash amount if caught

**Attack cost formula:**
```
attack_cost = B × S + (transaction_costs) + (coordination_costs)
expected_loss_if_caught = P × B × L
total_attack_cost = attack_cost + expected_loss_if_caught
```

**Security condition:**
```
total_attack_cost > V
```

**Example calculation:**
- `S` = 0.5 ETH, `Q` = 5, `B` = 3 (majority), `L` = 100% slash, `P` = 0.3 (30% detection)
- `attack_cost` = 3 × 0.5 ETH = 1.5 ETH
- `expected_loss` = 0.3 × 3 × 0.5 ETH = 0.45 ETH
- `total_attack_cost` = 1.95 ETH

If the attacker gains less than 1.95 ETH from corrupting the verification, the attack is unprofitable.

**Implications for high-value verifications:**
- High-value jobs should require higher stake or larger quorum
- Dynamic stake requirements: `required_stake = max(MIN_STAKE, job_value × 0.1)`

### 3.3 What Drives Security

| Variable | Increase Effect | Tradeoff |
|----------|-----------------|----------|
| Min stake | Higher attack cost | Fewer verifiers can participate |
| Quorum size | More verifiers to corrupt | Higher latency, cost |
| Slash severity | Higher expected loss | May deter honest verifiers too |
| Detection probability | Higher expected loss | Requires dispute system efficacy |
| VRF randomness | Prevents targeting | Adds complexity, gas |

---

## Section 4: Forced Verification Design

### 4.1 Rollout Modes

| Mode | Behavior | Use Case |
|------|----------|----------|
| **Warn** | Log warning if no receipt; proceed anyway | Initial rollout; monitoring |
| **Label** | Attach "unverified" label to output; proceed | User-facing transparency |
| **Block** | Reject output if no valid receipt | High-stakes applications |

### 4.2 Off-Chain Gating (Middleware)

```typescript
import { MAMVGate, GatingMode } from '@mamv/sdk';

// 10-line integration
const gate = new MAMVGate({
  mode: 'warn',  // 'warn' | 'label' | 'block'
  policy: {
    min_score_bps: 8000,
    min_verifiers: 3,
    max_age_seconds: 3600
  }
});

app.use('/ai', gate.middleware());

// In route handler
app.post('/ai/generate', async (req, res) => {
  const { output, receipt } = await generateWithVerification(req.body);
  res.json({ output, verified: receipt.worthy, score: receipt.score_bps });
});
```

**Rollout plan:**
1. Week 1-4: `warn` mode—collect metrics on verification rates
2. Week 5-8: `label` mode—show users verification status
3. Week 9+: `block` mode for high-stakes endpoints; `label` for others

### 4.3 On-Chain Gating

```solidity
// Receipt-gated contract pattern
interface IMMVGate {
    function isValidReceipt(
        bytes32 taskId,
        bytes32 outputHash,
        uint16 minScore,
        uint8 minVerifiers,
        bytes[] calldata signatures
    ) external view returns (bool);
}

contract AIGatedVault {
    IMMVGate public gate;
    uint16 public constant MIN_SCORE = 8000;
    uint8 public constant MIN_VERIFIERS = 3;

    function executeAIDecision(
        bytes32 taskId,
        bytes32 outputHash,
        bytes calldata decision,
        bytes[] calldata sigs
    ) external {
        require(
            gate.isValidReceipt(taskId, outputHash, MIN_SCORE, MIN_VERIFIERS, sigs),
            "Invalid verification"
        );
        _execute(decision);
    }
}
```

### 4.4 Receipt Requirements

Minimum receipt contents for gating:
```typescript
interface GatableReceipt {
  task_id: string;                    // Unique identifier
  input_hash: `0x${string}`;          // keccak256 of input
  output_hash: `0x${string}`;         // keccak256 of output
  score_bps: number;                  // 0-10000
  verdict: boolean;                   // Pass/fail
  finalized_at: number;               // Unix timestamp
  verifier_signatures: Array<{        // EIP-712 signatures
    address: `0x${string}`;
    signature: `0x${string}`;
  }>;
  evidence_bundle_hash: `0x${string}`; // For audit trail
}
```

---

## Section 5: Platform Hardening Roadmap

### P0: Schema Unification (Foundation)

**Scope:**
- Canonical JSON serialization for all types
- Deterministic keccak256 hashing (sorted keys, no whitespace)
- ABI alignment between TypeScript types and Solidity structs
- EIP-712 domain separator and type hashes

**Acceptance criteria:**
- [ ] `computeHash(obj)` produces identical output in TS, Solidity, and Go
- [ ] All types have corresponding OpenAPI schemas
- [ ] Test suite verifies cross-language hash consistency
- [ ] No breaking changes to existing evidence bundle format

**Depends on:** Nothing (this is the foundation)

### P1: Receipts as Settlement Unit

**Scope:**
- `VerificationReceipt` as the canonical proof of verification
- On-chain `ReceiptVerifier` contract for signature validation
- Versioned program fingerprinting (`computeProgramFingerprint`)
- Metering: `max_llm_calls`, `max_tokens`, `max_execution_ms`

**Acceptance criteria:**
- [ ] Receipt can be verified on-chain in <50k gas
- [ ] Program fingerprint changes if program logic changes
- [ ] Metering limits are enforced in verifier node
- [ ] SDK exports `verifyReceiptOnChain()` helper

**Depends on:** P0 (hash consistency)

### P2: Provenance and Model Commitments

**Scope:**
- `ModelCommitment` for each LLM call (provider, model, config hash)
- `ReasoningTraceCommitment` (hash-based, not raw content)
- Model commitment registry (detect silent model changes)
- Evidence bundle v0.3 with provenance fields

**Acceptance criteria:**
- [ ] Every model run includes commitment hash
- [ ] Reasoning trace hash is reproducible from trace
- [ ] Registry tracks historical model commitments
- [ ] No raw chain-of-thought stored on-chain or in public evidence

**Depends on:** P1 (receipt structure)

### P3: Dispute Hardening and Quality Rewards

**Scope:**
- Dispute ladder implementation (Tier 0-3)
- VRF-based auditor selection
- Calibration scoring (30-day rolling Brier score)
- Quality-linked reward multipliers
- Slashing for protocol violations

**Acceptance criteria:**
- [ ] Disputes can be raised and adjudicated end-to-end
- [ ] VRF is verifiable on-chain
- [ ] Calibration scores update after each finalization
- [ ] Slashing executes atomically with dispute resolution
- [ ] No naive "accuracy" rewards—only calibration and process

**Depends on:** P2 (provenance for dispute evidence)

### P4: Developer Integration Surface

**Scope:**
- `/v1/` API with versioned endpoints
- OpenAPI 3.0 specification
- `@mamv/sdk` with TypeScript client
- Gating middleware (warn/label/block)
- Example integrations (agent, smart contract, API)

**Acceptance criteria:**
- [ ] API is documented and versioned
- [ ] SDK can submit job, wait for receipt, validate receipt in <20 lines
- [ ] Gating middleware works with Express, Fastify, Next.js
- [ ] Examples run out of the box
- [ ] Breaking changes follow semver

**Depends on:** P1 (receipts), P3 (quality scores visible in SDK)

---

## Section 6: Ethereum vs MAMV Trust Models

| Dimension | Ethereum | MAMV |
|-----------|----------|-----|
| **What is verified** | Deterministic computation (EVM execution) | Probabilistic AI output trustworthiness |
| **Verification method** | Cryptographic proof (re-execute to verify) | Economic consensus (multiple verifiers + incentives) |
| **Correctness guarantee** | Mathematical (1+1=2 is provable) | Probabilistic (majority of incentivized parties agree) |
| **Trust assumption** | Honest majority of validators | Honest majority of verifiers + rational self-interest |
| **Attack cost** | 51% of staked ETH | Byzantine threshold of verification stake |
| **Dispute resolution** | Fork (social consensus) | Adjudication ladder (auditor committees) |
| **What goes on-chain** | Full execution trace (all state changes) | Hashes + signatures (evidence stored off-chain) |
| **Finality** | ~15 minutes (Ethereum) | Seconds (optimistic) to days (disputed) |

**Why this matters for tokenomics:**

Ethereum validators are rewarded for *availability* and *correct execution*—both verifiable. MAMV verifiers are rewarded for *trustworthy evaluation*—not directly verifiable.

This means:
1. MAMV cannot slash for "wrong answers" (no ground truth)
2. MAMV must slash for *process violations* and *lost disputes*
3. Rewards must incentivize calibration, not false confidence
4. The token (if any) cannot promise "truth"—only "auditable, incentive-aligned evaluation"

---

## Section 7: Open Questions

1. **Dispute finality**: When is a disputed verification truly final? After Tier 3? Time-locked? Can new evidence reopen?

2. **Cross-program comparability**: Can a receipt from Program A be compared to Program B? Are scores meaningful across programs?

3. **Cold-start problem**: How does the network bootstrap when there are few verifiers and little fee volume? Subsidized jobs? Foundation grants?

4. **Regulatory classification**: Would an MAMV token be a security under Howey? Does this change based on jurisdiction?

5. **Auditor selection fairness**: VRF is random, but can sophisticated attackers predict or influence selection?

6. **Evidence storage longevity**: IPFS/Arweave for evidence—what if storage providers disappear? Who pays for pinning?

7. **Model commitment honesty**: Model commitments detect *changes* but cannot prove providers are *honest*. How is this communicated?

8. **Multi-chain receipts**: Should receipts be valid across chains (Ethereum, Arbitrum, Base)? How to prevent replay?

9. **Verifier minimum viable count**: What's the minimum number of independent verifiers for meaningful security? 10? 50? 100?

10. **Fee floor dynamics**: Should `MIN_FEE` adjust based on network load, or remain fixed? Who decides?

---

## Appendix: Why MAMV for AI Accountability

Ethereum provides transaction immutability—once recorded, data cannot be altered. This solves *tamper-proofing* but not *trustworthiness*. For AI outputs, the question is not "was this recorded correctly?" but "should this output be trusted?"

MAMV extends the blockchain trust model to address AI-specific challenges:
- **Input/output provenance**: Proves what was asked and answered, not just that something was recorded
- **Multi-model consensus**: Cross-checks outputs across independent AI providers, reducing single-point-of-failure trust
- **Model accountability**: Cryptographic commitments detect when providers silently change models
- **Economic verification**: Staked verifiers with skin in the game, slashed for misbehavior
- **Audit trail**: Evidence bundles provide reproducible verification reasoning (via hashes, not raw content)

This does not replace Ethereum—it builds on it. Ethereum provides the settlement layer (immutability, finality). MAMV provides the verification layer (trustworthiness evaluation with economic guarantees).

The result is not "provably correct AI" (impossible) but "auditable, economically-secured AI evaluation"—a meaningful improvement over "trust OpenAI's API response."

---

*This document proposes a design direction. Implementation requires testing, iteration, security audits, and community input before any token launch.*
