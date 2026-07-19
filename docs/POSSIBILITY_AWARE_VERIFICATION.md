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

## Limits and safety

The default policy permits at most four scenarios and two rounds. `minimum_material_difference` defaults to `0.2`; programs may configure all three values. The program metering limits (`max_execution_ms`, `max_llm_calls`, `max_total_tokens`, and retrieval limits) remain a hard ceiling independent of rounds. This prevents a difficult input from spending unbounded resources.

Completed receipts are immutable. Re-verification must create a new receipt, preserving the prior context for comparison. Public views should disclose safe summaries and never hidden model reasoning.
