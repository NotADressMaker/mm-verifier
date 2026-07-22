# Experimental distillation-watermark assessment

## Purpose and proposition

This optional, experimental assessment evaluates one scoped proposition: **a declared text sample set exhibits a statistical token-selection bias consistent with a declared green/red-list watermark configuration.** It is verification context attached to a receipt, not a factual-answer verdict and not an attribution system.

> This assessment reports statistical evidence that a text sample is compatible with the tested watermark configuration. It does not prove that training or distillation occurred, does not identify an actor, does not establish intent or authorization status, and does not by itself justify enforcement. A negative result means that no signal was detected in this sample under the declared detector configuration; it does not establish that distillation did not occur. Treat the assessment as verification context, not proof.

## Method, samples, and compatibility

`green_red_list_bias` compares eligible token positions with the declared green-list fraction. The one-sided null is that eligible tokens follow that rate; the alternative is an excess green-token rate. Receipts disclose counts, z-score, raw and adjusted p-values, effect size, eligibility/exclusion rules, configured thresholds, tokenizer and normalization identity, scheme/key **alias** version, and the detector version. No raw prompt or secret key is serialized.

The detector does not run a statistical test when declared and observed scheme, scheme version, key version, tokenizer/revision, vocabulary hash, normalization, green fraction, context width, seeding, eligibility, special-token policy, or decoding constraints conflict. An incompatible configuration is not a negative result.

Duplicate text hashes count once. Unique eligible session IDs, rather than chunks, reruns, keys, or partitions, determine `independentSessionCount`. Sessions are collection evidence, not independent detector methods. Multiple hypotheses use the recorded correction; the implementation never silently selects a favorable raw p-value.

## Calibration and review

A calibration artifact identifies its corpus, language/domain scope, sample sizes, evaluated thresholds, and observed false-positive rates. A p-value is not a real-world false-positive base rate. Without a matching artifact the base rate is `null`; `legal_cautious` cannot issue the strongest status. Borderline and detected results, incompatible configuration, and unestablished independence require human review. Reason codes preserve calibration, compatibility, correction, and alternative-explanation concerns.

A signal can result from copied or retrieved watermarked text, prompt inclusion, post-processing, shared middleware, benchmark or harness reuse, assembled outputs, or synthetic-data ingestion. Paraphrase, translation, truncation, token substitution, decoding changes, fine-tuning, RLHF, quantization, routing, retrieval, code formatting, non-English text, and domain shift can weaken or transform detectability. No empirical robustness percentage is claimed.

## Receipt example

```json
{
  "distillation_watermark_assessment": {
    "schemaVersion": "distillation-watermark-assessment/v1",
    "status": "borderline",
    "detected": false,
    "method": "green_red_list_bias",
    "keyVersion": "public-alias-2026-q3",
    "humanReviewRequired": true
  }
}
```

When absent, the optional field is absent from the canonical hash input. When present, it is canonically committed, including the scoped subject, statistics, limitations, and review reasons. There is no bare `watermarkDetected` field.

## Key handling and emitter dependency

Key material is a credential and is intentionally outside this contract, logs, errors, fixtures, and receipts. Implementations must load a server-managed alias through the established environment/secrets path rather than accepting raw keys in a CLI argument or API request.

MAMV currently has **no compatible MAMV-Model emitter manifest** in this repository. Accordingly this detector uses injected deterministic scorers and synthetic fixtures only; it is experimental, real-world calibration has not been performed, ecosystem integration is deferred, and production attribution is not supported. A future MAMV-Model PR must publish a versioned non-secret manifest before production use.
