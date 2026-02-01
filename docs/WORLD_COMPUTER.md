# MMV as a World Computer for AI Verification

## Overview

MMV provides programmable, verifiable AI execution with receipts that settle on-chain. This document describes the core concepts and architecture that enable trustworthy AI computation.

## Core Concepts

### Programs

A **Program** is a deterministic verification workflow defined as a sequence of steps. Each program has:

- **Name and Version**: Human-readable identifiers
- **Steps**: Ordered execution stages (prompt, retrieve, cross-check, score, evidence, consensus)
- **Metering Limits**: Resource bounds for execution
- **Fingerprint**: Deterministic keccak256 hash of the canonical program definition

```typescript
interface ProgramDefinition {
  name: string;
  version: string;
  description?: string;
  inputs?: ProgramIO[];
  outputs?: ProgramIO[];
  steps: ProgramStep[];
  limits?: MeteringLimits;
}
```

#### Program Fingerprinting

Every program has a unique fingerprint computed from its canonical JSON representation:

```typescript
import { computeProgramFingerprint } from 'shared/programs';

const fingerprint = computeProgramFingerprint({
  name: 'factual-qa-v1',
  version: '1.0.0',
  steps: [
    { type: 'prompt', config: { temperature: 0.1 } },
    { type: 'cross-check' },
    { type: 'score' },
  ],
});
// => "0x7a8b9c..."
```

The same program always produces the same fingerprint, enabling:
- Deduplication of registered programs
- Verification that execution used the expected program
- Audit trails linking receipts to specific program versions

### Receipts

A **VerificationReceipt** is the canonical proof that a verification task completed. It acts as "settlement" for AI computation.

```typescript
interface VerificationReceipt {
  receipt_version: '1.0';
  task_id: string;
  generated_at: number;

  // Content hashes
  input_hash: string;   // keccak256 of input
  output_hash: string;  // keccak256 of selected output

  // Verification result
  score_bps: number;    // 0-10000 basis points
  verdict: boolean;     // passed threshold
  worthy: boolean;      // meets quality bar (80%)

  // Program reference
  program?: {
    program_id: string;
    fingerprint: string;
    name: string;
    version: string;
  };

  // Evidence bundle
  evidence: {
    bundle_hash: string;
    bundle_uri: string;
    bundle_version: '0.1' | '0.2';
  };

  // Resource metering
  metering?: {
    llm_calls: number;
    total_tokens: number;
    execution_ms: number;
  };

  // Execution provenance
  provenance: {
    llm_provider: string;
    llm_model: string;
    verifier_node?: string;
  };

  // On-chain settlement
  chain_context?: {
    chain_id: number;
    contract_address: string;
    finalized_at: number;
    block_number: number;
    tx_hash: string;
  };
}
```

### Receipt Hash

Each receipt has a deterministic hash computed from its core fields (excluding `chain_context` and `signature`):

```typescript
import { computeReceiptHash } from 'shared/receipt';

const hash = computeReceiptHash(receipt);
// => "0x1234..."
```

This hash can be verified against on-chain data to prove the receipt is authentic.

## Metering

Programs can specify resource limits that bound execution costs:

```typescript
interface MeteringLimits {
  max_llm_calls: number;        // Max LLM API calls
  max_total_tokens: number;      // Max tokens (in + out)
  max_execution_ms: number;      // Max wall-clock time
  max_retrieval_calls?: number;  // Max external fetches
  max_bundle_size_bytes?: number; // Max evidence size
}
```

Default limits:
- `max_llm_calls`: 10
- `max_total_tokens`: 100,000
- `max_execution_ms`: 300,000 (5 minutes)
- `max_retrieval_calls`: 20
- `max_bundle_size_bytes`: 5MB

Metering is recorded in the receipt and can be verified against program limits.

## On-Chain Verification

Receipts can be verified against on-chain event data:

```typescript
import {
  verifyReceiptAgainstEvents,
  FinalizedEvent,
  RevealedEvent,
} from 'shared/onchainVerify';

const result = verifyReceiptAgainstEvents(
  receipt,
  finalizedEvent,
  revealedEvent
);

if (result.verified) {
  console.log('Receipt matches on-chain records');
  console.log(`Block: ${result.chain_data.block_number}`);
} else {
  console.error('Verification failed:', result.errors);
}
```

