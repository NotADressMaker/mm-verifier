# MAMV Security Features

This document outlines the comprehensive security measures implemented in MAMV to ensure economic accountability, prevent gaming, and maintain system integrity.

## Table of Contents

1. [Evaluator Slashing & Challenger Rewards](#evaluator-slashing--challenger-rewards)
2. [Auditor Commit/Reveal Voting](#auditor-commitreveal-voting)
3. [Reputation Weighting](#reputation-weighting)
4. [Bundle Availability Guarantees](#bundle-availability-guarantees)
5. [Sybil Resistance](#sybil-resistance)
6. [Attack Scenarios & Mitigations](#attack-scenarios--mitigations)

---

## Evaluator Slashing & Challenger Rewards

### Overview

Verifiers (evaluators) who submit invalid bundles or deviate significantly from consensus are slashed. Challengers who successfully dispute receive rewards from the slashed pool.

### Implementation

#### 1. **Bundle Invalidity Slashing**

**Contract**: `DisputeResolverV2.sol`

```solidity
function checkBundleAvailability(
    bytes32 disputeId,
    bool bundleAvailable,
    bytes32 bundleHash
) external onlyOwner
```

**Triggers**:
- Evidence bundle not retrievable from IPFS
- Bundle hash mismatch
- Missing required fields in bundle
- Malformed evidence structure

**Penalty**: 50% of verifier's staked amount

#### 2. **Consensus Deviation Slashing**

**Contract**: `DisputeResolverV2.sol`

```solidity
function slashConsensusDeviators(
    bytes32 jobId,
    uint256 consensusScore,
    address[] calldata verifiers,
    uint256[] calldata scores
) external onlyOwner
```

**Triggers**:
- Verifier score deviates >20% from final consensus
- Example: Consensus = 80, Verifier = 60 → 25% deviation → **Slash**

**Penalty**: Progressive based on deviation magnitude

**Reasoning**: Prevents verifiers from:
- Random scoring
- Lazy evaluation
- Malicious score manipulation

#### 3. **Challenger Rewards**

When a dispute is won by the challenger:

**Reward Distribution**:
```
Slashed Amount (50% of verifier stake)
├── 60% → Challenger
├── 40% → Auditors (split evenly among correct voters)
└── Challenger's original stake returned
```

**Example**:
- Verifier stake: 0.1 ETH
- Slashed: 0.05 ETH (50%)
- Challenger gets: 0.03 ETH (60% of slashed)
- Auditors get: 0.02 ETH (40% of slashed, split)
- Challenger stake returned: Original deposit back

**Why This Works**:
- Incentivizes legitimate challenges
- Deters frivolous disputes (challenger loses stake if wrong)
- Rewards auditors for honest work

---

## Auditor Commit/Reveal Voting

### Problem

Direct voting allows:
- **Copy-voting**: Later voters see earlier votes, copy the majority
- **Bribery**: Colluding parties can verify votes before paying bribes

### Solution

**Two-phase voting protocol**:

### Phase 1: Commit

**Contract**: `DisputeResolverV2.sol`

```solidity
function commitAuditorVote(bytes32 disputeId, bytes32 commitHash) external
```

**Auditor submits**:
```
commitHash = keccak256(disputeId, auditor, vote, salt)
```

**Properties**:
- Vote is hidden (hashed)
- Cannot be changed after commit
- Cannot see others' votes

**Deadline**: 1 day commit period

### Phase 2: Reveal

```solidity
function revealAuditorVote(
    bytes32 disputeId,
    bool challengerWins,
    bytes32 salt
) external
```

**Auditor reveals**:
- Their actual vote
- The salt used in commit

**Verification**:
```solidity
bytes32 computedHash = keccak256(disputeId, auditor, vote, salt);
require(computedHash == storedCommitHash, "Invalid reveal");
```

**Deadline**: 1 day reveal period

### Non-Reveal Penalties

```solidity
function forceFinalizeVoting(bytes32 disputeId) external
```

**If auditor doesn't reveal**:
- Reputation decreased
- No reward (even if others vote same way)
- Vote not counted

**Why This Works**:
- **No copy-voting**: Commits happen before anyone knows votes
- **Bribery harder**: Briber can't verify vote until reveal (too late to punish)
- **Cryptographically enforced**: Can't change vote after commit

---

## Reputation Weighting

### Problem

Reputation systems can centralize:
- High-reputation auditors get selected more
- Network effect: More selection → More earnings → Higher reputation → Even more selection
- Eventually: Few auditors dominate all disputes

### Solution: Capped Reputation Weighting

**Contract**: `AuditorRegistryV2.sol`

```solidity
uint256 public constant MAX_REPUTATION_WEIGHT = 3; // Max 3x from reputation
uint256 public constant BASE_WEIGHT = 1000; // Everyone gets base weight
```

### Weight Calculation

```solidity
function _getAuditorWeight(address auditor) private view returns (uint256) {
    uint256 baseWeight = BASE_WEIGHT; // 1000

    // Reputation bonus: 0-1000 reputation → 0-3x multiplier
    uint256 reputationBonus = (reputation * MAX_REPUTATION_WEIGHT) / MAX_REPUTATION;

    // Total = base + capped bonus
    return baseWeight + (baseWeight * reputationBonus) / MAX_REPUTATION_WEIGHT;
}
```

**Example Weights**:

| Auditor | Reputation | Bonus Multiplier | Total Weight | Selection Probability |
|---------|------------|------------------|--------------|----------------------|
| Newbie  | 500/1000   | 1.5x            | 1000 + 1500 = 2500 | ~31% |
| Average | 700/1000   | 2.1x            | 1000 + 2100 = 3100 | ~39% |
| Expert  | 1000/1000  | 3.0x            | 1000 + 3000 = 4000 | ~50% |

**Expert has only 1.6x advantage over newbie** (not 10x or 100x)

### Reputation Floors & Ceilings

```solidity
uint256 public constant MAX_REPUTATION = 1000; // Can't go above
uint256 public constant MIN_REPUTATION = 100; // Can't go below
```

**Why floors matter**:
- Prevents permanent exclusion from bad votes
- Everyone gets minimum 10% reputation → minimum selection chance
- Allows recovery from mistakes

### VRF Randomness Primary

**Selection algorithm**:
```
1. VRF generates random numbers (unpredictable)
2. Weighted selection using reputation (capped)
3. VRF prevents prediction/manipulation
```

**Reputation is secondary** to cryptographic randomness.

---

## Bundle Availability Guarantees

### Problem

Verifiers could:
1. Commit evaluations without actually creating evidence
2. Claim "IPFS CID" that doesn't exist
3. Upload bundle, then unpin it (make it unavailable)
4. Win disputes by making challenger unable to retrieve evidence

### Solution: Multi-Layer Availability Checks

**Module**: `ipfsStorageV2.ts`

### 1. **Mandatory IPFS Upload**

```typescript
function uploadEvidenceToIPFS(bundle: EvidenceBundle):
  Promise<{ cid: string; proof: PinningProof }>
```

**Requirements**:
- Upload to local IPFS node with `pin: true`
- Upload to Pinata (external pinning service)
- Verify retrieval from public gateways

**Pinning Proof Structure**:
```typescript
interface PinningProof {
  cid: string;              // IPFS CID
  timestamp: number;        // Upload time
  pinataHash?: string;      // Pinata confirmation
  size: number;             // Bundle size
  pinned: boolean;          // Pin status
  gatewayUrls: string[];    // Public gateways serving content
}
```

### 2. **Bundle Availability Check (Tier 0 Dispute)**

**Contract**: `DisputeResolverV2.sol`

```solidity
function checkBundleAvailability(
    bytes32 disputeId,
    bool bundleAvailable,
    bytes32 bundleHash
) external onlyOwner
```

**Automated check**:
- Oracle attempts to retrieve CID from IPFS
- Verifies bundle hash matches commitment
- Checks bundle has required fields

**Outcomes**:
- ✅ Available & valid → Verifier wins (no auditor review needed)
- ❌ Unavailable → **Immediate slash**, challenger wins
- ⚠️ Available but disputed content → Escalate to auditors

### 3. **Multi-Gateway Verification**

```typescript
async function verifyGatewayAvailability(cid: string): Promise<string[]>
```

**Checks**:
- `ipfs.io`
- `gateway.pinata.cloud`
- `cloudflare-ipfs.com`
- `dweb.link`

**Requirement**: Must be retrievable from ≥2 public gateways

### 4. **Retrieval Verification**

```typescript
async function retrieveEvidenceFromIPFS(cid: string):
  Promise<{ bundle: EvidenceBundle; verified: boolean }>
```

**Process**:
1. Try local IPFS node
2. Fallback to public gateways
3. Verify bundle integrity (hash match)
4. Validate required fields present

**If retrieval fails**:
- Verifier gets slashed
- Challenger wins automatically
- No auditor review needed

### 5. **Persistent Pinning**

**Pinata Integration**:
```typescript
async function pinToPinata(content: string): Promise<string>
```

**Benefits**:
- Professional pinning service
- Redundancy beyond local node
- Persistent storage (doesn't disappear if node goes offline)

**Cost**: ~$0.15/GB/month (very cheap for evidence bundles ~10-100KB)

---

## Sybil Resistance

### Problem

Attacker could:
- Create 100 auditor identities
- Stake minimum on each
- Dominate auditor selection through volume
- Coordinate votes across identities

### Solution: Multi-Layered Sybil Defense

**Contract**: `AuditorRegistryV2.sol`

### 1. **Allowlist Mode (Gradual Decentralization)**

```solidity
bool public allowlistMode = true; // Start permissioned
```

**Phase 1: Launch** (Allowlist ON)
- Only pre-approved auditors can participate
- Manual vetting of initial auditors
- Establishes reputation baseline

**Phase 2: Gradual Opening** (Allowlist ON, but adding more)
```solidity
function batchAddToAllowlist(address[] calldata auditors) external onlyOwner
```
- Add vetted participants incrementally
- Monitor for bad actors
- Build reputation distribution

**Phase 3: Fully Open** (Allowlist OFF)
```solidity
function setAllowlistMode(bool enabled) external onlyOwner
```
- Anyone can register (with economic barriers)
- Reputation and stake prevent gaming

### 2. **Progressive Stake Requirements**

```solidity
function getRequiredStake() public view returns (uint256) {
    uint256 auditorCount = auditorList.length;
    uint256 tier = auditorCount / AUDITORS_PER_TIER; // Every 10 auditors
    uint256 baseStake = 0.5 ether;

    // +10% per tier
    uint256 multiplier = 100 + (tier * STAKE_MULTIPLIER_INCREMENT);
    return (baseStake * multiplier) / 100;
}
```

**Example Stakes**:
| Auditors | Tier | Required Stake | USD (ETH=$2000) |
|----------|------|----------------|-----------------|
| 0-9      | 0    | 0.5 ETH       | $1,000         |
| 10-19    | 1    | 0.55 ETH      | $1,100         |
| 20-29    | 2    | 0.605 ETH     | $1,210         |
| 100-109  | 10   | 1.0 ETH       | $2,000         |

**Why This Works**:
- Early auditors (trusted) pay less
- Later auditors (unknown) pay more
- Creates natural ceiling on Sybil attacks
- 100 fake identities at tier 10 = 100 ETH = $200,000

### 3. **Reputation-Based Filtering**

```solidity
uint256 public constant MIN_REPUTATION = 100; // 10% minimum
```

**New auditors start at 500/1000 (50%)**

**Bad auditor trajectory**:
- Start: 500 reputation
- Wrong vote 1: 480 reputation
- Wrong vote 2: 460 reputation
- Wrong vote 5: 400 reputation
- Wrong vote 15: 100 reputation (floor)

**At 100 reputation**: Still can participate, but selection chance is minimal

**Sybil attack**:
- Create 100 identities
- All start at 500 reputation
- Attack requires coordinating all to vote wrong
- One wrong vote across all: All drop to 480
- Reputation damage is **permanent** (slow to rebuild)

### 4. **VRF Anti-Gaming**

**Chainlink VRF**: Auditors selected **after** dispute is created

**Attack scenario**:
- Attacker has 10 Sybil identities
- Wants to manipulate dispute X
- Problem: **Can't know which identities will be selected**
- VRF output is unpredictable until after request
- By the time they know, commit phase has started

**Even if selected**:
- Commit/reveal prevents coordination
- Need majority (2/3 of committee)
- Other auditors are honest (if system is healthy)
- Economic loss if caught (slash + reputation)

### 5. **Economic Analysis**

**Cost to attack 3-auditor committee**:

Assumptions:
- Need 2/3 auditors to be Sybils
- Selection probability with 100 Sybils out of 1000 auditors = 10%
- Progressive stake at tier 100 ≈ 2 ETH/auditor

**Calculation**:
```
100 Sybil identities × 2 ETH = 200 ETH stake

Probability of controlling 2/3 auditors:
P(2 or 3 Sybils selected) ≈ 0.027 (2.7%)

Expected cost per successful attack:
200 ETH / 0.027 = 7,400 ETH

Value of typical dispute: < 1 ETH

Economic rationality: Attack is -EV
```

**Defense gets stronger over time**:
- Honest auditors build reputation (higher weight)
- Sybils dilute each other (more competition)
- Stake requirements increase (costlier to create new Sybils)

---

## Attack Scenarios & Mitigations

### Attack 1: Lazy Verifier (Submit Random Scores)

**Attack**: Verifier commits to jobs, submits random scores without actually querying LLMs.

**Detection**:
- Consensus deviation slashing (≥20% deviation)
- Other verifiers doing real work produce similar scores
- Lazy verifier's random scores deviate

**Mitigation**:
```solidity
slashConsensusDeviators(...) // Slash 50% stake
```

**Economic Deterrent**: Expected loss > expected reward

---

### Attack 2: Challenger Griefing (False Disputes)

**Attack**: Challenger disputes valid evaluations to grief verifiers.

**Detection**: Bundle availability check + auditor review

**Mitigation**:
- Tier 0: Automated check rejects baseless disputes
- Tier 1: Auditors vote challenger loses
- **Challenger loses stake** (transferred to verifier)

**Economic Deterrent**: Repeated griefing = losing money

---

### Attack 3: Auditor Collusion (Vote Buying)

**Attack**: Disputing party bribes auditors to vote their way.

**Mitigation**:
- **Commit/reveal**: Can't verify vote until after reveal
- **VRF selection**: Don't know who to bribe until too late
- **Reputation damage**: Incorrect votes hurt long-term earnings
- **Slashing**: Lose stake if pattern detected

**Why It Fails**:
- Briber must commit before knowing auditors
- Auditors selected after dispute created (VRF)
- Can't verify vote before reward paid
- Auditor has incentive to vote honestly, take bribe, and not deliver

---

### Attack 4: Sybil Attack on Auditors

**Attack**: Create many auditor identities to control votes.

**Mitigation**:
- **Allowlist mode** (launch phase)
- **Progressive stakes** (expensive to create many)
- **VRF randomness** (can't predict selection)
- **Reputation floors** (Sybils start at 50%, need time to build trust)

**Math**:
- Cost: 100 Sybils × 2 ETH = 200 ETH
- Probability of controlling dispute: 2.7%
- Expected value: Negative

---

### Attack 5: Bundle Withholding

**Attack**: Verifier commits, then unpins evidence before dispute.

**Mitigation**:
- **Pinata pinning**: External service, can't unpin unilaterally
- **Multi-gateway check**: Must be available on public gateways
- **Immediate slash**: If bundle unavailable during dispute

**Economic Deterrent**: Withholding = automatic loss + slash

---

## Security Checklist for Deployment

Before mainnet launch:

### Smart Contracts
- [ ] Audit by reputable firm (Trail of Bits, OpenZeppelin, etc.)
- [ ] Formal verification of critical functions
- [ ] Bug bounty program ($50k-$100k rewards)
- [ ] Multi-sig ownership (3/5 or 5/7)
- [ ] Timelock on parameter changes (48h minimum)

### Auditor Registry
- [ ] Launch in allowlist mode
- [ ] Manually vet initial 10-20 auditors
- [ ] Monitor for 3 months before opening
- [ ] Set progressive stakes appropriately for ETH price
- [ ] Test VRF on testnets extensively

### Bundle Storage
- [ ] Pinata account with >99.9% uptime
- [ ] Backup pinning service (Web3.Storage, Filebase)
- [ ] Monitor gateway availability daily
- [ ] Prune old bundles after 1 year (keep hashes)

### Monitoring
- [ ] Alerting for unusual slashing patterns
- [ ] Dashboard for reputation distribution
- [ ] Automated checks for Sybil clusters
- [ ] Dispute outcome tracking (challenger win rate)

### Economic Parameters
- [ ] Simulate attack costs at various ETH prices
- [ ] Adjust MIN_STAKE if ETH drops <$1000 or >$5000
- [ ] Review slashing percentages quarterly
- [ ] Monitor challenger/verifier ratios

---

## Conclusion

MAMV's security model combines:
1. **Economic incentives** (slashing, rewards)
2. **Cryptographic proofs** (commit/reveal, VRF)
3. **Decentralized verification** (multi-auditor, consensus)
4. **Progressive resistance** (reputation, stake scaling)

No single mechanism is perfect, but **layered defenses** make attacks:
- Economically irrational
- Technically difficult
- Easily detectable
- Heavily penalized

The system becomes **more secure over time** as:
- Honest participants build reputation
- Attack costs increase (progressive stakes)
- Detection improves (historical patterns)
- Community governance strengthens

---

## Threat Model

This section formalizes what MAMV protects against, what it doesn't, and the assumptions it makes.

### In-Scope Threats

#### 1. **Economic Attacks**
- ✅ Verifier collusion to provide false evaluations
- ✅ Griefing attacks (spam disputes to waste gas/time)
- ✅ Flash-loan attacks on governance
- ✅ Bond manipulation to avoid slashing
- ✅ Front-running evaluation submissions

#### 2. **Technical Attacks**
- ✅ Evidence manipulation after submission
- ✅ IPFS unavailability exploits
- ✅ Sybil attacks via multiple identities
- ✅ VRF prediction/manipulation
- ✅ Reentrancy attacks on fund withdrawals

#### 3. **Governance Attacks**
- ✅ Parameter manipulation (fee rates, thresholds)
- ✅ Emergency pause abuse
- ✅ Ownership transfer exploits
- ✅ Proposal spam/DOS

### Out-of-Scope Threats

#### 1. **Infrastructure Failures**
- ❌ Complete IPFS network failure
- ❌ Ethereum consensus failure
- ❌ Chainlink VRF outage >7 days
- ❌ All LLM providers offline

*Mitigation: System degrades gracefully but requires manual intervention*

#### 2. **Legal/Regulatory**
- ❌ Government seizure of contracts
- ❌ Jurisdictional bans on participation
- ❌ Liability for AI outputs

*Mitigation: Decentralization + jurisdiction shopping*

#### 3. **Cryptographic Breaks**
- ❌ SHA-256 collision attacks
- ❌ ECDSA private key recovery
- ❌ VRF bias attacks

*Mitigation: Upgrade path if cryptography breaks*

### Threat Severity Matrix

| Threat | Likelihood | Impact | Mitigation | Residual Risk |
|--------|-----------|--------|------------|---------------|
| Verifier Collusion | MEDIUM | HIGH | Slashing + VRF + Reputation | LOW |
| Griefing Disputes | HIGH | MEDIUM | Escalating stakes + cooldowns | LOW |
| Flash Loan Governance | LOW | HIGH | 48h timelock + proposal threshold | VERY LOW |
| Sybil Attacks | MEDIUM | MEDIUM | Progressive stakes + reputation | LOW |
| IPFS Unavailability | LOW | HIGH | Multi-provider pinning + cache | MEDIUM |
| Reentrancy | MEDIUM | HIGH | ReentrancyGuard + checks-effects | VERY LOW |

### Assumptions

1. **Ethereum Security**: Assume Ethereum consensus is secure
2. **VRF Randomness**: Chainlink VRF provides unbiased randomness
3. **Economic Rationality**: Most actors are profit-maximizing
4. **Majority Honesty**: >50% of stake is controlled by honest actors
5. **LLM Availability**: At least 2/N LLM providers are functional
6. **IPFS Persistence**: Content pinned to 2+ providers persists >30 days

---

## Smart Contract Invariants

Critical properties that must always hold. These should be enforced via invariant tests (Foundry/Echidna).

### Bond Vault Invariants

```solidity
// contracts/BondVaultWETH.sol

// INVARIANT 1: Total bonds never exceed sum of individual bonds
assert(totalBondsLocked <= sum(bondedAmount[verifier] for all verifiers));

// INVARIANT 2: Bonds can only decrease via slash or withdraw
assert(bondedAmount[verifier] <= bondedAmount_prev[verifier]);

// INVARIANT 3: Slashed bonds are transferred, never destroyed
assert(WETH.balanceOf(address(this)) + totalSlashedAndWithdrawn == initialDeposits);

// INVARIANT 4: Cannot withdraw more than bonded
assert(withdrawAmount <= bondedAmount[msg.sender]);
```

### Dispute Ladder Invariants

```solidity
// contracts/DisputeLadder.sol

// INVARIANT 1: Dispute state transitions are monotonic
assert(newState >= currentState); // PENDING(0) → VOTING(1) → RESOLVED(2)

// INVARIANT 2: Resolved disputes cannot be reopened
assert(dispute.state == RESOLVED => dispute.state' == RESOLVED);

// INVARIANT 3: Total jury votes <= jury size
assert(sum(votes) <= jurySize);

// INVARIANT 4: Dispute bonds >= tier minimum
assert(dispute.bondAmount >= tierMinimumBond[tier]);

// INVARIANT 5: Rewards never exceed slashed amounts
assert(sum(rewardsDistributed) <= totalSlashed);
```

### Verification Marketplace Invariants

```solidity
// contracts/VerificationMarketplace.sol

// INVARIANT 1: Task rewards are fully distributed or returned
assert(task.feePool == 0 || task.status == REFUNDED);

// INVARIANT 2: Evaluator count matches revealed evaluations
assert(task.evaluators.length == task.revealedCount + task.unrevealed Count);

// INVARIANT 3: Commit hash cannot change after reveal
assert(task.revealed[evaluator] => task.commitHash[evaluator] == hash_prev);

// INVARIANT 4: Task cannot finalize before deadline
assert(task.finalized => block.timestamp >= task.deadline);
```

### Governance Invariants

```solidity
// contracts/governance/MAMVGovernor.sol

// INVARIANT 1: Proposal threshold is fraction of total supply
assert(proposalThreshold <= totalSupply);

// INVARIANT 2: Quorum is achievable
assert(quorumVotes <= totalSupply);

// INVARIANT 3: Voting power equals delegated stakes
assert(getVotes(account) <= stakedTokens[account] + sum(delegatedFrom));

// INVARIANT 4: Timelock delay is non-zero
assert(timelockDelay > 0);
```

### Staking Invariants

```solidity
// contracts/tokenomics/VerifyStaking.sol

// INVARIANT 1: Reward debt tracks distributed rewards
assert(rewardDebt[user] <= user.amount * accRewardPerShare / 1e12);

// INVARIANT 2: Total staked equals sum of individual stakes
assert(totalStaked == sum(stakedAmount[user] for all users));

// INVARIANT 3: Rewards can't be claimed twice
assert(claimedRewards <= distributedRewards);

// INVARIANT 4: Acc reward per share is monotonic
assert(accRewardPerShare >= accRewardPerShare_prev);
```

### Mining Invariants

```solidity
// contracts/tokenomics/VerifierMining.sol

// INVARIANT 1: Epoch rewards are bounded
assert(epochRewards <= maxEpochRewards);

// INVARIANT 2: Total claimed rewards <= total emitted
assert(sum(claimed) <= sum(epochRewards * completedEpochs));

// INVARIANT 3: Points are proportional to evaluations
assert(verifierPoints[epoch][user] >= evaluationCount[user]);

// INVARIANT 4: Cannot claim same epoch twice
assert(hasClaimed[epoch][user] == false || hasClaimed'[epoch][user] == false);
```

---

## Event Completeness Checklist

Every state transition MUST emit an event for off-chain indexers.

### Required Events

| Contract | State Change | Event | Indexed Parameters |
|----------|--------------|-------|-------------------|
| BondVaultWETH | Bond deposited | `BondDeposited` | verifier, amount |
| BondVaultWETH | Bond slashed | `BondSlashed` | verifier, amount, reason |
| BondVaultWETH | Bond withdrawn | `BondWithdrawn` | verifier, amount |
| DisputeLadder | Dispute created | `DisputeCreated` | disputeId, taskId, disputer |
| DisputeLadder | Jury selected | `JurySelected` | disputeId, jurors[] |
| DisputeLadder | Vote cast | `VoteCast` | disputeId, juror, vote |
| DisputeLadder | Dispute resolved | `DisputeResolved` | disputeId, outcome, winner |
| VerificationMarketplace | Task created | `TaskCreated` | taskId, requester, reward |
| VerificationMarketplace | Evaluation committed | `Committed` | taskId, evaluator, commitHash |
| VerificationMarketplace | Evaluation revealed | `Revealed` | taskId, evaluator, score |
| VerificationMarketplace | Task finalized | `Finalized` | taskId, finalScore, feePool |
| MAMVGovernor | Proposal created | `ProposalCreated` | proposalId, proposer, targets[] |
| MAMVGovernor | Vote cast | `VoteCast` | voter, proposalId, support, weight |
| MAMVGovernor | Proposal queued | `ProposalQueued` | proposalId, eta |
| MAMVGovernor | Proposal executed | `ProposalExecuted` | proposalId |

### Event Indexing Best Practices

1. **Index up to 3 parameters** for efficient filtering
2. **Always index addresses** (verifier, user, proposer, etc.)
3. **Index IDs** (taskId, disputeId, proposalId)
4. **Don't index large arrays** (use separate events)
5. **Include timestamps** for time-series analysis

---

## Formal Roles Documentation

Explicit documentation of who can do what in the system.

### Role: Owner (Governance Multisig)

**Can**:
- Pause/unpause contracts (emergency only)
- Update fee parameters (within bounds)
- Add/remove trusted attesters (for AI models)
- Configure cross-chain bridges
- Upgrade proxy implementations (if upgradeable)

**Cannot**:
- Withdraw user funds
- Modify completed tasks/disputes
- Change past events
- Override VRF randomness
- Skip timelock delays

**Transition Path**: Owner → TimelockController → DAO Governance

### Role: Verifier (Staked Participant)

**Can**:
- Submit evaluations for tasks
- Claim rewards for honest work
- Withdraw unbonded stake
- Delegate voting power

**Cannot**:
- Modify other verifiers' evaluations
- Skip commit-reveal process
- Withdraw bonded stake (without cooldown)
- Vote on disputes they're involved in

### Role: Disputer (Challenge Initiator)

**Can**:
- Challenge evaluation results
- Escalate disputes to higher tiers
- Claim rewards if challenge succeeds

**Cannot**:
- Dispute without bond
- Dispute already-resolved tasks
- Manipulate jury selection

### Role: Juror (VRF-Selected Auditor)

**Can**:
- Vote on assigned disputes
- Earn jury fees
- Build reputation

**Cannot**:
- Volunteer for specific disputes
- Change vote after commitment
- Vote multiple times

### Role: AI Agent Operator

**Can**:
- Register AI agents with attestation
- Earn verification rewards
- Update agent metadata

**Cannot**:
- Bypass staking requirements
- Claim false model attestations
- Manipulate accuracy metrics

---

## Griefability Analysis

What can attackers waste without direct gain?

### Attack: Spam Disputes

**Cost**: `minDisputeBond * N` (starts at 0.01 ETH)
**Damage**: Wasted gas for jury, delayed task completion
**Mitigation**:
- Escalating bonds (doubles each tier)
- Cooldown periods between disputes
- Slashing for invalid disputes
**Max Grief Ratio**: ~10x (spend 1 ETH to waste 10 ETH of others' gas)
**Acceptable**: Yes (ratio <100x considered acceptable)

### Attack: Front-Running Evaluations

**Cost**: Gas + MEV fees
**Damage**: Steal evaluation slots from honest verifiers
**Mitigation**:
- Commit-reveal prevents copying answers
- Time windows prevent rushing
- Reputation loss for copied work
**Max Grief Ratio**: ~1x (attacker loses more than victims)
**Acceptable**: Yes

### Attack: IPFS Evidence Spam

**Cost**: IPFS pinning fees
**Damage**: Bloat evidence storage
**Mitigation**:
- Hash verification (can't fake evidence)
- Slashing for invalid bundles
- Prune old evidence after 1 year
**Max Grief Ratio**: ~5x (cheap to upload, expensive to validate)
**Mitigation Needed**: Rate limiting on evidence uploads

---

## Security Roadmap

Prioritized security improvements for mainnet.

### Phase 1: Pre-Audit (Before Testnet)
- [ ] Implement all invariant tests
- [ ] Add ReentrancyGuard to all fund-handling functions
- [ ] Formalize role access control
- [ ] Complete event emission checklist
- [ ] Add natspec comments for all public functions

### Phase 2: Audit Prep (Before Mainnet)
- [ ] Trail of Bits security audit
- [ ] Formal verification of critical paths (Certora)
- [ ] Bug bounty program (Immunefi)
- [ ] Multi-sig deployment scripts
- [ ] Timelock configuration

### Phase 3: Post-Launch
- [ ] Real-time monitoring dashboard
- [ ] Automated invariant checking (on-chain + off-chain)
- [ ] Regular parameter tuning based on attack simulations
- [ ] Quarterly security reviews
- [ ] Gradual decentralization of ownership

---

**Last Updated**: 2026-01-10
**Security Contact**: security@mamverifier.xyz (to be created)
**Bug Bounty**: Up to $100,000 for critical vulnerabilities
