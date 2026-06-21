# @mamv/genail-integration

GenAI Language (GenAIL) integration for MAMV verification with metering, receipts, and auditable evidence.

## Overview

This package provides a wrapper around GenAIL runtime that integrates with MAMV to provide:

- **Metering hooks**: Track LLM calls, token usage, execution time, and tool calls
- **Verification receipts**: Auto-generate cryptographic receipts for script executions
- **Auditable evidence**: Export complete evidence bundles for verification audit trails

## Installation

```bash
npm install @mamv/genail-integration
```

## Quick Start

```typescript
import { createVerifiedRuntime } from '@mamv/genail-integration';

// Create a runtime with MAMV verification enabled
const runtime = createVerifiedRuntime('https://api.mamv.io', 'your-api-key');

// Execute a GenAIL script
const result = await runtime.execute(`
  model "gpt-4"
  set question = $input.question
  message system "You are a helpful assistant."
  message user question
  generate as answer
`, { question: 'What is the capital of France?' });

// Check the result
if (result.success) {
  console.log('Output:', result.outputs);
  console.log('Receipt:', result.receipt);
  console.log('Score:', result.receipt.score_bps / 100, '%');
}
```

## Features

### Metering

Track resource consumption during script execution:

```typescript
import { createRuntime, DEFAULT_METERING_LIMITS } from '@mamv/genail-integration';

const runtime = createRuntime({
  metering_limits: {
    max_llm_calls: 10,
    max_total_tokens: 50000,
    max_execution_ms: 60000,
    max_retrieval_calls: 20,
    on_exceed: 'error', // or 'warn'
  },
});

const result = await runtime.execute(source, inputs);

// Check metering
console.log('LLM calls:', result.context.metering.llm_calls);
console.log('Tokens used:', result.context.metering.total_tokens);
console.log('Execution time:', result.context.metering.execution_ms, 'ms');

// Check limit utilization
console.log('Within limits:', result.metering_check.within_limits);
console.log('Utilization:', result.metering_check.utilization);
```

### Verification Receipts

Receipts provide cryptographic proof of execution:

```typescript
import { buildReceipt, validateReceiptIntegrity } from '@mamv/genail-integration';

// Receipts are auto-generated
const receipt = result.receipt;

console.log('Execution ID:', receipt.execution_id);
console.log('Input hash:', receipt.input_hash);
console.log('Output hash:', receipt.output_hash);
console.log('Program fingerprint:', receipt.program.fingerprint);

// Validate receipt integrity
const validation = validateReceiptIntegrity(receipt);
if (!validation.valid) {
  console.error('Invalid receipt:', validation.errors);
}
```

### Evidence Bundles

Export complete audit trails:

```typescript
import { buildEvidenceBundle, formatEvidenceSummary } from '@mamv/genail-integration';

const evidence = result.evidence;

// Evidence includes:
// - Program source hash and fingerprint
// - Input/output hashes with optional summaries
// - Full metering log with per-call breakdown
// - Model provenance (provider, model, commitment hashes)
// - Integrity hashes for tamper detection

console.log(formatEvidenceSummary(evidence));

// Validate evidence integrity
import { validateEvidenceIntegrity } from '@mamv/genail-integration';
const check = validateEvidenceIntegrity(evidence);
console.log('Evidence valid:', check.valid);
```

### Program Validation

Validate GenAIL programs before execution:

```typescript
import { validateAndFingerprint } from '@mamv/genail-integration';

const result = validateAndFingerprint(`
  model "gpt-4"
  message user "Hello"
  generate as response
`);

console.log('Valid:', result.valid);
console.log('Fingerprint:', result.fingerprint);
console.log('Models used:', result.metadata.models);
console.log('Tools called:', result.metadata.tools);
console.log('Complexity score:', result.metadata.complexity_score);

if (!result.valid) {
  console.error('Errors:', result.errors);
}
```

## API Reference

### Runtime

#### `createRuntime(config)`

Creates a new MAMV GenAIL runtime instance.

```typescript
const runtime = createRuntime({
  mamv: {
    base_url: 'https://api.mamv.io',
    api_key: 'your-api-key',
    auto_verify: true,
  },
  auto_verify: true,
  worthy_threshold_bps: 8000,
  metering_limits: { ... },
  evidence: { ... },
  hooks: { ... },
});
```

