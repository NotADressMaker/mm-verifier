# Calibration & Multi-LLM Agreement

This module evaluates whether score outputs are calibrated and tracks multi-model agreement patterns.

## What Calibration Means Here

- **Predicted score**: `score_bps / 10000`
- **Observed correctness**: from benchmark ground truth
- **Calibration**: predicted score ≈ observed accuracy within bins

Metrics produced:

- **ECE** (Expected Calibration Error)
- **Brier Score**
- **Reliability Diagram** (CSV bins)

## Benchmark Runner

Run the benchmark harness:

```
mmv benchmark run --program factual-consensus@1.0.0 --bundles benchmarks/bundles/ --out out/
```

Outputs:

- `out/calibration_report.json`
- `out/reliability_diagram.csv`
- `out/confusion_breakdown.json`

## Agreement & Failure Modes

The harness computes:

- Pairwise agreement rate across model outputs
- Majority margin and output entropy
- Clusters of similar outputs (deterministic fingerprints)
- Correlated errors (model pairs that fail together)

## Dataset Notes

The sample dataset in `benchmarks/` includes 10 tasks for smoke testing. Expand it with additional tasks and labeled ground truth for robust calibration.
