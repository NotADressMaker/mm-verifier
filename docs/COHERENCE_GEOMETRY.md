# Coherence Geometry and verification stability

Coherence Geometry is an optional, record-based diagnostic. It analyzes the observable claim-evidence graph and bounded verification history; it neither observes neural activations nor infers consciousness, intelligence, private reasoning, or mental state.

## Operational definitions

- **State / trajectory:** ordered snapshots of claim IDs, evidence IDs, active verdicts, ambiguity, contradiction, provider disagreement, and frozen-context references.
- **Coherence:** fit among recorded claims, relations, interpretations, and verdicts. It is not truth.
- **Fragmentation:** disconnected claim/evidence clusters. Independent claims can be appropriately fragmented.
- **Integration:** explicit cross-links among clusters. Its bounded cost combines claims, evidence, contradictions, unsupported links, context size, and interpretation branches; it is not a cognitive-capacity measurement.
- **Boundary and path dependence:** bounded, plausible alternatives (such as declared ambiguity or context changes) that materially change a verdict. Instability is not proof of falsehood.
- **Verification convergence:** recurring normalized verdicts over bounded paths. Convergence is a stability signal, not evidence.
- **Reorganization:** an inspectable critique, evidence, or context event that changes relations or a verdict.

## Graph and scoring

`shared/coherence.ts` reuses claim IDs and evidence IDs from receipts. Nodes represent claims and evidence now, with extensible types for interpretations, provider judgments, policy rules, and verdicts. Edges represent support, contradiction, qualification, dependency, interpretation, derivation, reference, and challenge. The optional score is a clamped descriptive summary penalizing contradiction density, ambiguity, unsupported links, and provider disagreement. It never changes MAMV verdict policy or authority.

## API configuration

```json
{"coherence":{"enabled":true,"analyze_fragmentation":true,"analyze_path_dependence":true,"analyze_boundaries":true,"max_paths":4,"integration_budget":0.75}}
```

The option is disabled by default. `max_paths` is capped at 4 and perturbations at 5. Receipts can include a compact `coherence_assessment`; because it is included in canonical receipt fields, changing it changes new receipt hashes. Older receipts omit the optional field and retain their original hashes and validation behavior.

## Limitations

The diagnostic only reflects supplied records and bounded alternatives. Model agreement never becomes evidence, stable unsupported conclusions remain unsupported, and a fragmented answer may still contain valid independent claims. Education integrations must remain non-grading and evidence-conditioned.
