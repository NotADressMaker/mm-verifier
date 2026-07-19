# Verification Context

MAMV does not assign an intrinsic trust status to an AI answer. It records the declared verification conditions, evidence, claims, and rules under which an evidential verdict was produced.

A verdict is an assessment of reviewed evidence under a named **verification program version**, not a statement that objective truth changes. Changing programs can change claim extraction, admissible evidence, thresholds, or required source independence; it does not change objective truth, only the declared conditions under which evidence was assessed.

## Frozen receipt contents

A context-v1 receipt binds the program ID and integer version, evidence scope, policy thresholds, source-independence rules, jurisdiction/locale, domain, run timestamp, software version, claims, evidence relations, limitations, verdict explanation, and receipt hash. The full policy snapshot is retained internally. Claims are versioned and linked by parent claim IDs; transitions record split, merge, retype, narrowing, widening, evidence changes, and verdict changes so provenance is reconstructable.

Programs are immutable integer versions: editing creates version `n + 1`; prior versions remain readable and receipts reference the exact record. Re-verification creates a new receipt linked to its predecessor and records whether program, evidence, or other context changed.

## Public and internal context fields

The public receipt endpoint exposes exactly: `verification_program_id`, `verification_program_version`, `evidence_scope`, `policy_thresholds`, `source_independence_rules`, `jurisdiction_locale`, `domain`, `run_timestamp`, and `software_version`.

The internal audit representation additionally retains `verification_program_snapshot`, `organization_id`, and `enabled_providers_models`. The field lists are code allowlists and a test requires every internal field to be explicitly public or excluded.

## Assessment boundaries

`Unable to verify` is required for below-threshold coverage, inaccessible or malformed evidence, unassessable material claims, missing program rules for a claim type, or unestablished required source independence. Model agreement is never independent evidence. Missing evidence never implies support.

## Hash compatibility

`context_version: legacy` preserves historic hashing. `context_version: context-v1` includes the canonical verification-context fields in the receipt hash. Completed receipts and their context records are append-only; database triggers reject mutation.