#### `createVerifiedRuntime(baseUrl, apiKey?, options?)`

Creates a runtime pre-configured for MAMV verification.

```typescript
const runtime = createVerifiedRuntime('https://api.mamv.io', 'api-key');
```

#### `runtime.execute(source, inputs, options?)`

Executes a GenAIL script with MAMV integration.

Returns `MMVExecutionResult`:
- `context`: Full execution context
- `outputs`: Script outputs
- `receipt`: Verification receipt
- `evidence`: Evidence bundle
- `metering_check`: Limit check result
- `success`: Boolean success flag
- `error`: Error if failed

### Metering

#### `createMeteringState()`

Creates initial metering state.

#### `recordLLMCall(state, params)`

Records an LLM call in metering state.

#### `recordToolCall(state, params)`

Records a tool call in metering state.

#### `checkMeteringLimits(state, limits)`

Checks metering state against limits.

#### `enforceMeteringLimits(state, limits)`

Enforces limits, throwing if exceeded and `on_exceed: 'error'`.

### Receipts

#### `buildReceipt(context, verification?)`

Builds a verification receipt from execution context.

#### `computeInputHash(inputs)`

Computes canonical hash of inputs.

#### `computeOutputHash(outputs)`

Computes canonical hash of outputs.

#### `computeProgramFingerprint(program)`

Computes deterministic program fingerprint.

#### `validateReceiptIntegrity(receipt)`

Validates receipt structure and hashes.

#### `validateReceiptAgainstContext(receipt, context)`

Validates receipt matches execution context.

### Evidence

#### `buildEvidenceBundle(context, options?)`

Builds an auditable evidence bundle.

Options:
- `include_source`: Include normalized source (default: true)
- `include_summaries`: Include I/O summaries (default: true)
- `include_call_log`: Include detailed call log (default: true)
- `include_reasoning_trace`: Include reasoning trace hashes (default: false)
- `storage`: Storage destination ('local', 'ipfs', 'arweave')

#### `validateEvidenceIntegrity(bundle)`

Validates evidence bundle integrity.

#### `validateEvidenceAgainstContext(bundle, context)`

Validates evidence matches execution context.

#### `parseGenAILProgram(source)`

Parses GenAIL source into program structure.

#### `normalizeSource(source)`

Normalizes source for consistent fingerprinting.

## Types

### MeteringLimits

```typescript
interface MeteringLimits {
  max_llm_calls: number;
  max_total_tokens: number;
  max_execution_ms: number;
  max_retrieval_calls?: number;
  on_exceed: 'warn' | 'error';
}
```

### GenAILVerificationReceipt

```typescript
interface GenAILVerificationReceipt {
  receipt_version: '1.0';
  execution_id: string;
  task_id?: string;
  program: {
    source_hash: string;
    fingerprint: string;
    metadata: GenAILProgramMetadata;
  };
  input_hash: string;
  output_hash: string;
  score_bps: number;
  verdict: boolean;
  worthy: boolean;
  metering: { ... };
  model_calls: Array<{ ... }>;
  evidence: { bundle_hash: string; bundle_uri?: string };
  executed_at: number;
  verified_at?: number;
  chain_context?: { ... };
}
```

### GenAILEvidenceBundle

```typescript
interface GenAILEvidenceBundle {
  bundle_version: '0.3';
  bundle_type: 'genail_execution';
  execution_id: string;
  generated_at: number;
  program: { ... };
  io: { input_hash: string; output_hash: string; ... };
  metering: MeteringState;
  model_provenance: ModelCallRecord[];
  reasoning_trace?: { ... };
  integrity: { bundle_hash: string; content_hash: string; signature?: string };
}
```

## Integration with GenAIL Runtime

To integrate with the actual GenAIL runtime, hook into runtime events:

```typescript
import { createMeteringHooks, createExecutionContext } from '@mamv/genail-integration';

// Create hooks
const ctx = createExecutionContext(program, inputs, config);
const hooks = createMeteringHooks(ctx, limits);

// In GenAIL runtime integration:
genailRuntime.on('beforeGenerate', hooks.beforeGenerate);
genailRuntime.on('afterGenerate', hooks.afterGenerate);
genailRuntime.on('beforeToolCall', hooks.beforeToolCall);
genailRuntime.on('afterToolCall', hooks.afterToolCall);
```

## License

MIT
