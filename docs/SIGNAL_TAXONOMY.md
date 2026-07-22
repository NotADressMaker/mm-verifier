# Signal taxonomy and conversion boundaries

## Purpose

This taxonomy prevents a signal from acquiring a stronger meaning merely by
crossing a repository boundary. Every imported signal retains its originating
repository, frame, schema version, timestamp, limitations, and any applicable
integrity metadata. Unknown independence is not demonstrated independence.

| Category | Examples | May establish |
| --- | --- | --- |
| Presentation | fluency, rhetorical certainty, verbosity, style, response speed | Diagnostic presentation metadata only. |
| Model-state | model-stated confidence, sample agreement, coherence, revision stability | Generation-layer observations and limitations. |
| Retrieval | rank, retrieval score, context coverage, source count | What context was retrieved or reviewed, not source independence. |
| Evidence | claim support, contradiction, provenance completeness, source independence, corroboration | Evidence relations within the authorized verification method. |
| Governance | verifier authority, policy compliance, review and completion status | Whether required controls permit an assessment or workflow action. |
| Integrity | hash/signature validity, anchor status, replayability | Payload integrity or reproducibility properties. |
| Outcome | action result, downstream success, observed harm, later correction | A reason to review or re-verify, with causal uncertainty. |

## Allowed conversions

- Evidence support may influence an evidence-bounded MAMV verdict.
- A contradiction may influence review status and a source revision may make a
  later assessment necessary.
- Missing verifier authority or a required governance check may block workflow
  completion in MAMV-IR.
- Outcome evidence may trigger re-verification, policy review, verifier
  evaluation, or a linked incident record.
- Integrity validation may establish that a payload or digest is unchanged.

## Prohibited conversions

The following are forbidden even when a signal is numerically correlated with a
desired outcome:

- fluency, rhetorical certainty, polish, or verbosity → confidence, grounding,
  evidence support, or verdict;
- verbosity, reasoning-summary length, token count, or latency → verification
  depth, care, or correctness;
- coherence, conversational consistency, or revision resistance → correctness,
  reliability, or psychological ego;
- model agreement, sample count, provider count, or retrieval-source count →
  independent evidence or independent support;
- signature validity, hash validity, replayability, or onchain anchoring →
  truth, evidence quality, or evidentiary correctness;
- textual description of pain or other sensation → embodied experience or
  first-person authority;
- successful or failed outcome → automatic proof of every originating claim or
  a retroactive mutation of the original verdict.

## Required validation direction

Implementation PRs must add deterministic tests that prove prohibited inputs do
not change the protected output: presentation changes do not change grounding
or verdict; latency and prose length do not change verification depth; model
agreement without demonstrated independent evidence does not count as
independent support; and outcome records create linked review work rather than
mutating historic receipts.

## Tool and retrieval provenance

External-tool and retrieval evidence is not trustworthy by default. Each evidence item records whether it came from a search index, user upload, policy document, or tool call, whether its immediate source was model-generated, and enough chain-of-custody references to reconstruct how it entered the receipt. Its evidentiary treatment remains proportional to that provenance; a model-written search snippet is not upgraded merely because it was retrieved.
