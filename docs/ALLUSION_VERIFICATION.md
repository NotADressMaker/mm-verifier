# Allusion verification

## Scope and boundaries

An allusion is a potentially meaningful reference to a shared source, such as Caesar crossing the Rubicon or Pandora’s box. MAMV classifies historical, literary, religious, mythological, philosophical, political, cultural, idiomatic, conceptual, quotation, named-reference, and unknown candidates. Detection is probabilistic: it proposes a source-to-target mapping, not a fact.

Detection is separate from verification. A detector may identify `Pandora’s box` as a mythological allusion and propose cascading unintended consequences. Verification only reports support when reviewed evidence IDs support the source, conventional meaning, or contextual implication. With no supporting material it returns `not_enough_information`; provider output, confidence, agreement, and fluent explanations are never evidence.

## Interpretation and context

The pragmatics layer keeps quotation, paraphrase, analogy, metaphor, idiom, named references, coincidence, generic phrases, and literal usage distinct. Literal context wins: a museum display of a wooden Trojan horse is not classified as the idiomatic concealed-purpose usage. Philosophical attribution is deliberately ambiguous without enough context.

Candidates include an explicitness label, primary type, optional alternative types, text span, source, target concept, literal and allusive interpretations, alternatives, warnings, and detection confidence. Context-sensitive candidates retain that status for reviewer inspection.

## Bounded metacognition

The request option supports `direct`, `structured_reasoning`, `self_consistency`, and `self_refine` strategies. Any resulting receipt uses only concise reasoning summaries, assumptions, uncertainties, alternatives, critiques, and revisions. These are not hidden private chain-of-thought and are not claimed to faithfully reproduce latent model reasoning. Self-consistency reports agreement separately from evidentiary confidence and cannot override contrary evidence. Refinement is bounded by request limits.

## API

```json
{
  "prompt": "The company crossed the Rubicon.",
  "models": ["mock-llm"],
  "task_type": "general",
  "allusions": {
    "enabled": true,
    "strategy": "self_refine",
    "num_samples": 3,
    "max_refine_iterations": 2,
    "verify_sources": true
  }
}
```

`num_samples` is limited to 1–5, `max_refine_iterations` to 0–3, and confidence values to 0–1. Omitting `allusions` preserves existing behavior.

## Receipts and viewer

New receipts may contain optional `allusion_assessment` with `candidates`, `verifications`, and `overall_warnings`. Because it is part of the canonical receipt payload, changing it changes a newly computed receipt hash. Old receipts omit this optional field and remain schema-valid and verifiable under their historical hash format.

The receipt viewer’s **Allusions and implicit references** section is expandable. It separates detection confidence, consensus confidence, and verification status, and displays evidence IDs, alternatives, warnings, and limitations rather than a single opaque score.

## Limitations and follow-up work

The built-in deterministic baseline covers common patterns and intentionally abstains from broad metaphor classification. Production provider analyses should use a strict structured-output contract, reject malformed output with `allusion_reasoning_parse_failed`, and retrieve independently reviewable sources before treating a proposal as supported. Cultural conventions, translations, parody, and weak paraphrases remain context-sensitive and may require human review.
