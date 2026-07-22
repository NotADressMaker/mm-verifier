# Genericity verification

MAMV’s genericity layer adds a cautious linguistic-scope signal to verification receipts. It is informed by _“Generics are puzzling. Can language models find the missing piece?”_ (the attached paper; see its author list for the cited authors). It does not determine whether a statement is true.

## What it examines

A **generic statement** is a characteristic claim such as “Ravens are black.” English **bare-plural characteristic sentences** often omit a determiner, leaving the intended scope implicit. Some are **weak generics**: “Mosquitoes carry malaria” can be acceptable without meaning every mosquito carries it. The layer creates generic, all, most, and some variants.

**p-acceptability** is the paper’s term for choosing the quantifier variant with the lowest surprisal over the property/predicate tokens. MAMV exposes a provider-neutral scorer interface; its deterministic test scorer is not a language model or factual evidence. A local Hugging Face causal model or an external provider may implement that interface without becoming a required dependency.

## Context, evidence, and risk

The layer compares scoring with and without available context and reports material changes. The paper reports greater context sensitivity for generics than explicit determiners; that is a design motivation, not a certainty for any receipt. It compares wording strength with evidence relations to flag possible generic overgeneralization. Suggested rewrites are only emitted when the evidence representation supports a narrower formulation.

For explicit textual social-group references, broad negative or striking predicates plus weak evidence can produce a stereotype-risk warning. This is a warning, not a moral verdict; MAMV does not infer protected characteristics from names, images, or ambiguous cues. “People who are X” phrasing may reduce an effect described in the paper, but is not guaranteed mitigation.

## Receipt use and limitations

`genericity_assessment` is optional and appears only for likely generics, explicitly broad quantifiers, or meaningful warnings. It is included in canonical receipt hashing when present, so a receipt that contains it has a distinct commitment from one that does not. Scores are model-conditioned signals, English surface heuristics can miss syntax and quotation scope, and evidence relation labels may not express population coverage. Treat the output as verification context—not a truth judgment or a bias score.

```json
{
  "genericity_assessment": {
    "isGeneric": true,
    "inferredQuantifier": "some",
    "warnings": ["Possible weak generalization"],
    "limitations": [
      "Scores are model-conditioned linguistic compatibility signals, not ground truth."
    ]
  }
}
```
