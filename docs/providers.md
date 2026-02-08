# Provider Handling & Claim Graph

## Provider adapter interface

Providers implement the shared interface in `shared/providers/interface.ts`:

* **ProviderRequest**: prompt, model, temperature, top_p, max_tokens, seed, system_prompt, request_id, trace
* **ProviderCallResult**: normalized response plus capture fields (latency, tokens, retries, provider request id, etc.)

Each provider returns a `ProviderCallResult` and the verifier-node enriches it with retry and
circuit-breaker metadata.

## Retry & backoff

The retry utility (`shared/providers/retry.ts`) uses exponential backoff with jitter.
Only retryable classes are retried:

* timeouts
* rate limits (429)
* transient 5xx errors

## Circuit breaker

Circuit breakers are per provider+model and configured with environment variables:

* `PROVIDER_CIRCUIT_THRESHOLD` (default: 5)
* `PROVIDER_CIRCUIT_WINDOW_MS` (default: 60000)
* `PROVIDER_CIRCUIT_OPEN_MS` (default: 30000)
* `PROVIDER_CIRCUIT_HALF_OPEN` (default: 2)

When OPEN, calls short-circuit with a structured error.

## Provider capture fields

Each provider call captures:

* `provider_id`
* `model_name`, `model_version` (if available)
* `latency_ms`
* `tokens_in`, `tokens_out`
* `temperature`, `top_p`, `max_tokens`, `seed`
* `system_prompt_hash`
* `request_id`, `provider_request_id`
* `raw_response` (redacted) + `normalized_text`

These fields are persisted in debug traces and evidence model run metadata.

## Provider trust weights

Configure static weights with:

```
PROVIDER_WEIGHTS='{"openai:gpt-4.1":1.0,"anthropic:claude-3.5-sonnet":0.9}'
```

Weights are dynamically down-weighted when error rates spike or circuit breakers open.

## Claim Graph

The Claim Graph lives in `shared/claim_graph`:

* Nodes represent atomic claims and citation references.
* Edges represent citations and contradictions.

Deterministic extraction rules:

1. Split text into sentences.
2. Create claim nodes from each sentence.
3. Detect URLs as citations.
4. Apply simple subject/predicate/object parsing for “X is/has/causes Y”.

Limitations: this MVP uses heuristic parsing (no LLM dependency) and may treat whole
sentences as claims when extraction is ambiguous.

## Claim Graph scoring

The verifier-node builds claim graphs per provider response to compute:

* agreement ratio (weighted by provider trust)
* contradiction count
* citation coverage

These are surfaced in receipt explainability payloads and debug traces.
