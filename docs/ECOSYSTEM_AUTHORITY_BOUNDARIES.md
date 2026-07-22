# Ecosystem authority boundaries and Phase 1 contracts

## Repository responsibilities

| Repository | Produces or governs | Must not do |
| --- | --- | --- |
| MAMV-Model | Outputs; presentation and model-state signals; proposed embodiment sensitivity; generation-layer revision telemetry; completed model-layer operations | Issue a final MAMV verdict, claim independent evidentiary support from model agreement, or enforce MAMV policy. |
| MAMV | Evidence-bounded claim assessment; verifier-authority enforcement; independence assessments; immutable receipts; outcome links | Treat generated signals as evidence by default or silently create MAMV-IR workflow completion. |
| MAMV-IR | Required workflow stages; escalation; repair; completion and reopening decisions | Convert completion into external-world truth or overwrite MAMV receipts. |

Authority does not transfer with a payload. Each repository must preserve the
origin, limitations, and semantic category of imported data, then validate it
against its own authority and policy.

## Proposed versioned contract envelope

Phase 1 defines a compatibility target, not a new receipt field or API. Each
future contract must contain at least:

```json
{
  "schema_version": "1.0.0",
  "id": "stable-record-id",
  "originating_repository": "MAMV-Model | MAMV | MAMV-IR",
  "originating_frame_id": "frame-id",
  "created_at": "RFC-3339 timestamp",
  "limitations": ["bounded, inspectable limitation"],
  "integrity": { "algorithm": "optional", "digest": "optional" }
}
```

Unknown major versions must fail clearly. Additive compatible fields require a
minor-version policy; existing receipts continue to load under their declared
schema and hashing rules. No proposed contract changes the current public
receipt allowlist or canonical hash without a dedicated MAMV receipt-schema PR.

## Contract ownership and semantic minimums

| Contract | Owner | Required domain fields | Authority limit |
| --- | --- | --- | --- |
| `PresentationSignals` | MAMV-Model | rhetorical certainty, linguistic polish, answer length, evidentiary relevance=`none` | Diagnostic only; never a confidence or verdict input. |
| `RevisionRecord` | Originator of the revision | original/revised claim IDs, trigger, triggering evidence, changed fields, preserved position, unsupported material removed, contradiction resolution, frame transition | Records observable correction; does not impute ego or validate support. |
| `VerificationDepth` | Producer of completed operations; MAMV validates its own methods | claims/evidence/sources reviewed, independent sources, contradiction checks, completed verifier/policy methods, human-review flag, unresolved checks, optional elapsed time | Describes checks performed; time and prose length have no quality meaning. |
| `EmbodimentBoundary` | MAMV-Model may propose; MAMV validates/enforces | claim ID, sensitivity, experience relevance, first-person authority requirement, evidence types, prohibited assertions | Does not grant lived authority or replace human review. |
| `IndependenceAssessment` | MAMV | participant and shared-route metadata; evidence/model/institutional independence states; limitations | Only demonstrated independent evidence routes count toward independent support. |
| `OutcomeRecord` | MAMV links; MAMV-IR governs reopening | receipt/claim links, action, observed result, status, harm category, evaluator, evidence, causal limitations | Does not mutate historic verdicts or establish causal truth automatically. |
| `FrameTransition` | Repository creating a linked new state | prior/next frame IDs, reason, changed inputs, timestamp, limitations | Preserves history; does not overwrite prior records. |

## Dependency-aware implementation plan

1. **Phase 1 — shared concepts (this PR):** publish this boundary document,
   the signal taxonomy, epistemic foundation, and durable contributor rules.
2. **Phase 2 — MAMV-Model observability:** add portable presentation signals,
   revision telemetry, operation-based verification depth, embodiment proposals,
   and correlated-agreement metadata without verification authority.
3. **Phase 3 — MAMV safeguards:** add the fluency firewall, independence
   assessment, immutable revision links, embodiment policy, outcome links, and
   separately versioned receipt extensions.
4. **Phase 4 — MAMV-IR governance:** implement required external stages,
   independence gates, embodiment escalation, repair without rhetorical
   continuity, and linked consequence-driven reopening.
5. **Phase 5 — cross-repository fixtures:** validate contracts, legacy loading,
   major-version failures, and the deterministic three-claim example across all
   repositories.

Each phase is a separate auditable pull request. A cross-repository fixture may
verify compatibility, but it must not collapse ownership or authority.
