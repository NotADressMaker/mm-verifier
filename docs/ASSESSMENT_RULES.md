# Assessment rules and frame semantics

This document is the public counterpart of `FRAME_SEMANTICS` in
`verifier-node/src/scoring/informationalRelativity.ts`. An assessment varies
only through rules that the engine executes; it is not validated by analogy to
physical relativity.

| Field | Role | Material | Consumer | Effect / re-verification |
| --- | --- | --- | --- | --- |
| `policy_hash` | verdict-policy rule | Yes | `resolvePolicy`, `applyVerdictPolicy` | Exact registered thresholds; threshold-only changes can be predicted. |
| `interpretation` | interpretation rule | Yes | `evaluateEvidence` | Selects a versioned ambiguity rule; changes require re-verification. |
| verifier and method | authority rule | Yes | `verifyInFrame`, validity validation | Limits who may use a method; changes require re-verification. |
| `assessment_time` | validity invariant | No | validity validation | Checks authority windows; it does not alter measurements. |
| frame ID | validity invariant | No | validity validation | Binds canonical frame semantics. |
| `evidence_scope` | evidence-selection description | No | receipt construction | Evidence identity is the `evidence_root`; changed roots require re-verification. |
| jurisdiction, domain | descriptive metadata | No | none | Records intended use and gets no material diff weight. |
| program, possibility-space hash | comparison-only metadata | No | none | Preserved for audit; not executed by this evaluator. |

The current jurisdiction semantics are deliberately **descriptive**. A future
policy-selection jurisdiction must add a deterministic registry and an executed
rule before it can be declared material. Unknown interpretation and policy IDs
fail clearly. The machine-readable declaration names every consuming function;
tests enforce that material fields name at least one.

Primary rules may change in a new frame and leave older receipts immutable.
Recognition invariants (`claim_hash`, `evidence_root`, frame binding, policy
resolution, verifier identity/authority, schema, and integrity) cannot be
reduced to a numeric distance or a verdict threshold.

## Architecture audit (2026-07)

Before this change, `diffAssessmentReceipts` assigned weights to interpretation,
evidence scope, policy hash, time, jurisdiction, program, method, and possibility
space, while `evaluateEvidence` ignored its frame argument. In particular,
jurisdiction, policy hash, and interpretation were described as material in
comparison but had no executed rule. Receipts committed a supplied evidence root
and a claim hash, but there was no replay-time recognition result, no verifier
attribution, no policy registry, and no prospective transformation.

The audit conclusions are:

1. The only threshold-altering field is now `policy_hash`; it resolves the exact
   canonical policy. Interpretation alters only its declared ambiguity operation.
2. No current field alters source admissibility. `evidence_scope` is descriptive
   and the canonical `evidence_root` is the invariant bundle binding.
3. Jurisdiction and domain affect only serialization/audit presentation; they
   receive no material diff attribution. Program and possibility-space hashes are
   comparison-only in this lightweight evaluator.
4. Claim hash, evidence root, canonical frame hash, policy resolution, schema,
   verifier identity/authority, and receipt integrity are recognition invariants.
5. New receipts identify verifier ID, version, authority ID, method, and limits.
   Identity does not alter support or confidence. A registered policy exposes its
   exact version and thresholds, allowing only compatible threshold prediction.
6. Receipts with different claim hashes are different claims; different evidence
   roots are different evidence bundles. They cannot be presented as merely
   frame-relative variants. The old weighted-but-ignored fields were bugs in
   congruence, not evidence features to preserve.
