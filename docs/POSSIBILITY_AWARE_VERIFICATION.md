# Possibility-aware verification

MAMV checks an AI answer against multiple plausible interpretations, determines which evidence distinguishes them, and records why a particular evidential assessment was produced.

## Assessment model

A **possibility space** is a finite, program-declared set of scenarios that may materially affect an assessment. A scenario records its assumptions, distinguishing evidence, predicted observations, and assessment status. It is an epistemic tool for comparing interpretations and causal explanations; it is not a claim about physical parallel universes.

No information without alternatives.  
No meaning without relations.  
No stable claim without a maintained distinction.  
No intelligible assessment without a declared possibility structure.

MAMV does not claim to create reality or determine metaphysical truth. It compares plausible interpretations and explanations, tests them against evidence, and records the conditions under which an evidential verdict was produced.

## Runtime flow

1. The active verification program declares its claim types, evidence relationships, boundaries, and generation policy.
2. The verifier constructs and validates a bounded possibility space. Equivalent scenarios can be merged; a scenario without an assumption and distinguishing condition is rejected.
3. Claims retain their source span, scope, assumptions, materiality, version, and scenario membership. Evidence relationships are attached to a claim within a scenario.
4. Deterministic assessment counts independent supporting sources, keeps contradictory and qualifying evidence visible, and does not treat model agreement as independent evidence.
5. The distinction check either selects a conclusion, asks for distinguishing evidence or clarification, assesses several compatible scenarios, or returns `Unable to verify`.
6. A claim is stabilized only after scope and assumptions are explicit and it has survived cross-scenario comparison. The resulting context-v2 receipt commits the possibility-space snapshot, assessments, distinction result, stabilized claims, boundaries, and selected/unresolved scenarios.

## Rivalry and stability history

A receipt may include a per-claim `claim_rivalry_history`. It records the number of assessments, **re-verification depth** (later assessments after the first), distinct rival scenarios actually considered, and whether each genuine rivalry challenge was survived, contradicted, or left unresolved. A run that considered no rival scenario is retained as an assessment, but it does **not** count as a genuine rivalry challenge.

The history is deliberately descriptive: it is not a confidence score, calibration result, or probability that a claim is true. In particular, repeated runs using the same program or an unchallenged claim must not be presented as independent confirmation. Consumers should display the history alongside its program fingerprints, scenario IDs, evidence-relation IDs, and limitations so that it remains auditable.

## Limits and safety

The default policy permits at most four scenarios and two rounds. `minimum_material_difference` defaults to `0.2`; programs may configure all three values. The program metering limits (`max_execution_ms`, `max_llm_calls`, `max_total_tokens`, and retrieval limits) remain a hard ceiling independent of rounds. This prevents a difficult input from spending unbounded resources.

Completed receipts are immutable. Re-verification must create a new receipt, preserving the prior context for comparison. Public views should disclose safe summaries and never hidden model reasoning.
## Canonical possibility-space fields

`worlds`, `allowed_claim_types`, `allowed_evidence_relation_types`,
`allowed_verdicts`, and `boundary_conditions` are the canonical representation
for new programs and context-v2 receipt snapshots. The older
`interpretation_alternatives`, `claim_types`, `evidence_relation_types`,
`assessment_outcomes`, and `boundary_outcomes` fields remain portable
compatibility projections. A payload that provides both representations must
make them agree; the runtime rejects disagreements rather than silently
choosing one value.

The normalizer accepts an existing legacy-only declaration and derives the
canonical representation, then regenerates legacy projections for consumers
that still read them. This preserves historical receipts and program files
without permitting independently-settable duplicate policy.

## Metering boundary

Scenario generation has a hard global elapsed-time ceiling of five minutes
(`GLOBAL_POSSIBILITY_METERING_CEILING_MS`). A program may use stricter
generation limits, but cannot bypass that ceiling with its own `max_rounds` or
`max_worlds` settings.

## Registration audit

Program registration rejects a single-scenario declaration and scenarios with identical distinguishing conditions and predicted observations. Receipts retain selected, rejected, and unresolved scenario IDs and each rejected scenario's recorded reason, so an auditor can distinguish a genuine bounded comparison from a gerrymandered presentation. This lint detects only these structural defects; it does not certify that a remaining scenario set is complete or fair.
