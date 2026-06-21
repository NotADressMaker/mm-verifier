# Observability (Logs, Metrics, Tracing, Debug Trace)

## Structured logging

All runtime services emit JSON logs with consistent context fields:

* `request_id`
* `task_id`
* `job_id`
* `program_id`, `program_version`, `program_hash`
* `verifier_id` (verifier address or node id)
* `provider_id`
* `chain_id`, `tx_hash`
* `trace_id`, `span_id`

Sensitive values such as API keys, tokens, and secrets are redacted automatically.

## Metrics

Both API and verifier-node expose Prometheus metrics.

### API

* `queue_depth{queue}`
* `active_jobs`
* `cache_hits_total{cache}`
* `cache_misses_total{cache}`
* `job_latency_ms{phase}`

Endpoint: `GET /metrics`

### Verifier node

* `provider_latency_ms{provider,model}`
* `provider_errors_total{provider,model,code}`
* `job_latency_ms{phase}`
* `chain_finality_ms{phase,chain_id}`

Endpoint: `GET /metrics` (default port `9101`, configurable via `METRICS_PORT`)


## SLO-first operations

Logs explain *why* an incident happened; SLOs tell you *when* users are hurting.
Use metrics above to define service-level objectives and operate the platform from
error-budget burn rather than raw log volume.

### Suggested SLOs

Start with four SLOs that map directly to queueing, execution, reliability, and
on-chain reveal guarantees:

1. **Queueing SLO (enqueue → start):**
   * SLI: `p95(job_latency_ms{phase="enqueue_to_start"})`
   * Target: `<= 15s` over rolling 30 days
2. **End-to-end SLO (enqueue → final receipt):**
   * SLI: `p95(job_latency_ms{phase="end_to_end"})`
   * Target: `<= 120s` over rolling 30 days
3. **Failure-rate SLO:**
   * SLI: `1 - (successful_jobs / total_jobs)` from job outcome counters
   * Target: `< 1%` over rolling 30 days
4. **Reveal-on-time SLO:**
   * SLI: `on_time_reveals / total_reveals`
   * Target: `>= 99.5%` over rolling 30 days

> Tune target values per program class (e.g., low-latency APIs vs. heavy
> benchmark jobs), but keep one shared global error-budget policy.

### Burn-rate alerting

Use multi-window, multi-burn alerts so pager noise stays low while real budget
exhaustion is caught fast:

* **Fast-burn page:** 5m / 1h windows, burn rate `>= 14x`
* **Slow-burn ticket/page:** 30m / 6h windows, burn rate `>= 4x`

Apply this pattern to each SLO (latency, failures, reveal-on-time).

### Autoscaling policy (queue depth + burn rate)

Scale verifier workers from both backlog and SLO pressure:

* **Backlog signal:** `queue_depth / ready_workers`
* **Latency signal:** current p95 enqueue→start divided by SLO target
* **Burn signal:** current error-budget burn rate for queueing and end-to-end SLOs

Example control loop every 30-60s:

1. Compute `pressure = max(backlog_ratio, latency_ratio, burn_rate_ratio)`
2. If `pressure > 1.0` for N consecutive intervals, scale out by `ceil(current_workers * 0.2)`
3. If `pressure < 0.6` for M intervals and no fast-burn alerts, scale in conservatively
4. Enforce min/max worker caps and cooldown windows to avoid flapping

This keeps capacity aligned with user-facing latency objectives, not just queue
length snapshots.

### Recommended dashboards

Top-row panels for on-call:

* SLO attainment (%), remaining error budget, and burn rate per SLO
* p50/p95/p99 for enqueue→start and end-to-end latency
* queue depth and active workers
* provider latency/errors by provider+model
* chain finality latency by chain
* reveal-on-time rate and misses by reason

### Runbook trigger points

When burn rate breaches thresholds:

* **Queueing burn high:** scale workers, inspect hot queues, and check provider
  saturation
* **End-to-end burn high:** inspect provider latency/errors and chain finality
  regressions
* **Failure-rate burn high:** break down by provider/model/code, then disable
  or circuit-break unhealthy providers
* **Reveal-on-time burn high:** prioritize reveal jobs, widen reveal windows for
  affected cohorts, and investigate chain congestion

## Tracing

The API generates a `trace_id` and `span_id` for each request and propagates them
through the queue payload into the verifier node. The verifier node reuses the
trace context when processing jobs, so logs and debug traces correlate across the
entire pipeline.

Trace context propagation uses:

* `x-trace-id`
* `x-span-id`
* `x-request-id`

## Debug Trace (Debug Bundle View)

Each job stores a `DebugTrace` record with stage-level timing and outputs:

* ingest/validate
* provider calls
* normalization
* checkers
* program scoring
* receipt
* chain submit

The trace is accessible via:

```
GET /api/jobs/:id/trace
```

The dashboard offers a Debug Trace view at:

```
/jobs/:id/debug
```

## Local Prometheus/Grafana (optional)

Minimal Prometheus scrape configuration:

```yaml
scrape_configs:
  - job_name: "mamv-api"
    static_configs:
      - targets: ["localhost:3000"]
    metrics_path: /metrics
  - job_name: "mamv-verifier"
    static_configs:
      - targets: ["localhost:9101"]
    metrics_path: /metrics
```
