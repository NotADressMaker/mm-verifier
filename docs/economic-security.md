# Economic Security Analysis

This document operationalizes MMV’s economic security assumptions into concrete parameters and worked examples tied directly to the on-chain contracts. It is meant to be read alongside the marketplace and dispute contracts to guide parameter tuning and future audits.

## Threat model

**Actors**
- **Honest verifiers**: submit correct evaluations and reveal on time.
- **Malicious verifiers**: attempt to mis-score outputs, skip reveals, or collude with others.
- **Requesters/submitters**: try to bias outputs or grief by opening disputes.
- **Jurors/auditors**: selected via VRF for disputes; can be bribed or collude.
- **Collusion groups**: sets of verifiers, jurors, or both.

**Attacks covered**
- **Bribe attacks**: attacker pays verifiers or jurors to misreport or vote incorrectly.
- **Sybil attacks**: attacker spawns multiple identities to gain selection probability.
- **Griefing**: attacker forces disputes or reveals to waste time and fees.
- **Liveness attacks**: withholding reveals or votes to stall resolution.
- **VRF manipulation**: attacker attempts to bias juror selection (assumed infeasible).

## Game-theoretic outline and assumptions

**Assumptions**
1. Participants are **rational** (maximize expected payoff).
2. **Commit-reveal** prevents copying and reduces reactive collusion.
3. **Side channels** exist but are bounded; bribes are possible but must compensate expected losses.
4. **VRF is secure** (unbiasable randomness for jury selection).
5. **On-chain enforcement**: disputes, bonds, and rewards are enforced as coded.

**Notation**
- `V` = job value (reward pool or implied business value).
- `N` = number of verifiers.
- `q` = quorum (minimum colluding votes to bias outcome).
- `s` = stake/bond at risk per verifier (evaluation bond or locked stake).
- `σ` = slashing fraction of stake at risk (e.g., 50% in `StakingManager`).
- `p_detect` = probability a lie is detected and escalated to a slashing/dispute outcome.
- `B_c` = challenger bond at dispute open.
- `B_Li` = appeal bond at dispute level `i`.

## Honesty incentives (best-response sketch)

Honest behavior should be a best response when the **expected penalty of lying** exceeds the **expected gain**.

**Expected gain from lying**  
`E[gain] ≤ V / N` (upper bound: share of reward pool or business value captured by a single verifier).

**Expected loss from lying**  
`E[loss] ≥ p_detect * σ * s + p_detect * (foregone rewards)`  
In the current contracts, **evaluation bonds are returned at finalize regardless of accuracy** in `VerifierMarketplace`, so `σ*s` only applies if stake slashing is wired in (see “Known Gaps”). As of now, honest incentives are primarily driven by:
- **Reward upside** (accuracy bonuses around the median).
- **Dispute bonds** and juror penalties, when disputes are opened in `DisputeLadder`.

**Honesty condition (informal)**  
If the protocol wires slashing to incorrect evaluations, honesty is a best response whenever:
`p_detect * σ * s ≥ V / N`  
or, rearranged:
`s ≥ (V / N) / (p_detect * σ)`

## Collusion analysis (VRF + quorum)

**What VRF prevents**
- Predictable jury selection (prevents pre-arranged juror bribery).
- Simple “pick your friends” attacks for dispute resolution.

**What VRF does *not* prevent**
- **Post-selection bribery**: an attacker can still bribe selected jurors after the VRF reveals them.
- **Out-of-band collusion** among verifiers or jurors once selected.
- **Sybil pools** if minimum stake requirements are too low.

**Mitigation knobs (on-chain)**
- **Minimum stakes**: `MIN_VERIFIER_STAKE`, `MIN_AUDITOR_STAKE`, and `AuditorRegistry.minStake` raise Sybil costs.
- **Jury size**: `jurySizes[L1..L3]` increases collusion cost (bribe majority).
- **Appeal bonds**: `appealBondRequired[L1..L3]` make repeated escalations expensive.
- **Human expert weight**: `humanExpertWeightMultiplier` increases human juror representation, raising adversarial coordination cost.

## Attack-cost analysis (worked examples)

> These examples use *real contract parameters* from the codebase and deployment defaults.

