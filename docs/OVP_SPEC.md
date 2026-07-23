# OVP: Open Verification Protocol (0.1.0)

OVP is an implementation-independent interchange protocol for recording a
bounded verification run. It does not establish context-free truth.

## Records

- **Claim:** atomic input text, stable identifier, source span, context,
  classification, dependencies, and metadata.
- **Evidence:** a content-addressed item with a source locator and an explicit
  relationship to a claim. Hashes attest to content identity, not correctness.
- **Finding:** one checker’s inspectable assessment of one claim, including its
  method, evidence, assumptions, limitations, and reproducibility metadata.
- **VerificationRun:** immutable input, claims, findings, disagreements, and
  provenance for one execution.
- **CheckerManifest:** name, version, entrypoint, supported claim types, and
  declared permissions. Declared authority limits what the checker may claim.

The normative JSON Schemas are `schemas/ovp-claim.schema.json`,
`schemas/ovp-finding.schema.json`, and `schemas/ovp-run.schema.json`.

## Methods and confidence

`formal_proof`, `deterministic_check`, `structured_data`, `primary_source`,
`secondary_source`, `semantic_source_comparison`, `model_review`, and
`human_required` identify the completed method. A model review is never a
formal proof. Any confidence value is optional, method-scoped, and must not
collapse evidence priority, source independence, checker count, or disagreement
into a generic confidence score.

## Disagreement and provenance

Runs retain individual findings. `disagreements` identifies incompatible
checker observations without suppressing either. Provenance records OVP and
verifier versions, UTC execution time, content hashes, checker versions,
profile, external retrieval metadata, network/LLM use, and checker failures.
Source locators are durable URLs, repository paths plus revisions, or other
scheme-qualified identifiers. Implementations MAY add `x-` extension fields.
