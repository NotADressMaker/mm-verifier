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
  - job_name: "mmv-api"
    static_configs:
      - targets: ["localhost:3000"]
    metrics_path: /metrics
  - job_name: "mmv-verifier"
    static_configs:
      - targets: ["localhost:9101"]
    metrics_path: /metrics
```