### Example 1: Full dispute ladder bond exposure
From `DisputeLadder`, default bonds are:
- `minChallengeBond[FABRICATION] = 0.05 WETH`
- `appealBondRequired[L1] = 0.05 WETH`, `L2 = 0.10 WETH`, `L3 = 0.20 WETH`

If a dispute escalates from L0 → L3, the **total bonded capital at risk** on a single side is:
`0.05 + 0.05 + 0.10 + 0.20 = 0.40 WETH`  
This is the *minimum* capital required to fully litigate a fabrication dispute through all tiers.

### Example 2: Verifier stake slashing deterrence
`StakingManager` defines `MIN_VERIFIER_STAKE = 0.1 ETH` and `SLASH_PERCENTAGE = 50%`.  
If slashing is integrated with incorrect evaluations, a verifier faces **0.05 ETH** expected loss per detected lie at minimum stake.  
For a 3-verifier job (`N=3`), the maximum one-verifier gain from lying is `V/3`.  
Honesty is preferred if `p_detect * 0.05 ETH ≥ V/3`.

### Example 3: Deployment defaults for evaluation bonds
The deployment script defaults to:
- `EVAL_BOND = 0.02 WETH`
- `DISPUTE_BOND = 0.01 WETH`

Even without stake slashing, a malicious verifier must **front capital** for each evaluation, and a challenger must post a dispute bond to contest. These values set the minimum liquidity required to spam evaluations or disputes.

## Minimum viable stake guidance

Let `V` be the job value and `q` be the minimum collusion quorum.  
For slashing-based security, a conservative guidance for minimum verifier stake is:

```
min_stake ≥ (V / q) / (p_detect * σ)
```

If you cannot estimate `p_detect`, set it to a conservative bound (e.g., 0.2–0.4) and increase stake or quorum accordingly. Use the calculator in the next section to explore parameter ranges.

## Parameter calculator

Use the simple calculator in `scripts/econ_calc.py` to sanity-check attack costs and minimum stake recommendations.

```bash
python scripts/econ_calc.py \
  --job-value 1.0 \
  --num-verifiers 3 \
  --quorum 2 \
  --stake-per-verifier 0.1 \
  --ladder-multiplier 2 \
  --bribe-budget 0.25
```

The script prints:
- Estimated bribe thresholds per verifier
- Attack cost range for quorum capture
- Suggested minimum stake per verifier for a given job value

**Mapping note:** `DisputeLadder` uses fixed appeal bonds. If you want the calculator to mirror current defaults, set `stake-per-verifier` to the L1 appeal bond and use `ladder-multiplier ≈ 2.0` (since 0.05 → 0.10 → 0.20 WETH), or set the multiplier to `1.0` if you are using fixed bond values directly in another spreadsheet.

## Parameters and how to tune them (mapped to contracts)

| Parameter | Purpose | Contract / Source |
| --- | --- | --- |
| `evalBond` | Capital posted at commit time | `VerifierMarketplace.evalBond` (constructor / `setBonds`) |
| `disputeBond` | Minimum dispute bond in marketplace | `VerifierMarketplace.disputeBond` |
| `MIN_VERIFIER_STAKE` | Minimum verifier stake | `StakingManager` |
| `MIN_AUDITOR_STAKE` | Minimum auditor stake | `StakingManager` |
| `SLASH_PERCENTAGE` | Slashing fraction | `StakingManager` |
| `minChallengeBond` | Dispute opening bond by fault | `DisputeLadder` |
| `appealBondRequired` | Appeal bond per round | `DisputeLadder` |
| `jurySizes` | Jury sizes for L1–L3 | `DisputeLadder` |
| `humanExpertWeightMultiplier` | Human expert selection weighting | `DisputeLadder` |
| `AuditorRegistry.minStake` | Auditor eligibility stake | `AuditorRegistry` |
| `AuditorRegistry.minHumanExpertStake` | Human expert min stake | `AuditorRegistry` |

## Notes on current implementation

- `VerifierMarketplace` currently returns evaluation bonds even for inaccurate evaluations; slashing is not yet wired into disputes. This makes dispute bonds and reward incentives the primary on-chain deterrents for dishonest behavior. See `docs/KNOWN_GAPS.md` for mismatches and follow-ups.
