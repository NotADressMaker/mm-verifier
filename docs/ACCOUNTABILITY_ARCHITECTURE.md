# Accountability architecture audit and implementation plan

## Scope and interpretation

This foundational change records the repository audit and establishes durable
contributor constraints in [`AGENTS.md`](../AGENTS.md). It deliberately does
not introduce a second verification framework or change verdict thresholds,
receipt serialization, persistence, or APIs. Those are separate focused pull
requests because they change serialized contracts and assessment semantics.

MAMV's governing relation is:

> Claim × verification context × evidence × verifier × verifier authority ×
> method × policy × artifact version × time → evidence-bounded assessment.

A verdict is therefore not intrinsic to an answer or claim. It records what the
declared policy concluded from the declared evidence and assessment conditions.
Receipt integrity, signatures, anchors, model agreement, and coherence may be
reported as distinct signals, but none establishes the verdict's evidentiary
support.

## Architecture audit (2026-07-22)

| Audit question | Finding | Evidence / implication |
| --- | --- | --- |
| Where accountability already exists | The public policy uses coverage, support ratio, contradiction ratio, independent support, and material contradiction in ordered rules. | `shared/verdicts.ts` implements those six verdicts; `docs/VERDICTS.md` documents their non-truth boundary. |
| Does anything imply intrinsic verdicts? | The principal receipt still carries legacy `score_bps`, boolean `verdict`, and `worthy` fields alongside the evidence verdict. | Preserve these fields for compatibility, but a future receipt-focused PR should label them legacy/process fields in every default presentation and keep `verification_status` primary. |
| Which signals are separate? | Evidence verdict, confidence, votes, outliers, quorum, signature, anchor, context, evidence relations, genericity, allusion, and coherence have separate receipt fields. | Existing receipt types already support progressive disclosure rather than a required composite truth score. |
| Which signals are accidentally collapsed? | Receipt construction derives a public confidence score from basis points and has a default quorum fallback; several legacy services use score/pass concepts. | Do not reinterpret score, quorum, vote count, signature, or anchor as evidence. Audit and migrate these paths incrementally with compatibility tests. |
| Is verifier authority enforced? | Verifier provenance and program context are recorded, but no shared capability/authority-decision model was identified in the core receipt type. | Add enforceable capability checks and authority outcomes by extending the current verifier/receipt path, not by adding a parallel stack. |
| Is source independence explicit? | Evidence relations include `source_independence_group`; the context service counts only evidence-kind support in distinct groups and excludes model provenance. | Preserve this representation and ensure future per-source metadata remains inspectable. |
| Is disagreement preserved? | Receipts retain votes, outliers, evidence relations, material contradictions, and boundaries; compare routes expose claim/evidence differences. | Add explicit disagreement classification without deleting these component records. |
| Is every verdict traceable? | Context-v1 binds program, evidence scope, thresholds, independence rules, claims, relations, limitations, and explanation. | Future frames/results must be tied to these existing fields and maintain old receipt readers. |
| Are historical assessments retained? | Documentation states receipts are append-only, re-verification creates a successor, and claim transitions are stored. | Extend claim/source/policy staleness through immutable successor records. |
| Can receipts replay? | Evidence replay validates transcript and output hashes; context comparison exists. | A dedicated receipt-replay PR should distinguish identical, changed-input, missing-artifact, and non-reproducible outcomes. |
| What requires compatibility? | `VerificationReceipt`, canonical hashing/context versions, JSON schema v1, Prisma receipt/claim records, SDKs, APIs, UI, and onchain integrations are serialized contracts. | Add optional fields and versioned canonicalization; legacy hashes and readers must remain valid. |
| What already exists? | Verdict policy, context-v1/v2/v3 evolution, possibility spaces, claim links, source-independence grouping, privacy modes, genericity, allusion, coherence, tenancy, receipt comparison, and evidence replay already exist. | Extend these mechanisms; do not duplicate them. |

## Existing accountability mechanisms

- **Evidence-bounded verdict policy:** ordered six-verdict classification keeps
  low coverage and material contradiction visible.
- **Frozen verification context:** context receipts bind program and policy
  conditions, evidence scope, source-independence rules, and timestamps.
- **Claim and evidence relations:** claim versions, parent/derivation links, and
  support/contradiction/qualification relations preserve the assessment trail.
- **Visible disagreement:** votes, outliers, contradictions, boundaries, and
  per-claim evidence relations can remain in receipts.
- **Integrity boundary:** canonical receipt hashing, signatures, and optional
  anchoring are structurally distinct from evidence verdicts.
- **Bounded diagnostic layers:** coherence, allusion, genericity, and
  pragmatics documents explicitly constrain what their signals may establish.
- **Privacy and tenancy:** hashed-only defaults, encrypted opt-in evidence,
  receipt scoping, and organization authorization constrain persistence.

## Focused implementation sequence

1. **Foundation (this PR):** add enduring contributor constraints and this
   audit. No runtime behavior changes.
2. **Verification frame and authority:** extend the existing receipt/context
   contracts with an immutable, canonical verification-frame record and
   enforceable verifier capability decisions. Keep optional, versioned fields.
3. **Claim, evidence, and disagreement:** add narrowly scoped claim revision
   metadata, provenance/accountability records, stale/superseded markers, and
   explicit disagreement classifications while retaining raw component results.
4. **Assessment and human review:** expose rule-level verdict explanations,
   disaggregated confidence signals, and explicit human-review outcomes without
   changing the six public verdict semantics.
5. **Receipt replay and migration:** implement deterministic replay comparison
   and integrity reporting for the expanded receipt, including legacy loading
   and missing-artifact outcomes.
6. **Interfaces and documentation:** extend existing API, CLI, and receipt UI
   only after the stable domain contract is in place; make detail available
   without presenting integrity, quorum, or confidence as truth.

Each phase requires deterministic tests for authority boundaries, evidence
independence, preserved minority disagreement, policy/context changes,
serialization compatibility, privacy mode, and the documented six-verdict
precedence. Contract checks are required only for a phase that changes receipt
anchoring or Solidity contracts.

## Non-goals for this foundation

- No new universal truth or certainty score.
- No modification to verdict thresholds or their precedence.
- No new telemetry, cross-session profiling, or plaintext retention.
- No claim that a signature, hash, anchor, consensus, or coherence establishes
  source quality or external-world truth.
- No exposure of private reasoning or unrestricted provider prompts.

## Review checklist for follow-up PRs

1. Identify the existing model, service, receipt field, and policy being
   extended.
2. State the assessment context, verifier authority, assumptions, limitations,
   and compatibility strategy.
3. Keep supporting and contradicting evidence, source independence, and
   minority verifier results inspectable.
4. Explain the exact verdict rule and thresholds involved; do not replace them
   with a composite score.
5. Confirm what persists, why it is necessary, its retention behavior, and how
   privacy mode and tenancy apply.
6. Confirm that no secrets, API keys, private receipt data, unrestricted
   prompts, or hidden chain-of-thought are included.
