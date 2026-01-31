#!/usr/bin/env python3
import argparse
import asyncio
import json
import random
import statistics
import time
from dataclasses import asdict, dataclass
from typing import Dict, List, Optional


@dataclass
class BenchConfig:
    tasks: int
    concurrency: int
    bundle_ms: int
    hash_ms: int
    commit_ms: int
    reveal_ms: int
    dispute_ms: int
    jitter: float
    include_dispute: bool
    seed: int
    output: Optional[str]


@dataclass
class TaskResult:
    task_id: int
    queue_wait_ms: float
    phase_ms: Dict[str, float]
    total_ms: float


def parse_args() -> BenchConfig:
    parser = argparse.ArgumentParser(description="MMV benchmark harness (mocked).")
    parser.add_argument("--tasks", type=int, default=10)
    parser.add_argument("--concurrency", type=int, default=5)
    parser.add_argument("--bundle-ms", type=int, default=120)
    parser.add_argument("--hash-ms", type=int, default=40)
    parser.add_argument("--commit-ms", type=int, default=200)
    parser.add_argument("--reveal-ms", type=int, default=150)
    parser.add_argument("--dispute-ms", type=int, default=400)
    parser.add_argument("--jitter", type=float, default=0.15)
    parser.add_argument("--include-dispute", action="store_true")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output", type=str, default=None)

    args = parser.parse_args()
    return BenchConfig(
        tasks=args.tasks,
        concurrency=args.concurrency,
        bundle_ms=args.bundle_ms,
        hash_ms=args.hash_ms,
        commit_ms=args.commit_ms,
        reveal_ms=args.reveal_ms,
        dispute_ms=args.dispute_ms,
        jitter=args.jitter,
        include_dispute=args.include_dispute,
        seed=args.seed,
        output=args.output,
    )


def jittered(base_ms: int, jitter: float, rng: random.Random) -> float:
    delta = base_ms * jitter
    return max(0.0, rng.uniform(base_ms - delta, base_ms + delta))


async def simulate_task(task_id: int, cfg: BenchConfig, semaphore: asyncio.Semaphore) -> TaskResult:
    rng = random.Random(cfg.seed + task_id)
    queued_at = time.perf_counter()
    async with semaphore:
        start = time.perf_counter()
        queue_wait_ms = (start - queued_at) * 1000

        phase_ms: Dict[str, float] = {}

        bundle = jittered(cfg.bundle_ms, cfg.jitter, rng)
        await asyncio.sleep(bundle / 1000)
        phase_ms["bundle"] = bundle

        hash_sign = jittered(cfg.hash_ms, cfg.jitter, rng)
        await asyncio.sleep(hash_sign / 1000)
        phase_ms["hash_sign"] = hash_sign

        commit = jittered(cfg.commit_ms, cfg.jitter, rng)
        await asyncio.sleep(commit / 1000)
        phase_ms["commit"] = commit

        reveal = jittered(cfg.reveal_ms, cfg.jitter, rng)
        await asyncio.sleep(reveal / 1000)
        phase_ms["reveal"] = reveal

        if cfg.include_dispute:
            dispute = jittered(cfg.dispute_ms, cfg.jitter, rng)
            await asyncio.sleep(dispute / 1000)
            phase_ms["dispute"] = dispute

        total_ms = (time.perf_counter() - start) * 1000

    return TaskResult(
        task_id=task_id,
        queue_wait_ms=queue_wait_ms,
        phase_ms=phase_ms,
        total_ms=total_ms,
    )


def summarize(results: List[TaskResult]) -> Dict[str, float]:
    totals = [r.total_ms for r in results]
    waits = [r.queue_wait_ms for r in results]

    def percentile(values: List[float], pct: float) -> float:
        if not values:
            return 0.0
        values_sorted = sorted(values)
        k = int(round((pct / 100) * (len(values_sorted) - 1)))
        return values_sorted[k]

    phase_keys = set()
    for r in results:
        phase_keys.update(r.phase_ms.keys())

    phase_avgs = {
        f"avg_{key}_ms": statistics.mean([r.phase_ms.get(key, 0.0) for r in results])
        for key in phase_keys
    }

    return {
        "tasks": len(results),
        "avg_total_ms": statistics.mean(totals) if totals else 0.0,
        "p50_total_ms": percentile(totals, 50),
        "p95_total_ms": percentile(totals, 95),
        "avg_queue_wait_ms": statistics.mean(waits) if waits else 0.0,
        **phase_avgs,
    }


async def run(cfg: BenchConfig) -> Dict[str, object]:
    semaphore = asyncio.Semaphore(cfg.concurrency)
    start = time.perf_counter()
    tasks = [simulate_task(i, cfg, semaphore) for i in range(cfg.tasks)]
    results = await asyncio.gather(*tasks)
    total_seconds = time.perf_counter() - start

    summary = summarize(results)
    throughput = (cfg.tasks / total_seconds) * 60 if total_seconds > 0 else 0

    return {
        "config": asdict(cfg),
        "summary": {
            **summary,
            "throughput_tasks_per_min": throughput,
            "wall_clock_s": total_seconds,
        },
        "results": [asdict(r) for r in results],
    }


def main() -> None:
    cfg = parse_args()
    report = asyncio.run(run(cfg))

    summary = report["summary"]
    print("\nMMV Benchmark Summary")
    print("-" * 24)
    print(f"Tasks:                  {summary['tasks']}")
    print(f"Concurrency:            {cfg.concurrency}")
    print(f"Avg total latency (ms): {summary['avg_total_ms']:.2f}")
    print(f"P50 total latency (ms): {summary['p50_total_ms']:.2f}")
    print(f"P95 total latency (ms): {summary['p95_total_ms']:.2f}")
    print(f"Avg queue wait (ms):    {summary['avg_queue_wait_ms']:.2f}")
    print(f"Throughput (tasks/min): {summary['throughput_tasks_per_min']:.2f}")
    print(f"Wall clock (s):         {summary['wall_clock_s']:.2f}")

    if cfg.output:
        with open(cfg.output, "w", encoding="utf-8") as handle:
            json.dump(report, handle, indent=2)
        print(f"\nSaved report to {cfg.output}")


if __name__ == "__main__":
    main()
