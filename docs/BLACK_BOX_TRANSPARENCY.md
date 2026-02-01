# AI Black Box Transparency in MMV

## Overview

This document evaluates what transparency MMV provides for AI decision-making, what remains opaque, and the trust assumptions users should understand.

AI systems are often described as "black boxes" because their internal decision-making processes are not directly observable. MMV addresses specific aspects of this opacity through cryptographic commitments, provenance tracking, and on-chain anchoring—while acknowledging the fundamental limitations that remain.

## What MMV Provides

### 1. Input/Output Provenance

MMV creates cryptographic commitments to verification inputs and outputs:

| Field | Description | Guarantee |
|-------|-------------|-----------|
| `input_hash` | keccak256 of canonical input | Proves exact input that was verified |
| `output_hash` | keccak256 of canonical output | Proves exact output that was selected |
| `prompt_hash` | keccak256 of prompt text | Links verification to specific query |

These hashes allow anyone to verify that a claimed input/output pair matches the on-chain record.

### 2. Model Run Provenance

Each verification captures metadata about the LLM calls made:

```typescript
interface ProvenanceModelRun {
  provider: string;           // "openai", "anthropic", etc.
  model: string;              // "gpt-4", "claude-3-opus"
  prompt_hash: `0x${string}`;
  response_hash: `0x${string}`;
  started_at: number;
  finished_at: number;
  latency_ms?: number;
  tokens_in?: number;
  tokens_out?: number;
  // NEW: Model commitment fields
  model_commitment_hash?: `0x${string}`;
  inference_config_hash?: `0x${string}`;
}
```

This provides:
- Which models were queried
- When queries occurred
- Response timing and token usage
- Cryptographic commitment to model version/config (when available)

### 3. On-Chain Anchoring

MMV anchors verification results to immutable blockchain events:

- **Revealed event**: Records evaluator, score, bundle hash, bundle URI
- **Finalized event**: Records final score after consensus
- **Block number and transaction hash**: Provides timestamp and ordering

On-chain data cannot be altered after finalization.

### 4. Scoring Transparency

The `scoring_trace` captures how scores were computed:

```typescript
interface ScoringTrace {
  rubric_hash: `0x${string}`;
  score_bps: number;
  verdict: 'reliable' | 'mixed' | 'unreliable';
  breakdown: {
    consistency?: number;
    agreement?: number;
    citation_quality?: number;
    factual_accuracy?: number;
  };
  weights?: Record<string, number>;
  reasoning_hash?: `0x${string}`;
  generated_at: number;
}
```

### 5. Program Fingerprinting

Verification programs have deterministic fingerprints:

```typescript
const fingerprint = computeProgramFingerprint(program);
// => "0x7a8b9c..." (keccak256 of canonical program definition)
```

This proves which verification logic was executed.

### 6. Reasoning Trace Commitments (New)

MMV can capture reasoning steps without exposing raw chain-of-thought:

```typescript
interface ReasoningTraceStep {
  step_id: string;
  summary?: string;              // Optional short summary (not full CoT)
  thought_hash: `0x${string}`;   // Hash of full reasoning text
  evidence_refs?: string[];      // URIs to supporting sources
  confidence?: number;
}
```

The full reasoning text is stored off-chain (optionally encrypted). Only hashes appear in the bundle, enabling:
- Proof that specific reasoning occurred
- Audit capability with access to off-chain data
- Privacy for sensitive reasoning content

### 7. Model Commitment Registry (New)

Model runs include cryptographic commitments to model configuration:

```typescript
interface ModelCommitment {
  provider: string;
  model: string;
  version?: string;
  inference_config: {
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
    // ... other params
  };
}

const commitment_hash = hashCanonical(modelCommitment);
```

This allows detection of silent model updates between verifications.

---

## What Remains Opaque

### 1. Model Internals

**MMV cannot reveal:**
- Neural network weights
- Attention patterns
- Hidden state activations
- Why a model produced a specific token

**Reason:** LLM providers do not expose internals. Even open-weight models have billions of parameters that are not practically interpretable.

**Implication:** MMV proves *what* was computed, not *why* at the neural level.

### 2. Provider-Side Computation

**MMV cannot verify:**
- That the provider actually ran the claimed model
- That the provider used the claimed configuration
- That responses weren't cached or modified

**Reason:** Computation happens on provider infrastructure. MMV receives API responses, not proof of execution.

**Implication:** Users must trust that providers (OpenAI, Anthropic, etc.) return authentic responses.

### 3. Verifier Node Integrity

**MMV cannot prove:**
- That verifier nodes executed the verification honestly
- That verifier nodes didn't manipulate scores or evidence

**Reason:** Without zero-knowledge proofs, verifier nodes are trusted parties.

**Current mitigation:**
- Multi-verifier consensus (when enabled)
- Staking and slashing for misbehavior
- Evidence bundles allow post-hoc auditing

