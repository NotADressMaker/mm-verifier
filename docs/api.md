# MAMV Verification API (v1)

The v1 API provides a stable, developer-friendly surface for submitting verification tasks, defining verification programs, and polling task status.

## Versioning & Stability

All v1 endpoints are under `/v1/*` and return `X-MAMV-API-Version: 1`. Backward-compatible updates will keep field names stable and add new optional fields only.

## Idempotency

Send `Idempotency-Key` (header) or `idempotency_key` (body) to safely retry verification requests. If the key is reused, the API returns the originally created task response.

## Endpoints

### POST /v1/verify

Submits a verification task.

```json
{
  "prompt": "Summarize the article.",
  "models": ["gpt-4.1-mini"],
  "task_type": "general",
  "program_id": "optional-program-id",
  "idempotency_key": "optional-key"
}
```

### GET /v1/tasks/{task_id}

Fetches task status and (if finalized) the verdict and score.

### POST /v1/programs

Registers a verification program including inputs/outputs.

## OpenAPI

The OpenAPI spec is available at `openapi.yaml` in the repo root.
