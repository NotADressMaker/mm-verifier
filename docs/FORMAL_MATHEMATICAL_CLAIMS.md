# Formal mathematical claims

MAMV classifies a statement as `formal_mathematical` only when it is, in principle, settled by a formal proof, formal refutation, counterexample, or an independence result relative to a named formal system. This covers theorem and formal-logic propositions. It does **not** cover benchmarks, runtime measurements, solver performance, surveys, expert-belief statistics, or empirical science; those remain ordinary factual, numeric, causal, or predictive claims.

> "This claim type records whether an accepted, checked formal proof exists — not whether
> a conjecture is fashionable, plausible, or believed by most experts. An 'Unable to
> verify' verdict on an open problem is not a weaker form of doubt than any other
> verdict; it is the correct and complete answer for a question that does not yet have one."

## Proposition versus assessment

Submitted content records the proposition, optional formalization, formal system, modality, and explicit assumptions. A claimant may state a claimed proof status, but that value is preserved only as an untrusted assertion and never determines the assessment or verdict. The verifier separately records proof status, barriers, references, completed proof checks, assessment time, and whether human review is required.

Peer review or repeated publication is not itself formal proof checking. A `Supported` formal result requires accepted references and distinct completed checking routes under the configured authority requirements; repeated accounts of the same proof do not create independent support. A claimed but unchecked proof or counterexample is at most **Mixed evidence** and requires human review. Literature or registry lookup can identify a recognized open problem, but cannot claim to have kernel-checked a proof.

`independent` is always relative to a named formal system, with its consistency assumptions and supporting references or checks. MAMV downgrades an unscoped independence assertion to `status_unknown` rather than describing a proposition as independent of “standard axioms.”

## Barriers, consensus, and verifier jurisdiction

Known barriers record a citation, the family of proof techniques constrained, and an explicit limitation. They are substantive context, not evidence for either truth value. A barrier such as relativization, natural proofs, or algebrization constrains a specified approach; it neither proves `P ≠ NP` nor `P = NP`, and does not establish that every related strategy fails.

Expert belief is a separate factual claim with its own evidence and verdict. It cannot affect formal proof status. The formal verifier is deliberately limited to formal-mathematical claims and to proof-status lookup, formal-literature review, artifact-integrity checking, and (only when actually integrated) formal proof checking. Lexical, entailment, coherence, consensus, and generic factual verifiers cannot issue a mathematical truth verdict.

No Lean, Coq, Isabelle, Agda, or equivalent kernel integration is implemented by this path today. It therefore preserves external check records and routes unearned resolution claims to human review; it does not represent literature lookup as proof-assistant validation.

## Conditional reasoning and optimization

> "An unresolved mathematical claim may be used as an explicit conditional assumption.
> Supporting a conclusion under that assumption does not verify the assumption or establish
> the conclusion unconditionally."

A conditional formal claim carries assumptions with their assessed statuses. A checked derivation of `P ≠ NP → X` can be **Supported** even while the separate proposition `P ≠ NP` remains **Unable to verify**. Its receipt displays: “This conclusion is supported conditional on the listed unresolved assumption. The assumption itself has not been verified.” It cannot be promoted to an unconditional conclusion unless every required assumption is independently established.

Optimization guidance must state its scope. General worst-case complexity is distinct from a particular instance, restricted input class, parameterized algorithm, pseudo-polynomial algorithm, approximation, heuristic, and observed solver performance. An NP-hard general problem does not show that a particular instance is hard. A precise conditional statement is: “A polynomial-time exact algorithm for all instances of this NP-hard problem would imply P = NP. Therefore, under the explicit working assumption P ≠ NP, no such general algorithm exists.”

## Worked P versus NP receipt

```text
Formal mathematical claim: P ≠ NP is true
Modality: asserted
Assessed proof status: open
Verdict: Unable to verify
Abstention: No accepted formal proof or refutation exists; this is an open problem.
Accepted proof/refutation references: none recorded
Proof checks: none recorded
Human review: false
Known barriers:
  - Relativization — applies to relativizing proof techniques; does not establish
    the truth or falsity of P ≠ NP.
  - Natural proofs — applies to a specified class of natural lower-bound arguments;
    does not establish the truth or falsity of P ≠ NP.
Linked factual claim: “A surveyed majority of complexity theorists believe P ≠ NP.”
  This is a separate factual claim requiring a survey or documented poll.

Conditional optimization claim: P ≠ NP → no polynomial-time exact algorithm for
all instances of the named NP-hard problem.
Assumption: P ≠ NP (status: open)
Receipt notice: supported conditional on the listed unresolved assumption; the
assumption itself has not been verified.
```

The barriers in this example do not support `P ≠ NP`, and the linked expert-belief claim does not change the formal claim’s verdict.
