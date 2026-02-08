# Verifier Lifecycle & Dispute Flow (Minimal On-Chain)

This document describes the minimal accountability flow implemented by:

- `contracts/contracts/VerifierRegistry.sol`
- `contracts/contracts/ReceiptDisputeManager.sol`

## Verifier Lifecycle

1. **Register**
   - Call `registerVerifier(metadataURI, operator)` with `msg.value >= minStake`.
   - The verifier becomes **ACTIVE** and can submit receipts immediately.
2. **Stake Management**
   - `depositStake()` adds more ETH.
   - `requestExit()` transitions to **EXITING** and starts the cooldown timer.
   - `withdrawStake(amount)` succeeds only after `withdrawDelay`.
3. **Activity + Rate Limits**
   - `minReceiptInterval` enforces a minimum gap between receipt submissions.
   - `lastActiveAt` is updated whenever a receipt is submitted.
4. **Reputation**
   - `recordReceiptResult(verifier, accurate)` updates `jobsCompleted` and reputation.
   - `recordDisputeResult(verifier, verifierWon)` updates `disputesWon/Lost` and reputation.

## Receipt + Dispute Flow

1. **Submit receipt**
   - `submitReceipt(receiptHash, bundleHash, bundleURI)` (only ACTIVE verifiers).
   - Opens a `disputeWindow` for challengers.
2. **Challenge**
   - `challengeReceipt(receiptId)` with `challengeBond` to open a dispute.
3. **Respond**
   - `respondToDispute(receiptId)` with `responseBond` within `responseWindow`.
4. **Resolution**
   - If challenged and resolved by owner: `resolveDispute(receiptId, challengerWins)`.
   - If verifier does not respond in time: `finalizeExpiredDispute(receiptId)`.

### Payouts + Slashing

- **Challenger wins** → verifier stake slashed (`slashBpsIncorrect` or `slashBpsNoResponse`) and paid to challenger.
- **Verifier wins** → challenger bond is paid to verifier.
- Reputation updates occur on both receipt finalization and dispute outcomes.

## Sybil-Resistance Knobs

- **Minimum stake** (`minStake`) for registration.
- **Rate limiting** (`minReceiptInterval`) between receipts.
- **Reputation-weighted selection** via `selectionWeight()` (stake + reputation weight).

## Notes

- This flow is designed to be minimal and indexer-friendly.
- Dispute resolution is currently manual (owner-driven) but the state machine is complete end-to-end.