### Verification Checks

1. **Task ID match**: Receipt task_id matches event taskId
2. **Score match**: Receipt score_bps matches event finalScoreBps
3. **Bundle hash match**: Receipt bundle_hash matches event bundleHash
4. **Timestamp validity**: Receipt generated before finalization

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Client                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                    SDK (sdk-js)                      │    │
│  │  - verifyText(), verifyWithProgram()                │    │
│  │  - getReceipt(), waitForFinal()                     │    │
│  │  - verifyReceiptOnChain()                           │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP/JSON
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       API Server                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Program Registry                        │    │
│  │  - Register programs with fingerprints              │    │
│  │  - Lookup by ID or fingerprint                      │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Receipt Service                         │    │
│  │  - Build receipts from task data                    │    │
│  │  - Attach chain context after finalization          │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ Job Queue
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Verifier Node                            │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Job Processor                           │    │
│  │  - Execute program steps                            │    │
│  │  - Track metering during execution                  │    │
│  │  - Check limits and log violations                  │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Evidence Bundler                        │    │
│  │  - Create v0.2 bundles with program + metering      │    │
│  │  - Compute deterministic hashes                     │    │
│  │  - Sign with EIP-712                                │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ On-chain
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Blockchain (Arbitrum)                       │
│  ┌─────────────────────────────────────────────────────┐    │
│  │           VerificationMarketplace                    │    │
│  │  - Revealed(taskId, evaluator, scoreBps, ...)       │    │
│  │  - Finalized(taskId, finalScoreBps, ...)            │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Use Cases

### 1. Agent Verification

An AI agent can verify its outputs before acting:

```typescript
const client = new MMVClient({ baseUrl, apiKey });

// Submit verification
const task = await client.verifyText({
  prompt: userQuery,
  models: ['gpt-4', 'claude-3'],
  taskType: 'factual-qa',
});

// Wait for receipt
const receipt = await client.waitForFinal(task.task_id);

if (receipt.worthy) {
  // High-quality output, proceed with action
  executeAction(receipt);
} else {
  // Low quality, request human review
  requestReview(receipt);
}
```

### 2. Programmatic Verification

Define custom verification programs:

```typescript
const program = {
  name: 'code-review',
  version: '1.0.0',
  steps: [
    { type: 'prompt', config: { systemPrompt: 'You are a code reviewer...' } },
    { type: 'cross-check', config: { models: 3 } },
    { type: 'score' },
  ],
  limits: {
    max_llm_calls: 5,
    max_total_tokens: 50000,
    max_execution_ms: 60000,
  },
};

const task = await client.verifyWithProgram({
  prompt: codeToReview,
  models: ['gpt-4', 'claude-3'],
  taskType: 'general',
  program,
});
```

### 3. Receipt Verification

Independently verify a receipt:

```typescript
import { verifyReceiptAgainstEvents } from 'shared/onchainVerify';

// Fetch on-chain events
const finalizedEvent = await getFinalizedEvent(receipt.task_id);
const revealedEvent = await getRevealedEvent(receipt.task_id);

// Verify
const result = verifyReceiptAgainstEvents(
  receipt,
  finalizedEvent,
  revealedEvent
);

if (!result.verified) {
  throw new Error(`Receipt verification failed: ${result.errors.join(', ')}`);
}
```

## Security Considerations

1. **Determinism**: Program fingerprints and receipt hashes are deterministic, enabling independent verification.

2. **Immutability**: On-chain events are immutable, providing a permanent audit trail.

3. **Provenance**: Evidence bundles include complete execution traces.

4. **Metering**: Resource limits prevent runaway costs and DoS.

5. **No New Contracts**: Uses existing VerificationMarketplace events, minimizing attack surface.

## Related Documentation

- [Trustworthy Outputs](./TRUSTWORTHY_OUTPUTS.md) - Verified output records
- [Integration Guide](./INTEGRATION.md) - How to integrate with MMV
- [API Reference](./api.md) - Full API documentation
