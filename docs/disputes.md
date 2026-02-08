# Dispute Workflow

This document describes the on-chain dispute lifecycle, windows, evidence requirements, and payouts. The dispute system is implemented in `DisputeLadder.sol`.

## Lifecycle & Timelines

**States** (simplified):
1. **OPEN** → dispute opened with challenger bond.
2. **ROUND_ACTIVE** → jury selection and evidence collection.
3. **ROUND_RESOLVED** → votes tallied; appeal window opens.
4. **FINALIZED** → payouts/slashing finalized.

**Key windows** (configurable on-chain):
- **Challenge window**: time since bundle submission during which disputes can be opened.
- **Response window**: verifier must respond with evidence hash/URI or challenger can resolve by default.
- **Evidence window**: jurors receive evidence metadata.
- **Voting window**: jurors cast votes.
- **Appeal window**: losing party may appeal by posting a higher bond.

## Who Can Challenge

- Any address **except the verifier** may open a dispute by posting the challenge bond.
- Challengers are economically accountable (bond is lost if they lose the dispute).

## Required Fields & Evidence

A dispute references:
- **Bundle hash** and **bundle URI hash** (from `BundleRegistry`).
- Optional **receipt hash** and **program hash** when using the metadata-required dispute open functions (`openDisputeWithMetadata`). 
- Evidence submissions must include the same bundle hash + URI hash as the original commitment.

## Slashing & Payouts

- **Challenger wins:** verifier’s defense bond is slashed; challenger receives the remaining pool (after juror + treasury cuts).
- **Verifier wins:** challenger’s bond is slashed; verifier receives the remaining pool.
- **Jurors** receive a reward pool (configurable % of total bonds).
- **Treasury** receives a configurable fee cut.

## Appeal Process

- Only the **losing party** can appeal.
- Each appeal requires a **higher bond** (L1 → L2 → L3).
- Appeals escalate jury size and extend evidence/vote windows.
- L3 is final; disputes finalize after the appeal window closes.

## Auditor Selection

- **Primary:** Chainlink VRF for unbiased juror selection.
- **Fallback:** Deterministic selection (testing/emergency) when VRF is disabled.

## Auditor CLI Quickstart

The auditor CLI is shipped with `verifier-node` as the `mmv` binary.

### List disputes
```
mmv auditor list-disputes --status OPEN
```

### Inspect a dispute
```
mmv auditor inspect 12 --out report.json
```

### Run a program locally
```
mmv auditor run 12 --program factual-consensus@1.0.0 --bundle ./evidence.json
```

### Submit an audit vote
```
mmv auditor submit 12 --verdict ACCEPT --score-bps 9000 --evidence-hash 0x... --bundle ./evidence.json
```

**Notes**
- Set `DISPUTE_LADDER_ADDRESS` and `AUDITOR_PRIVATE_KEY` in your environment.
- Use `--dry-run` to avoid on-chain submission.
- For remote bundle URIs, set `MMV_AUDITOR_ALLOW_NETWORK=true`.