**Future mitigation:** ZK proofs could make verification trustless (see ZK Roadmap below).

### 4. Full Reasoning Content

**By design, MMV does not store:**
- Raw chain-of-thought text in evidence bundles
- Sensitive intermediate reasoning

**Reason:** Privacy and security. Chain-of-thought may contain:
- Sensitive user data
- Proprietary prompt engineering
- Information that could enable adversarial attacks

**Access:** Full reasoning is available off-chain with appropriate access controls.

---

## Threat Model

### Actors

| Actor | Trust Level | Capabilities |
|-------|-------------|--------------|
| LLM Provider | Trusted | Could return fake responses, cache results, or silently update models |
| Verifier Node | Semi-trusted | Could manipulate scores; mitigated by staking/slashing |
| Blockchain | Trustless | Provides immutable anchoring after finalization |
| IPFS/Storage | Semi-trusted | Could serve different content for same hash; mitigated by hash verification |
| End User | Untrusted | Receives receipts and can independently verify hashes |

### What MMV Guarantees

1. **Data Integrity**: If hashes match, content is authentic
2. **Immutability**: On-chain records cannot be altered
3. **Auditability**: Evidence bundles provide complete verification trail
4. **Consistency**: Same program fingerprint = same verification logic
5. **Timing**: Block timestamps prove when verification occurred

### What MMV Does Not Guarantee

1. **Correct Execution**: Without ZK proofs, relies on verifier honesty
2. **Model Authenticity**: Relies on provider honesty
3. **Reasoning Validity**: Hashes prove reasoning occurred, not that it was sound
4. **Future Availability**: Off-chain data (IPFS) may become unavailable

---

## Comparison: MMV vs Ethereum for AI Accountability

Ethereum provides general-purpose transaction transparency. MMV extends this with AI-specific primitives:

| Capability | Ethereum | MMV |
|------------|----------|-----|
| Transaction immutability | ✅ | ✅ (inherits) |
| Input/output provenance | ❌ | ✅ Cryptographic commitments |
| Model run metadata | ❌ | ✅ Provider, model, timing, tokens |
| Model version commitments | ❌ | ✅ Detects silent model updates |
| Reasoning trace commitments | ❌ | ✅ Hash-based audit trail |
| Multi-model consensus | ❌ | ✅ Cross-checks multiple LLMs |
| Scoring transparency | ❌ | ✅ Breakdown of score components |
| Evidence bundle audit | ❌ | ✅ Complete verification trail |

MMV does not claim to be "better than Ethereum" in general. It provides AI-specific transparency primitives that Ethereum's transaction model does not address.

---

## ZK Proof Roadmap

To achieve trust-minimized verification, MMV is designed to integrate zero-knowledge proofs:

### Current State
- Verifier nodes are trusted parties
- Evidence bundles allow post-hoc auditing
- Staking/slashing provides economic security

### Future State (with ZK)
```typescript
interface ZKVerificationReceipt {
  // Proof that verification was computed correctly
  zk_proof: `0x${string}`;

  // Public inputs anyone can verify
  zk_public_inputs: {
    input_hash: `0x${string}`;
    output_hash: `0x${string}`;
    model_commitment_hash: `0x${string}`;
    score_bps: number;
    bundle_hash: `0x${string}`;
  };
}
```

With ZK proofs:
- Verification correctness is cryptographically proven
- Verifier nodes don't need to be trusted
- On-chain verification becomes possible

Candidate proof systems: RISC Zero, SP1, Noir.

---

## Recommendations for Users

### For High-Stakes Verifications

1. **Enable multi-model consensus**: Query 3+ models
2. **Require worthy threshold**: Only accept scores ≥ 8000 bps
3. **Verify on-chain**: Check Finalized event exists
4. **Store receipts**: Keep local copies of verification receipts
5. **Audit periodically**: Spot-check evidence bundles

### For Privacy-Sensitive Verifications

1. **Disable full reasoning trace storage**: Set `REASONING_TRACE_STORE_FULL=false`
2. **Use hash-only mode**: Only commit hashes, not summaries
3. **Encrypt off-chain data**: If storing full traces, encrypt before IPFS upload

### For Regulatory Compliance

1. **Maintain audit trail**: Store all evidence bundles
2. **Document model versions**: Use model commitment hashes
3. **Retain provenance**: Keep records of which models were queried when
4. **Enable reasoning traces**: Hash-based commitments provide audit capability

---

## Summary

MMV provides transparency for:
- **What** was verified (inputs, outputs, hashes)
- **How** it was verified (programs, scoring, models)
- **When** it was verified (on-chain timestamps)
- **That** reasoning occurred (hash commitments)

MMV cannot reveal:
- **Why** a model produced an answer (neural internals)
- **Whether** providers are honest (trust assumption)
- **Whether** verifiers are honest (without ZK proofs)

This is a significant improvement over unverified AI outputs, while acknowledging fundamental limitations. Future ZK integration will further reduce trust assumptions.
