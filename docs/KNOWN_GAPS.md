# Known Gaps & Mismatches

This file documents discrepancies between documentation/design intent and the current on-chain implementation.

## Economic / dispute mechanics

1. **Reward split mismatch** ✅ **Resolved in docs**
   - `docs/ARCHITECTURE.md` now reflects `DisputeLadder` payout semantics: **20% to jurors** and **80% to the round winner** (challenger or verifier).

2. **Dispute ladder sizing mismatch** ✅ **Resolved in docs**
   - `docs/ARCHITECTURE.md` now reflects current contract defaults:
     - Fixed jury sizes: **L1=5, L2=15, L3=51**
     - Fixed appeal bonds: **0.05 / 0.10 / 0.20 WETH**

3. **Stake slashing integration** ✅ **Partially resolved in contracts**
   - `VerifierMarketplace` now supports optional integration with `StakingManager`:
     - Optional verifier-stake gating at commit (`stakingEnforced`)
     - Stake locking per evaluation (`stakeLockAmount`)
     - Dispute-time slashing for evaluators whose revealed score deviates from final resolved score by more than `disputeSlashThresholdBps`
   - Remaining scope:
     - Calibrate production defaults for `stakeLockAmount` and `disputeSlashThresholdBps`
     - Decide whether non-reveal behavior should also slash stake (currently handled only via evaluation bond slashing)
