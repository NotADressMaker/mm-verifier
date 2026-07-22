# Schemas & Receipts

## Ecosystem epistemic architecture

- [AI Epistemic Differences](AI_EPISTEMIC_DIFFERENCES.md) defines the
  functional differences between language-model generation and human belief
  formation that require explicit accountability structures.
- [Signal Taxonomy](SIGNAL_TAXONOMY.md) separates presentation, model-state,
  retrieval, evidence, governance, integrity, and outcome signals and defines
  forbidden conversions.
- [Ecosystem Authority Boundaries](ECOSYSTEM_AUTHORITY_BOUNDARIES.md) assigns
  MAMV-Model, MAMV, and MAMV-IR responsibilities and records the phased
  cross-repository contract plan.

This document describes the canonical ReceiptV1 and EvidenceBundleV1 schemas, the explainability payload, and schema validation behavior.

## ReceiptV1 (Schema v1)

ReceiptV1 is the canonical artifact emitted by verification programs. It is versioned and includes a machine-readable `explain` block.

### Key Fields

- `version`: `"1.0.0"`
- `receipt_version`: `"1.0.0"`
- `program`: `{ id, version, hash }`
- `evidence`: `{ bundle_hash, bundle_uri, bundle_version }`
- `explain`: structured explainability payload (see below)

### Example

```json
{
  "version": "1.0.0",
  "receipt_version": "1.0.0",
  "task_id": "task_123",
  "generated_at": 1700000000,
  "input_hash": "0x1111111111111111111111111111111111111111111111111111111111111111",
  "output_hash": "0x2222222222222222222222222222222222222222222222222222222222222222",
  "score_bps": 9000,
  "verdict": true,
  "worthy": true,
  "program": {
    "id": "factual-consensus",
    "version": "1.0.0",
    "hash": "dd5cf58f1617af56192049a9fda1ca848ae00f5fa9df000d3ad2f0b3c6431f9c"
  },
  "evidence": {
    "bundle_hash": "0x3333333333333333333333333333333333333333333333333333333333333333",
    "bundle_uri": "ipfs://bundle",
    "bundle_version": "0.2"
  },
  "provenance": {
    "llm_provider": "openai",
    "llm_model": "gpt-4"
  },
  "explain": {
    "version": "1.0.0",
    "score_components": [],
    "checks": {},
    "checks_fired": [],
    "uncertain_claims": [],
    "score_adjustments": [],
    "contradictions_found": [],
    "citation_checks": [],
    "model_disagreement": {
      "models": [],
      "agreement_rate": 0
    }
  }
}
```

## EvidenceBundleV1 (Schema v1)

EvidenceBundleV1 is the canonical evidence payload produced during verification.

### Key Fields

- `version`: `"1.0.0"`
- `bundle_version`: `"0.1"` or `"0.2"`
- `model_runs`, `claims`, `metrics`
- `signatures.bundle_sig_eip712`

## Explainability (`explain`)

The `explain` object is stable, machine-readable, and versioned.

- `score_components`: Array of named score components with optional weights
- `checks`: Extensible namespace for checks (`citations`, `contradictions`, `disagreement`, `policy`)
- `checks_fired`: Summary list of checks that triggered during verification
- `uncertain_claims`: Claim-level uncertainty list with reasons
- `score_adjustments`: Component-level score contributions and direction
- `contradictions_found`: Structured contradictions list
- `citation_checks`: Per-claim citation verdicts
- `model_disagreement`: Agreement rates and clusters
- `timings_ms`: Optional timing data (`fetch`, `program_run`, `total`)

## Validation & Errors

Schema validation is enforced in the API and verifier node.

### Error Shape

```json
{
  "error": "SchemaValidationError",
  "path": "/field",
  "message": "...",
  "schemaVersion": "v1"
}
```

## Versioning

- `version` and `receipt_version` are used for schema evolution.
- Receipts with legacy `receipt_version` values can be detected and migrated as needed.
