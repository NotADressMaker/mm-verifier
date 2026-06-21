# Benchmarks

This harness measures **end-to-end latency** and **throughput** for the MAMV pipeline using a mocked (sleep-based) execution model. It is meant to be lightweight and deterministic, so contributors can reproduce results locally without deploying contracts.

## What it measures

Each simulated task runs through these phases:
- `bundle`: build evidence bundle
- `hash_sign`: hash + signing operations
- `commit`: commit transaction submission
- `reveal`: reveal transaction submission
- `dispute` (optional): dispute escalation path

The harness also captures **queue wait time** (backpressure) when concurrency is limited.

## How to run

```bash
python benchmarks/run_benchmarks.py --tasks 50 --concurrency 10 --include-dispute --output benchmarks/sample_report.json
```

## Calibration datasets

The `tasks.jsonl`, `ground_truth.jsonl`, and `bundles/` directory provide a lightweight calibration dataset for score calibration and multi-LLM agreement reporting.

Run the calibration harness:

```bash
mamv benchmark run --program factual-consensus@1.0.0 --bundles benchmarks/bundles/ --out out/
```

### Common flags
- `--tasks`: number of tasks to simulate
- `--concurrency`: max concurrent tasks
- `--bundle-ms`, `--hash-ms`, `--commit-ms`, `--reveal-ms`: phase baselines in milliseconds
- `--dispute-ms`: only used when `--include-dispute` is set
- `--jitter`: percent jitter applied to phase durations (default 0.15)
- `--seed`: deterministic seed for repeatable runs
- `--output`: write full JSON report to disk

## Chain integration

This harness **does not** use a live chain. It uses mocked timing so contributors can assess baseline performance and queue behavior. For real-chain benchmarks, extend the script to connect to a local devnet (Anvil/Hardhat) and replace the sleep calls with actual transactions.
