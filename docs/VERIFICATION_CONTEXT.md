# Verification Context

MAMV does not assign an intrinsic trust status to an AI answer. It records the declared verification conditions, interpretation, claims, evidence, and rules under which an evidential verdict was produced.

A verdict is an assessment of reviewed evidence under a named **verification program version**, not a statement that objective truth changes. Changing programs can change claim extraction, admissible evidence, thresholds, or required source independence; it does not change objective truth, only the declared conditions under which evidence was assessed.

## Frozen receipt contents

A context-v1 receipt binds the program ID and integer version, evidence scope, policy thresholds, source-independence rules, jurisdiction/locale, domain, run timestamp, software version, claims, evidence relations, limitations, verdict explanation, and receipt hash. The full policy snapshot is retained internally. Claims are versioned and linked by parent claim IDs; transitions record split, merge, retype, narrowing, widening, evidence changes, and verdict changes so provenance is reconstructable.

Programs are immutable integer versions: editing creates version `n + 1`; prior versions remain readable and receipts reference the exact record. Re-verification creates a new receipt linked to its predecessor and records whether program, evidence, or other context changed.

## Interpretations, claims, and evidence relationships

Before extracting claims, MAMV records the candidate reading that was selected and any material assumptions. A run either selects a reading, requests clarification, or records that more than one reading was assessed. Claims retain their source text, normalized text, version, scope, assumptions, and parent or derivation links. This makes later splits, merges, and scope changes auditable rather than overwriting the earlier claim.

Evidence is assessed through an explicit relationship to a claim: it can support, contradict, qualify, contextualize, duplicate, derive from, or remain inconclusive. Duplicate sources and model agreement do not increase independent support. Contradictory evidence remains attached to its claim, including when the final result is unable to verify.

## Declared possibility space

Each context-v1 receipt includes a `VerificationPossibilitySpace`. It is a versioned, program-scoped declaration of the interpretation alternatives, claim types, evidence-relation types, assessment outcomes, and abstention boundaries available to the run. The selected interpretation must reference one of its declared alternatives. The space is fingerprinted with the program and included in the canonical receipt hash, so a later change to permissible distinctions is a new program/receipt condition rather than an invisible change to a label.

For lightweight integrations, MAMV records a built-in evidential assessment space instead of omitting the declaration. Custom programs should provide their own space. This makes “unable to verify,” contradictions, qualifications, duplicate-source handling, and interpretation ambiguity explicit alternatives rather than implicit behavior.

## Re-verification and comparison

Re-verification always creates a new receipt. It may use the original program version, the newest version of that program, a permitted different program, or updated evidence. The new receipt stores its predecessor and a concise change summary. Receipt comparison reports differences in program, assessment conditions, interpretation, claims, evidence, limitations, and verdict, using the neutral conclusion: “Different verification conditions produced different evidential assessments.”

## Internal design notes

The implementation follows a simple progression: **possibility → distinctions → information → meaning → objects**. Interpretation candidates preserve what the input could mean; claim extraction records the distinctions selected; evidence relationships record information for a claim; program rules give that information assessment meaning; and the completed immutable receipt is the resulting object. This is why a later run is a new receipt rather than a mutation of the earlier one.

## Public and internal context fields

The public receipt endpoint exposes exactly: `verification_program_id`, `verification_program_version`, `evidence_scope`, `policy_thresholds`, `source_independence_rules`, `jurisdiction_locale`, `domain`, `run_timestamp`, and `software_version`.

The internal audit representation additionally retains `verification_program_snapshot`, `organization_id`, and `enabled_providers_models`. The field lists are code allowlists and a test requires every internal field to be explicitly public or excluded.

## Assessment boundaries

`Unable to verify` is required for below-threshold coverage, inaccessible or malformed evidence, unassessable material claims, missing program rules for a claim type, or unestablished required source independence. Model agreement is never independent evidence. Missing evidence never implies support.

## Hash compatibility

`context_version: legacy` preserves historic hashing. `context_version: context-v1` includes the canonical verification-context fields in the receipt hash. Completed receipts and their context records are append-only; database triggers reject mutation.
