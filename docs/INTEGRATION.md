# MMV Integration Guide

## Overview

This guide covers integrating MMV verification into your application. MMV provides:
- Multi-model AI verification
- Cryptographic receipts for audit trails
- On-chain settlement for trustless verification

## Quick Start

### Installation

```bash
npm install @mmv/sdk-js
```

### Basic Usage

```typescript
import { MMVClient } from '@mmv/sdk-js';

const client = new MMVClient({
  baseUrl: 'https://api.mmv.example.com',
  apiKey: 'your-api-key',
});

// Submit a verification request
const task = await client.verifyText({
  prompt: 'What is the capital of France?',
  models: ['gpt-4', 'claude-3'],
  taskType: 'factual-qa',
});

console.log(`Task ID: ${task.task_id}`);
console.log(`Status: ${task.status}`);
```

## Verification Flow

### 1. Submit Task

```typescript
const task = await client.verifyText({
  prompt: userQuery,
  models: ['gpt-4', 'claude-3-opus', 'gemini-pro'],
  taskType: 'factual-qa',
});
```

**Task Types:**
- `factual-qa`: Factual questions with verifiable answers
- `math-proof`: Mathematical proofs and calculations
- `policy-compliance`: Policy and rule checking
- `citation-check`: Citation and source verification
- `general`: General-purpose verification

### 2. Wait for Finalization

```typescript
// Option A: Poll for status
const finalTask = await client.getTask(task.task_id);
if (finalTask.status === 'finalized') {
  console.log(`Score: ${finalTask.score_bps / 100}%`);
}

// Option B: Wait with timeout
const receipt = await client.waitForFinal(task.task_id, {
  pollIntervalMs: 5000,
  timeoutMs: 300000,
});
```

### 3. Get Receipt

```typescript
const receipt = await client.getReceipt(task.task_id);

console.log(`Task: ${receipt.task_id}`);
console.log(`Score: ${receipt.score_bps / 100}%`);
console.log(`Verdict: ${receipt.verdict ? 'PASS' : 'FAIL'}`);
console.log(`Worthy: ${receipt.worthy}`);
console.log(`Evidence: ${receipt.evidence.bundle_uri}`);
```

### 4. Verify On-Chain (Optional)

```typescript
const verification = await client.verifyReceiptOnChain(task.task_id);

if (verification.verified) {
  console.log(`Verified in block ${verification.chain_data.block_number}`);
}
```

## Programs

Programs define custom verification workflows with resource limits.

### Registering a Program

```typescript
const record = await client.registerProgram({
  name: 'custom-verification',
  version: '1.0.0',
  description: 'Custom verification for my use case',
  steps: [
    { type: 'prompt', config: { temperature: 0.1 } },
    { type: 'retrieve', config: { sources: ['web'] } },
    { type: 'cross-check' },
    { type: 'score' },
  ],
  limits: {
    max_llm_calls: 5,
    max_total_tokens: 50000,
    max_execution_ms: 60000,
  },
});

console.log(`Program ID: ${record.program_id}`);
console.log(`Fingerprint: ${record.fingerprint}`);
```

### Using a Program

```typescript
// By program ID
const task = await client.verifyWithProgram({
  prompt: userQuery,
  models: ['gpt-4', 'claude-3'],
  taskType: 'general',
  programId: 'prog_7a8b9c12',
});

// Or inline
const task = await client.verifyWithProgram({
  prompt: userQuery,
  models: ['gpt-4', 'claude-3'],
  taskType: 'general',
  program: {
    name: 'inline-program',
    version: '1.0.0',
    steps: [{ type: 'prompt' }, { type: 'score' }],
  },
});
```

## Records

Query verified output records from the trustworthy outputs ledger.

### List Records

```typescript
const { records, total, has_more } = await client.listRecords({
  worthy_only: true,
  min_score_bps: 8000,
  limit: 50,
  offset: 0,
});

for (const record of records) {
  console.log(`${record.task_id}: ${record.score_bps} bps`);
}
```

### Get Single Record

```typescript
const record = await client.getRecord(taskId);

if (record) {
  console.log(`Task: ${record.task_id}`);
  console.log(`Worthy: ${record.worthy}`);
  console.log(`Bundle: ${record.bundle_uri}`);
}
```

## Idempotency

Use idempotency keys to safely retry requests:

```typescript
const task = await client.verifyText({
  prompt: userQuery,
  models: ['gpt-4', 'claude-3'],
  taskType: 'factual-qa',
  idempotencyKey: 'unique-request-id-123',
});
```

