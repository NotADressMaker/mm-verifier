# AI Content Insurance System

This document describes the content insurance layer that pairs MAMV verification with financial
guarantees. It introduces the onchain policy contract, the offchain claim verification workflow,
and the premium pricing model.

## Core Guarantee

When publishing content, creators can opt into an insurance policy that guarantees one of two
claims:

- **Human-authored content**: if the content is proven to be AI-generated, the policy pays out.
- **AI-generated + verified**: if the content is proven wrong after verification, the policy pays
  out.

## Smart Contract: ContentInsurancePolicy

The `ContentInsurancePolicy` contract allows creators to stake premiums for coverage and
participants to file claims. It stores policy metadata, verification hashes, and payouts in a
single onchain registry.

Key behaviors:

- **Policy creation**: creators pay a premium and define coverage, duration, and policy type.
- **Verification attachment**: AI policies can attach MAMV verification hashes and scores.
- **Claim filing**: claimants post a stake and submit evidence hashes.
- **Resolution**: auditors (owner-controlled for now) approve or deny payouts.

## Claim Verification Engine

The claim verification engine provides the offchain workflow to validate claims before they are
resolved onchain. It supports:

- **AI detection consensus**: multiple detectors + pattern analysis.
- **Factual error review**: MAMV evidence re-checks and citation validation.
- **Human audit escalation**: edge cases are escalated for manual review.

Implementations are designed to plug into existing MAMV services (source fetching, LLM checks, and
auditor workflows).

## Premium Pricing

Premiums are calculated using a risk-based multiplier model:

1. **Base rate**: 10% of coverage amount.
2. **Policy risk**: human-authored claims are priced higher than AI-verified claims.
3. **Duration risk**: longer coverage increases pricing.
4. **Content risk**: domain, length, and citation density affect pricing.
5. **Creator history**: claim history adjusts the rate.
6. **Market risk**: pool utilization dynamically adjusts prices.

The pricing engine is designed to be deterministic, so it can be mirrored onchain or audited off
chain.

## Next Steps

- Add policy routes to the API service (create policy, attach verification, file claim).
- Create a policy dashboard UI for creators and claimants.
- Integrate auditor workflow with MAMV dispute tools.
- Add automated evidence collection (IPFS bundling).
