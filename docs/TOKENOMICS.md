# MM Verifier Tokenomics

**Version**: 1.0 (MVP)
**Currency**: WETH (Wrapped ETH on Arbitrum)
**Last Updated**: 2026-01-10

## Table of Contents

1. [Overview](#overview)
2. [Bond Types](#bond-types)
3. [Incentive Mechanisms](#incentive-mechanisms)
4. [Slashing Rules](#slashing-rules)
5. [Fee Structure](#fee-structure)
6. [Reward Distribution](#reward-distribution)
7. [Economic Security Analysis](#economic-security-analysis)
8. [Token Flows](#token-flows)
9. [Attack Cost Modeling](#attack-cost-modeling)
10. [Parameter Tuning](#parameter-tuning)

---

## Overview

MM Verifier uses **WETH bonds** (not native governance token) to ensure economic accountability. All participants post bonds that can be slashed for malicious behavior.

### Why WETH?

- ✅ **Universal value**: ETH price is established, not subject to token inflation
- ✅ **No token launch**: Avoid regulatory complexity
- ✅ **Immediate liquidity**: No need for token liquidity bootstrapping
- ✅ **Simple onboarding**: Users already have ETH
- ✅ **Arbitrum native**: Low gas costs, fast finality

### Core Economic Principle

> **Bond value must exceed expected profit from attack**

If attack profit < slash amount, attacks are economically irrational.

---

## Bond Types

All bonds posted in **WETH** on Arbitrum.

### A) Evaluator (Verifier) Bond

**Who**: Verifiers who evaluate LLM outputs
**Purpose**: Anti-spam + slashable for fraud
**Size**: 0.02–0.10 WETH (~$40–$200 @ $2k ETH)

| Tier | Evaluations | Bond Size | USD (@$2k ETH) |
|------|-------------|-----------|----------------|
| Starter | 0-10 | 0.02 WETH | $40 |
| Regular | 11-100 | 0.05 WETH | $100 |
| Professional | 101-1000 | 0.10 WETH | $200 |
| Expert | 1000+ | 0.10 WETH | $200 (capped) |

**Bond Mechanics**:
- **Locked during active jobs**: Portion locked (0.01 WETH per job)
- **Unlocked on completion**: Released when job finalized
- **Slashed for**:
  - Invalid evidence bundle (50% slash)
  - Consensus deviation >20% (25-50% slash)
  - Non-reveal after commit (10% slash)
  - Missing bundle availability (50% slash)
- **Unbonding period**: 7 days
- **Can be increased**: Verifiers can add more for higher job throughput

**Progressive Bonding** (Anti-Sybil):
```
Required bond = BASE × (1 + floor(totalVerifiers / 100) × 0.1)

Example:
- First 100 verifiers: 0.02 WETH
- Verifiers 101-200: 0.022 WETH (+10%)
- Verifiers 201-300: 0.024 WETH (+20%)
```

### B) Auditor Stake

**Who**: Auditors who vote on disputes
**Purpose**: Eligibility + slashable for bad votes
**Size**: 0.25–2.0 WETH (~$500–$4,000 @ $2k ETH)

| Tier | Auditors | Stake Size | USD (@$2k ETH) |
|------|----------|------------|----------------|
| Initial (Allowlist) | 1-10 | 0.25 WETH | $500 |
| Early | 11-50 | 0.50 WETH | $1,000 |
| Growth | 51-100 | 0.75 WETH | $1,500 |
| Mature | 101-200 | 1.00 WETH | $2,000 |
| Saturated | 200+ | 2.00 WETH | $4,000 (capped) |

**Stake Mechanics**:
- **Always locked**: Minimum stake locked while active
- **Additional locked per dispute**: 0.1 WETH locked during active dispute participation
- **Slashed for**:
  - Incorrect vote (20% of locked stake)
  - Non-reveal after commit (30% slash)
  - Collusion (detected via pattern analysis) (50-100% slash)
- **Unbonding period**: 14 days (longer than verifiers)
- **Rewards proportional to stake**: Higher stake = higher selection probability (capped at 3x)

**Progressive Staking** (Sybil Resistance):
```
Required stake = BASE_STAKE × (100 + floor(auditorCount / 10) × 10) / 100

Example:
- Auditors 1-10: 0.5 WETH × 100% = 0.5 WETH
- Auditors 11-20: 0.5 WETH × 110% = 0.55 WETH
- Auditors 91-100: 0.5 WETH × 190% = 0.95 WETH
- Auditors 101+: 0.5 WETH × 200% = 1.0 WETH (capped at 2x)
```

### C) Dispute (Challenger) Bond

**Who**: Challengers who dispute evaluations
**Purpose**: Prevents nuisance disputes
**Size**: 0.05 WETH base, escalates with tier

| Dispute Tier | Bond Required | USD (@$2k ETH) | Committee Size |
|--------------|---------------|----------------|----------------|
| Tier 0 (Auto-check) | 0.01 WETH | $20 | 0 (automated) |
| Tier 1 (Auditor review) | 0.05 WETH | $100 | 3 auditors |
| Tier 2 (Appeal 1) | 0.10 WETH | $200 | 5 auditors |
| Tier 3 (Appeal 2) | 0.20 WETH | $400 | 7 auditors |
| Tier 4 (Final appeal) | 0.40 WETH | $800 | 9 auditors |

**Dispute Bond Mechanics**:
- **Escalation**: Doubles each tier
- **Refunded if win**: Challenger gets bond back + rewards
- **Lost if lose**: Bond transferred to disputed verifier
- **Partial refund**: If dispute partially upheld (50% refund)

**Economic Rationale**:
- Tier 0 is cheap (auto-check, low risk)
- Tier 1+ requires skin in the game
- Escalation cost prevents spam appeals
- Legitimate disputes are profitable

---

## Incentive Mechanisms

### A) Verifier Rewards

**Source**: Requester payment for verification job

**Reward Pool Distribution**:
```
Job payment (100%)
├── 80% → Verifiers (split among honest verifiers)
├── 15% → Protocol treasury
└── 5% → Staking rewards pool
```

**Per-Verifier Reward**:
```
Verifier reward = (Job payment × 80%) / Number of honest verifiers

Honest verifier = Revealed evaluation within consensus range
```

**Example**:
```
Job payment: 0.02 WETH
Verifiers committed: 5
Verifiers revealed: 4 (1 didn't reveal)
Verifiers in consensus: 3 (1 outlier)

Reward per honest verifier:
= (0.02 WETH × 80%) / 3
= 0.016 / 3
= 0.00533 WETH (~$10.66)

ROI per job (bonded 0.02 WETH):
= $10.66 / $40
= 26.6% per job
```

**Bonus Multipliers** (future):
- **Speed bonus**: +10% for first revealer
- **Consistency bonus**: +5% for verifiers with <5% deviation from consensus
- **Streak bonus**: +20% for 100+ consecutive correct evaluations

### B) Auditor Rewards

**Source**: Slashed verifier funds + dispute bond

**Reward Distribution** (when challenger wins):
```
Slashed amount (50% of verifier bond)
├── 60% → Challenger
├── 40% → Auditors (split among correct voters)

Challenger's bond → Returned to challenger
```

**Example**:
```
Verifier bond: 0.1 WETH
Slashed: 0.05 WETH (50%)
Challenger bond: 0.05 WETH
Auditor committee: 3 auditors
Correct votes: 2 auditors (majority)

Challenger reward:
= 0.05 × 60% = 0.03 WETH
+ 0.05 bond returned
= 0.08 WETH total (~$160)

Per-auditor reward (correct voters):
= (0.05 × 40%) / 2
= 0.01 WETH per auditor (~$20)

ROI for challenger:
= $160 / $100 (bond) = 60% profit
```

**Auditor Earnings Potential**:
```
Assumptions:
- 10 disputes per month
- 30% selection probability (100 auditors, 3-person committees)
- 90% correct vote rate

Expected monthly earnings:
= 10 disputes × 0.3 selection × 0.9 correct × 0.01 WETH
= 0.027 WETH/month (~$54/month)

Annual yield on 0.5 WETH stake:
= (0.027 × 12) / 0.5
= 64.8% APY
```

### C) Protocol Revenue

**Revenue Sources**:
1. **Verification fees**: 15% of job payments
2. **Slashed funds (residual)**: Unclaimed slashed funds after 90 days
3. **Appeal fees**: Portion of failed appeal bonds

**Revenue Allocation**:
```
Protocol revenue
├── 50% → Treasury (development, audits, operations)
├── 30% → Staking rewards pool (future governance token)
└── 20% → Bug bounty program
```

**Projected Revenue** (Monthly, 1000 jobs @ 0.02 WETH avg):
```
Job revenue:
= 1000 jobs × 0.02 WETH × 15%
= 3 WETH/month (~$6,000/month)

Slashed funds (assume 1% of verifiers slashed):
= 10 verifiers × 0.05 WETH avg slash
= 0.5 WETH/month (~$1,000/month)

Total protocol revenue:
= 3.5 WETH/month (~$7,000/month)
= 42 WETH/year (~$84,000/year)
```

---

## Slashing Rules

### A) Verifier Slashing

| Offense | Severity | Slash % | Slash Amount | Examples |
|---------|----------|---------|--------------|----------|
| Missing bundle | Critical | 50% | 0.025 WETH | Bundle not on IPFS |
| Invalid bundle | Critical | 50% | 0.025 WETH | Malformed evidence |
| Consensus deviation >30% | High | 50% | 0.025 WETH | Score 50 vs consensus 90 |
| Consensus deviation 20-30% | Medium | 25% | 0.0125 WETH | Score 70 vs consensus 95 |
| Consensus deviation 10-20% | Low | 10% | 0.005 WETH | Score 85 vs consensus 98 |
| Non-reveal after commit | Medium | 10% | 0.005 WETH | Committed but didn't reveal |
| Late reveal (after deadline) | Low | 5% | 0.0025 WETH | Revealed after window |

**Slash Distribution**:
```
Slashed amount
├── 60% → Dispute challenger (if applicable)
├── 30% → Auditors (if applicable)
└── 10% → Protocol treasury
```

**Grace Period**: First 10 evaluations have 50% reduced slashing (learning period)

**Slash Recovery**: Slashed amount is gone; verifier must re-bond to continue

### B) Auditor Slashing

| Offense | Severity | Slash % | Slash Amount | Examples |
|---------|----------|---------|--------------|----------|
| Proven collusion | Critical | 100% | Full stake | Bribery evidence onchain |
| Incorrect vote (majority wrong) | Medium | 20% | 0.05-0.4 WETH | Voted against final resolution |
| Non-reveal after commit | High | 30% | 0.075-0.6 WETH | Failed to reveal vote |
| Late reveal (after deadline) | Medium | 15% | 0.0375-0.3 WETH | Revealed after window |
| Repeated incorrect votes (5+) | High | 50% | 0.125-1.0 WETH | Pattern of bad voting |

**Slash Distribution**:
```
Slashed amount
├── 50% → Correct-voting auditors (split)
├── 30% → Challenger (if dispute-related)
└── 20% → Protocol treasury
```

**Reputation Impact**: Slashing also decreases reputation score

### C) Challenger Slashing (Bond Loss)

| Outcome | Bond Treatment | Recipient |
|---------|----------------|-----------|
| Challenger wins | Returned + reward | Challenger |
| Challenger loses | Forfeited | Disputed verifier |
| Partial win (split vote) | 50% returned | 50% to verifier |
| Frivolous dispute (auto-check fail) | 100% forfeited | Verifier + protocol |

**Nuisance Dispute Detection**:
- If challenger loses 3+ disputes in 30 days → Flagged
- Flagged challengers pay 2x bond for future disputes
- After 5 losses → Temporary ban (30 days)

---

## Fee Structure

### A) Job Submission Fees

**Requester Fees** (one-time per job):

| Job Type | Base Fee | Verifier Count | Total Cost |
|----------|----------|----------------|------------|
| Basic (1-2 models) | 0.01 WETH | 3 verifiers | 0.01 WETH |
| Standard (3-4 models) | 0.02 WETH | 5 verifiers | 0.02 WETH |
| Premium (5+ models) | 0.04 WETH | 7 verifiers | 0.04 WETH |
| Enterprise (custom) | 0.10+ WETH | 10+ verifiers | 0.10+ WETH |

**Fee Breakdown**:
```
Job fee (0.02 WETH example)
├── 80% → Verifiers (0.016 WETH)
├── 15% → Protocol (0.003 WETH)
└── 5% → Staking pool (0.001 WETH)
```

### B) Dispute Fees

**Challenger Pays**:
- Tier 0: 0.01 WETH (auto-check)
- Tier 1: 0.05 WETH (auditor review)
- Tier 2+: Doubles each tier

**No fees for**:
- Auditors (they earn rewards)
- Verifiers being disputed (they risk slash)

### C) Gas Costs (Arbitrum)

**Estimated Gas Costs** (WETH transactions on Arbitrum):

| Operation | Gas Units | Cost (@0.1 gwei) | USD (@$2k ETH) |
|-----------|-----------|------------------|----------------|
| Bond WETH | ~50,000 | 0.000005 ETH | $0.01 |
| Commit evaluation | ~80,000 | 0.000008 ETH | $0.016 |
| Reveal evaluation | ~100,000 | 0.00001 ETH | $0.02 |
| Dispute creation | ~150,000 | 0.000015 ETH | $0.03 |
| Vote commit | ~70,000 | 0.000007 ETH | $0.014 |
| Vote reveal | ~90,000 | 0.000009 ETH | $0.018 |

**Total Cost** (full verifier lifecycle per job):
```
Bond (once) + Commit + Reveal
= $0.01 + $0.016 + $0.02
= $0.046 (~5 cents)

Net profit per job (after gas):
= $10.66 - $0.046
= $10.61
```

---

## Reward Distribution

### A) Verifier Reward Flow

```
┌─────────────────┐
│  Job Submitted  │
│  (0.02 WETH)    │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────┐
│   Commit Phase (1 hour)     │
│   5 verifiers lock bonds    │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│   Reveal Phase (1 hour)     │
│   4 verifiers reveal        │
│   1 verifier doesn't reveal │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│  Consensus Calculation      │
│  3 in consensus range       │
│  1 outlier (>20% deviation) │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Reward Distribution                │
│                                     │
│  3 honest verifiers:                │
│    (0.02 × 80%) / 3 = 0.00533 WETH │
│                                     │
│  1 non-revealer:                    │
│    Slashed 10% = -0.002 WETH       │
│                                     │
│  1 outlier:                         │
│    Slashed 25% = -0.0125 WETH      │
│                                     │
│  Protocol fee:                      │
│    0.02 × 15% = 0.003 WETH         │
│                                     │
│  Staking pool:                      │
│    0.02 × 5% = 0.001 WETH          │
└─────────────────────────────────────┘
```

### B) Auditor Reward Flow (Dispute)

```
┌─────────────────────────┐
│  Dispute Created        │
│  Challenger: 0.05 WETH  │
│  Verifier: 0.05 bonded  │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────────┐
│  Tier 0: Auto-check         │
│  Bundle availability fail   │
└────────┬────────────────────┘
         │ (Escalate if needed)
         ▼
┌─────────────────────────────────┐
│  Tier 1: Auditor Review         │
│  3 auditors selected (VRF)      │
│  Each locks 0.1 WETH            │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Commit Phase                   │
│  All 3 commit vote hashes       │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Reveal Phase                   │
│  2 vote challenger wins         │
│  1 votes verifier wins          │
└────────┬────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│  Resolution (Challenger Wins)        │
│                                      │
│  Verifier slashed:                   │
│    0.05 WETH × 50% = 0.025 WETH     │
│                                      │
│  Distribution:                       │
│  ├─ Challenger: 0.025 × 60% = 0.015 │
│  │  + 0.05 bond back = 0.065 WETH   │
│  ├─ 2 correct auditors:              │
│  │  0.025 × 40% / 2 = 0.005 each    │
│  └─ 1 incorrect auditor:             │
│     -0.02 WETH (20% slash)           │
│                                      │
│  Auditor unlocks:                    │
│    2 correct: 0.1 WETH + 0.005       │
│    1 wrong: 0.08 WETH (slashed 0.02) │
└──────────────────────────────────────┘
```

### C) Monthly Earnings Examples

**Scenario 1: Active Verifier** (100 jobs/month)
```
Jobs completed: 100
Jobs with consensus: 95 (95% accuracy)
Average job payment: 0.02 WETH
Average verifiers per job: 5
Protocol fee: 15%

Gross earnings:
= 95 jobs × (0.02 × 80%) / 5
= 95 × 0.0032
= 0.304 WETH/month

Slashing (5 outliers @ 25%):
= -5 × 0.0125
= -0.0625 WETH

Gas costs (100 jobs @ $0.046):
= -$4.60 ≈ -0.0023 WETH

Net earnings:
= 0.304 - 0.0625 - 0.0023
= 0.2392 WETH/month (~$478/month)

ROI on 0.05 WETH bond:
= ($478/month) / ($100 bond)
= 478% monthly return
= 5,736% APY
```

**Scenario 2: Active Auditor** (20 disputes/month)
```
Disputes per month: 20
Selection probability: 30% (3/10 auditors)
Disputes selected for: 6
Correct vote rate: 90%

Earnings per dispute (avg):
= 0.01 WETH per correct vote

Monthly earnings:
= 6 disputes × 0.9 correct × 0.01
= 0.054 WETH/month (~$108/month)

Slashing (1 incorrect vote):
= -1 × 0.02
= -0.02 WETH

Net earnings:
= 0.054 - 0.02
= 0.034 WETH/month (~$68/month)

ROI on 0.5 WETH stake:
= ($68/month) / ($1,000 stake)
= 6.8% monthly return
= 81.6% APY
```

---

## Economic Security Analysis

### A) Attack Vector 1: Lazy Verifier (Random Scores)

**Attack Strategy**:
- Verifier commits to jobs without actually querying LLMs
- Submits random scores
- Hopes to profit from jobs that align with consensus by chance

**Attack Math**:
```
Probability of random score within consensus (±20%):
= 40% (if consensus is uniform distributed)

Expected jobs in consensus per 100:
= 100 × 0.4 = 40 jobs

Earnings from consensus jobs:
= 40 × 0.00533 WETH = 0.2132 WETH

Slashing from outliers:
= 60 × 0.0125 WETH = 0.75 WETH

Net result:
= 0.2132 - 0.75 = -0.5368 WETH

Loss: $1,073 over 100 jobs
```

**Defense**: Consensus deviation slashing makes random scoring unprofitable

### B) Attack Vector 2: Sybil Auditor Attack

**Attack Strategy**:
- Create 100 auditor identities
- Control majority of auditor committees
- Vote to overturn legitimate disputes

**Attack Cost**:
```
Progressive stake for 100 auditors:
Tier 0-10: 10 × 0.5 = 5 WETH
Tier 11-20: 10 × 0.55 = 5.5 WETH
...
Tier 91-100: 10 × 1.45 = 14.5 WETH

Total stake required:
≈ 95 WETH (~$190,000)

Probability of controlling 2/3 of 3-person committee:
= P(2 or 3 Sybils selected)
= (100/1000)² × (900/1000) × C(3,2) + (100/1000)³
≈ 2.7%

Expected attacks to control one dispute:
= 1 / 0.027 = 37 disputes

Cost per successful attack:
= $190,000 / 37 = $5,135 per dispute

Typical dispute value: $100

Economic result: -$5,035 per attack
```

**Defense**: Progressive staking + VRF randomness makes Sybil attacks prohibitively expensive

### C) Attack Vector 3: Bribery

**Attack Strategy**:
- Bribe auditors to vote favorably
- Pay each auditor more than they'd earn from correct vote

**Attack Math**:
```
Auditor earnings from correct vote: 0.01 WETH ($20)
Bribe needed per auditor: 0.02 WETH ($40) (2x earnings)
Committee size: 3 auditors
Majority needed: 2 auditors

Cost to bribe majority:
= 2 × 0.02 WETH = 0.04 WETH ($80)

Problem: Commit/reveal prevents verification
- Briber can't verify vote before paying
- Auditor can take bribe and vote honestly
- Briber can't punish without revealing collusion

Expected success rate: <50% (auditors defect)

Expected cost per successful bribe:
= $80 / 0.5 = $160

Dispute value: ~$50

Economic result: -$110 per attack
```

**Defense**: Commit/reveal + one-shot game makes bribery unreliable and unprofitable

### D) Attack Vector 4: Bundle Withholding

**Attack Strategy**:
- Verifier submits evaluation
- Unpins evidence from IPFS before dispute
- Challenger can't retrieve bundle to challenge

**Attack Detection**:
```
Tier 0 auto-check:
- Attempts to retrieve bundle from IPFS
- Checks multiple gateways
- Verifies bundle hash

If unavailable:
- Immediate 50% slash (0.025 WETH)
- Challenger wins automatically
- No auditor review needed

Cost of attack:
= $50 (slash) + $100 (bond forfeiture) = $150

Benefit of attack:
= $0 (auto-detected and slashed)
```

**Defense**: Multi-gateway verification + Pinata pinning + automatic slash

---

## Token Flows

### A) Steady State (1000 jobs/month, 20 disputes/month)

```
┌──────────────────────────────────────────┐
│           MONTHLY TOKEN FLOW             │
├──────────────────────────────────────────┤
│                                          │
│  INFLOWS:                                │
│  ├─ Job payments: 20 WETH                │
│  │  (1000 jobs × 0.02 WETH)              │
│  ├─ Dispute bonds: 1 WETH                │
│  │  (20 disputes × 0.05 WETH)            │
│  └─ TOTAL IN: 21 WETH                    │
│                                          │
│  OUTFLOWS:                               │
│  ├─ Verifier rewards: 16 WETH            │
│  │  (80% of job payments)                │
│  ├─ Protocol fees: 3 WETH                │
│  │  (15% of job payments)                │
│  ├─ Auditor rewards: 0.6 WETH            │
│  │  (20 disputes × 0.01 WETH avg × 3)    │
│  ├─ Challenger rewards: 0.9 WETH         │
│  │  (15 winning disputes × 0.06 WETH)    │
│  ├─ Slashing to treasury: 0.5 WETH       │
│  │  (Unclaimed/protocol portion)         │
│  └─ TOTAL OUT: 21 WETH                   │
│                                          │
│  NET FLOW: 0 WETH (balanced)             │
└──────────────────────────────────────────┘
```

### B) Bonded Capital (Total Value Locked)

```
Assuming:
- 100 active verifiers (avg 0.05 WETH bond)
- 50 active auditors (avg 0.75 WETH stake)
- 20 active disputes (avg 0.05 WETH challenger bond)

Total Bonded:
= (100 × 0.05) + (50 × 0.75) + (20 × 0.05)
= 5 + 37.5 + 1
= 43.5 WETH (~$87,000)

Utilization Rate:
= (Locked capital) / (Total bonded)
= (Jobs × 0.01 locked per job) / 43.5
= (50 active jobs × 0.01) / 43.5
= 1.15% (very capital efficient)
```

---

## Attack Cost Modeling

### Summary Table: Attack Costs vs. Expected Value

| Attack Type | Setup Cost | Success Probability | Expected Cost | Typical Gain | Net EV |
|-------------|------------|---------------------|---------------|--------------|--------|
| Lazy verifier (100 jobs) | $100 bond | 40% consensus | $1,073 loss | $0 | **-$1,073** |
| Sybil auditors (100 IDs) | $190,000 | 2.7% per dispute | $5,135/dispute | $100 | **-$5,035** |
| Bribery attack | $80/dispute | <50% success | $160/success | $50 | **-$110** |
| Bundle withholding | $50 slash | 0% (auto-detected) | $150 | $0 | **-$150** |
| Consensus manipulation | $500 (bonds) | 10% success | $5,000/success | $200 | **-$4,800** |

**Key Insight**: All attacks have **negative expected value**

### Cost of 51% Attack (Control Majority of Verifiers)

```
Assumptions:
- Total verifiers: 1,000
- Need to control: 501 verifiers
- Average bond: 0.05 WETH
- Progressive bonding adds 50% cost

Total capital required:
= 501 × 0.05 × 1.5
= 37.575 WETH
≈ $75,000

Benefit of controlling majority:
- Can produce biased consensus
- But: Outliers get slashed
- And: Challengers can dispute
- And: Auditors review disputes

Expected profit from attack:
= Near $0 (would be detected and slashed)

Economic result: -$75,000
```

### Cost of Capturing Auditor Set

```
Assumptions:
- Total auditors: 200
- Need to control: 134 (2/3 majority)
- Progressive stakes: avg 1.25 WETH

Total capital required:
= 134 × 1.25
= 167.5 WETH
≈ $335,000

Probability of 2/3 majority on any dispute:
= (134/200)³ ≈ 30% (optimistic)

Cost per successful attack:
= $335,000 / 0.3 = $1,116,667 per dispute

Typical high-value dispute: $10,000

Economic result: -$1,106,667 per attack
```

**Conclusion**: All economic attacks are deeply unprofitable.

---

## Parameter Tuning

### A) Bond Size Adjustment (ETH Price Volatility)

**Problem**: ETH price changes affect real economic security

**Solution**: Dynamic bond adjustment based on ETH/USD price

```solidity
function getRequiredBond() public view returns (uint256) {
    uint256 ethPrice = getETHPrice(); // From Chainlink oracle
    uint256 targetUSD = 100; // $100 target bond

    return (targetUSD * 1e18) / ethPrice;
}
```

**Example**:
- ETH @ $2,000: Bond = 0.05 WETH ($100)
- ETH @ $4,000: Bond = 0.025 WETH ($100)
- ETH @ $1,000: Bond = 0.1 WETH ($100)

**Update Frequency**: Monthly governance vote

### B) Fee Adjustment (Market Demand)

**Current**: 0.02 WETH per standard job

**Adjustment Triggers**:
- High demand (>90% verifier utilization): Increase fees by 20%
- Low demand (<30% verifier utilization): Decrease fees by 20%
- Equilibrium (30-90%): No change

**Fee Range**:
- Minimum: 0.005 WETH ($10)
- Maximum: 0.10 WETH ($200)

### C) Slashing Percentage Adjustment

**Current**: 50% slash for critical offenses

**Potential Adjustments**:
- If slashing too punitive (high false positive rate): Reduce to 30%
- If attacks persist: Increase to 75%
- If edge cases arise: Tiered slashing (10%/25%/50%)

**Adjustment Process**:
1. Governance proposal
2. 7-day discussion period
3. DAO vote (requires 51% approval)
4. 48-hour timelock
5. Implementation

### D) Progressive Stake Curve

**Current Formula**:
```
Stake = BASE × (100 + floor(count / 10) × 10) / 100
```

**Adjustments**:
- **Steeper curve** (stronger Sybil resistance):
  ```
  Stake = BASE × (100 + floor(count / 10) × 20) / 100
  ```

- **Gentler curve** (easier growth):
  ```
  Stake = BASE × (100 + floor(count / 10) × 5) / 100
  ```

**Tuning Goal**: Balance growth vs. security

---

## Appendix: Formulas & Calculations

### Consensus Deviation Formula

```
deviation = |verifierScore - consensusScore|
deviationPercentage = (deviation / 100) × 100

if deviationPercentage >= 30%:
    slash = bond × 50%
elif deviationPercentage >= 20%:
    slash = bond × 25%
elif deviationPercentage >= 10%:
    slash = bond × 10%
else:
    slash = 0
```

### Auditor Weight Formula (Capped)

```
baseWeight = 1000
reputationBonus = (reputation / MAX_REPUTATION) × MAX_REPUTATION_WEIGHT

totalWeight = baseWeight + (baseWeight × reputationBonus / MAX_REPUTATION_WEIGHT)

Example (reputation = 800/1000):
reputationBonus = (800 / 1000) × 3 = 2.4
totalWeight = 1000 + (1000 × 2.4 / 3) = 1000 + 800 = 1800
```

### Expected Value of Dispute

```
EV(challenger) = P(win) × reward - P(lose) × bond

Example:
P(win) = 60% (legitimate dispute)
Reward if win = 0.065 WETH
Bond at risk = 0.05 WETH

EV = 0.6 × 0.065 - 0.4 × 0.05
   = 0.039 - 0.02
   = 0.019 WETH (~$38 profit)
```

**Implication**: Legitimate disputes are profitable; frivolous disputes are not.

---

## Conclusion

MM Verifier's tokenomics creates a **self-reinforcing economic system** where:

1. ✅ **Honest behavior is profitable**
   - Verifiers earn 478% monthly ROI
   - Auditors earn 81.6% APY
   - Challengers profit from legitimate disputes

2. ✅ **Attacks are unprofitable**
   - All attack vectors have negative EV
   - Sybil attacks cost $190k+ for $100 gain
   - Bribery is unreliable due to commit/reveal

3. ✅ **System is self-sustaining**
   - Protocol fees fund development
   - Slashing funds reward honest actors
   - No token inflation needed

4. ✅ **Capital efficient**
   - Only 1.15% of bonded capital locked at any time
   - Fast unbonding (7-14 days)
   - High ROI on capital deployed

The system achieves **economic security through incentive alignment**, not trust.
