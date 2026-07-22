# AI epistemic differences

## Status and scope

This is the MAMV repository's Phase 1 ecosystem foundation. It is a
repository-specific adaptation intended to be compatible with corresponding
documents in MAMV-Model and MAMV-IR. It does not change a verdict policy,
receipt schema, verifier authority, or workflow-completion rule. Those changes
require separately versioned implementation work and compatibility review.

The distinctions below are functional and architectural. They do not prove that
language-model reasoning is categorically inferior to human reasoning. Some
differences can be operational advantages: an earlier output can be abandoned
without identity protection or rhetorical continuity. Others remove mechanisms
that sometimes discipline human belief. Neither result permits assuming that
human accountability mechanisms transfer automatically to generated output.

> Language-model outputs do not inherit the mechanisms that ordinarily
> discipline human belief. Fluency does not imply grounding; revision does not
> require ego preservation; errors do not naturally produce lived
> consequences; textual knowledge does not confer embodiment; generation time
> does not reveal scrutiny; and model agreement does not guarantee independent
> support. The MAMV ecosystem therefore replaces assumed epistemic discipline
> with explicit provenance, verification, evaluation, disagreement
> preservation, authority boundaries, repair, and human review.

## Load-bearing distinctions

### Fluency is not confidence

Fluency, rhetorical certainty, style, response length, and polish are
presentation signals. They are not evidence support, grounding, calibration,
verification, independent corroboration, or competence. MAMV may retain them
as diagnostic metadata, but they must not alter evidence coverage, support or
contradiction ratios, independent-support count, or verdict. Any separately
reported confidence must state its method and limitations.

### Revision without ego

MAMV must not attribute shame, pride, regret, embarrassment, identity threat,
or motivated self-defense to a model. Observable persistence can arise from
prompt framing, continuation bias, instruction following, anchoring, or
optimization pressures; call this **revision resistance**. A well-supported
correction is successful repair, not a failure of consistency. Historical
claims and receipts remain immutable and a correction is a linked new state.

### Structural consequence loops, not lived consequences

A model ordinarily does not receive embodied practical consequences from a
false output. Evaluation, outcome measurement, external feedback, audits,
policy enforcement, repair loops, and human review are therefore explicit
structural substitutes. An observed outcome can trigger review, but it does not
rewrite a historical receipt or automatically prove the originating claim false;
causal uncertainty must remain visible.

### No embodied grounding by textual familiarity

Textual descriptions of pain, illness, sensation, lived identity, trauma, or
suffering do not confer direct sensory experience or first-person authority.
Embodiment-sensitive claims need explicit scope, attributable sources when
summarizing reports, visible limitations, and human escalation when policy
requires it. A model may summarize reported experience; it must not represent
that summary as its own experience.

### Speed is not verification depth

Latency, generated reasoning length, and token count do not establish care or
scrutiny. Verification depth is a record of completed external operations—for
example, claim extraction, evidence review, contradiction checks, provenance
checks, independent-source assessment, verifier methods, policy checks, and
human review. Elapsed time is operational telemetry only.

### Model agreement is not human independence

Model outputs can be correlated through shared model lineage, provider,
training sources, prompts, retrieval context, architecture, or evidence.
Agreement is a model-state or stability signal until independence is
demonstrated. Only independent evidence routes may satisfy MAMV's
independent-support requirements; model agreement and minority positions remain
separately inspectable.

## MAMV boundary

MAMV evaluates declared claims against reviewed evidence under a declared
program, policy, verifier method, source-independence rule, and time. Its six
verdicts remain evidence-bounded assessments, not context-free truth. Model
signals can be imported with their origin and limitations, but cannot expand a
verifier's authority or substitute for admissible evidence.

See [Signal Taxonomy](SIGNAL_TAXONOMY.md),
[Ecosystem Authority Boundaries](ECOSYSTEM_AUTHORITY_BOUNDARIES.md),
[Verdicts](VERDICTS.md), and [Verification Context](VERIFICATION_CONTEXT.md).
