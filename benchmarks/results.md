# Benchmark Results

## Sample run (mocked pipeline)

Command:
```bash
python benchmarks/run_benchmarks.py --tasks 10 --concurrency 5 --seed 42 --output benchmarks/sample_report.json
```

Summary:

| Metric | Value |
| --- | --- |
| Tasks | 10 |
| Concurrency | 5 |
| Avg total latency | 499.91 ms |
| P50 total latency | 496.35 ms |
| P95 total latency | 546.40 ms |
| Avg queue wait | 250.02 ms |
| Throughput | 574.62 tasks/min |
| Wall clock | 1.04 s |

### Accuracy improvement

Not measured in this harness yet. The benchmark currently focuses on timing and throughput only.

## Future runs

Add new rows as more scenarios are benchmarked (e.g., 100/1000 tasks, dispute-enabled runs, or real-chain integration).
