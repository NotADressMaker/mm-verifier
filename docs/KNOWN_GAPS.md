# Known Gaps & Mismatches

This file documents discrepancies between documentation/design intent and the current on-chain implementation.

## Economic / dispute mechanics

1. **Reward split mismatch**
   - `docs/ARCHITECTURE.md` describes a 60% payout to challengers and 40% to auditors.
   - `DisputeLadder` currently distributes **20% to jurors** and **80% to the winner** (challenger or verifier). Update docs or adjust contract logic to align.

2. **Dispute ladder sizing mismatch**
   - `docs/ARCHITECTURE.md` references smaller juries (e.g., 3 auditors at L1) and doubling stakes per tier.
   - `DisputeLadder` uses **fixed jury sizes** (L1=5, L2=15, L3=51) and **fixed appeal bonds** (0.05/0.10/0.20 WETH). Decide whether to update docs or implement dynamic multipliers.

3. **Stake slashing integration**
   - `VerifierMarketplace` returns evaluation bonds regardless of accuracy and does not invoke slashing on incorrect evaluations.
   - `StakingManager` supports slashing but is not wired into marketplace disputes. Integrate slashing or adjust security docs to reflect the current incentive model.