Repeated requests with the same key return the same task.

## Error Handling

```typescript
try {
  const task = await client.verifyText({
    prompt: userQuery,
    models: ['gpt-4'],
    taskType: 'factual-qa',
  });
} catch (error) {
  if (error.message.includes('400')) {
    // Validation error
    console.error('Invalid request:', error);
  } else if (error.message.includes('429')) {
    // Rate limited
    console.error('Rate limited, retry later');
  } else {
    // Other error
    console.error('Verification failed:', error);
  }
}
```

## Receipt Verification

### Compute Receipt Hash

```typescript
import { computeReceiptHash } from 'shared/receipt';

const hash = computeReceiptHash(receipt);
console.log(`Receipt hash: ${hash}`);
```

### Verify Against On-Chain

```typescript
import { verifyReceiptAgainstEvents } from 'shared/onchainVerify';

const result = verifyReceiptAgainstEvents(
  receipt,
  finalizedEvent,
  revealedEvent
);

if (result.verified) {
  console.log('Receipt verified!');
  console.log(`Block: ${result.chain_data.block_number}`);
  console.log(`Tx: ${result.chain_data.tx_hash}`);
} else {
  console.error('Verification failed:', result.errors);
}
```

### Full Verification

```typescript
import { performFullVerification } from 'shared/onchainVerify';

const result = performFullVerification({
  receipt,
  finalizedEvent,
  revealedEvent,
  bundleContent: evidenceBundle,
  inputContent: userQuery,
  outputContent: selectedResponse,
});

console.log(`Verified: ${result.verified}`);
console.log(`Bundle verified: ${result.bundle_verified}`);
console.log(`Input verified: ${result.input_verified}`);
console.log(`Output verified: ${result.output_verified}`);
```

## Best Practices

### 1. Use Appropriate Models

More models = higher consensus reliability but higher cost:

```typescript
// High-stakes: Use 3+ models
const task = await client.verifyText({
  prompt: criticalQuery,
  models: ['gpt-4', 'claude-3-opus', 'gemini-pro'],
  taskType: 'factual-qa',
});

// Low-stakes: 2 models may suffice
const task = await client.verifyText({
  prompt: simpleQuery,
  models: ['gpt-4', 'claude-3-haiku'],
  taskType: 'general',
});
```

### 2. Set Metering Limits

Prevent runaway costs with metering limits:

```typescript
const program = {
  name: 'cost-bounded',
  version: '1.0.0',
  steps: [{ type: 'prompt' }, { type: 'score' }],
  limits: {
    max_llm_calls: 3,
    max_total_tokens: 10000,
    max_execution_ms: 30000,
  },
};
```

### 3. Store Receipts

Store receipts for audit trails:

```typescript
const receipt = await client.waitForFinal(task.task_id);

// Store in database
await db.receipts.insert({
  task_id: receipt.task_id,
  receipt_hash: computeReceiptHash(receipt),
  receipt_json: JSON.stringify(receipt),
  verified_at: new Date(),
});
```

### 4. Verify Before Acting

Always verify before taking irreversible actions:

```typescript
const receipt = await client.waitForFinal(task.task_id);

if (!receipt.verdict) {
  throw new Error('Verification failed, aborting action');
}

if (!receipt.worthy) {
  console.warn('Low quality score, requesting human review');
  return requestHumanReview(receipt);
}

// Proceed with action
executeAction(receipt);
```

### 5. Handle Timeouts

Set appropriate timeouts based on your SLAs:

```typescript
try {
  const receipt = await client.waitForFinal(task.task_id, {
    pollIntervalMs: 2000,
    timeoutMs: 60000, // 1 minute for time-sensitive ops
  });
} catch (error) {
  if (error.message.includes('Timeout')) {
    // Fallback to async processing
    await queueForLaterCheck(task.task_id);
  }
}
```

## TypeScript Types

```typescript
import type {
  VerifyResponse,
  VerificationReceipt,
  VerifiedOutputRecord,
  ProgramRecord,
  RecordQueryFilter,
  OnChainVerifyResult,
} from '@mmv/sdk-js';
```

## Related Documentation

- [World Computer](./WORLD_COMPUTER.md) - Core concepts and architecture
- [Trustworthy Outputs](./TRUSTWORTHY_OUTPUTS.md) - Verified output records
- [API Reference](./api.md) - Full API documentation
