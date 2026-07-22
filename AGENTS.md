# MAMV contributor constraints

MAMV issues portable, evidence-bounded assessments. It does not certify
context-free truth, create an oracle, or turn model confidence into knowledge.
Treat the following as architectural constraints for every contribution.

## Preserve evidence-bounded verdicts

- Read `docs/VERDICTS.md`, `docs/VERIFICATION_CONTEXT.md`, and the relevant
  receipt schemas before changing any verdict, score, receipt, or presentation.
- Preserve the six documented verdicts and their policy semantics. A verdict is
  an assessment under declared evidence, policy, verifier, method, version, and
  time—not an intrinsic property of an answer.
- Keep verdicts, evidence coverage, supported-claim ratio,
  contradicted-claim ratio, independent support, and confidence distinct.
  Confidence must disclose its method and limitations.
- Never substitute model agreement, quorum, provider count, signatures,
  hashes, or onchain anchors for evidence or independent support.
- Do not use probability-like verdict labels. Integrity and anchoring attest to
  a payload or digest; they do not establish evidentiary correctness.

## Preserve inspectability and disagreement

- Keep claim-, source-, and verifier-level results inspectable. Do not average
  away minority positions, outliers, contradictions, abstentions, or unresolved
  claims.
- A merged view may improve readability only when the underlying disaggregated
  records remain available.
- Keep verifier authority explicit and enforceable: a method may establish only
  what its declared capability permits. Confidence, consensus, and coherence
  never expand that authority.
- Coherence, allusion, genericity, and model behavior are diagnostic or
  interpretive signals, not truth, hidden-cognition, consciousness, or
  convergence proofs. Follow their corresponding documents when changing them.

## Protect bounded verification and privacy

- Do not build durable user, organization, provider, or model dossiers. Persist
  only what is necessary for a receipt, evidence chain, or authorized tenancy;
  honor `docs/privacy.md`, `docs/privacy-mode.md`, and
  `docs/MULTI_TENANCY.md`.
- Never expose credentials, secrets, unrestricted prompts, private receipt data,
  or hidden chain-of-thought. Use concise inspectable summaries instead.
- Preserve immutable historical assessments. Claim, policy, evidence, verifier,
  and source changes should create traceable new assessments and mark stale
  inputs rather than overwrite history.

## Keep changes accountable

- Reuse the existing claim, evidence, verifier, verdict, receipt, hashing,
  signing, API, CLI, and UI architecture; do not create a competing stack.
- Synchronize code and the relevant epistemic documentation whenever changing
  verdict policy, verification context, receipt schema, authority, coherence,
  allusion, genericity, or privacy behavior.
- Follow `CONTRIBUTING.md`: work on a focused branch from `main`, use a
  conventional commit, run the documented checks, and keep one purpose per PR.
  PRs must document assumptions, limitations, tests, compatibility, and confirm
  that no secrets or private receipt data are included.
- When an ambiguity would materially alter policy semantics, verifier authority,
  receipt compatibility, or privacy, ask for human clarification. Otherwise
  choose the narrower, more inspectable interpretation and document it.
