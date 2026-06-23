# MAMV JavaScript SDK

Copy-paste friendly client for MAMV AI verification and portable trust receipts.

## Verify an AI answer and get a receipt

```ts
import { MAMVClient } from '@mamv/sdk';

const client = new MAMVClient({ baseUrl: 'http://localhost:3000' });

const task = await client.verifyText({
  prompt: 'AI answer to check: The James Webb Space Telescope launched on December 25, 2021.',
  models: ['mock-llm'],
  taskType: 'factual-qa',
});

const receipt = await client.getReceipt(task.task_id);
console.log(receipt?.verification_status, receipt?.confidence_score);
```

## Display receipt status

```ts
function label(receipt) {
  return receipt.verification_status ?? (receipt.verdict ? 'Likely' : 'Unverified');
}
```

## Verify a receipt later

```ts
const result = await client.verifyReceiptOnChain(receipt.task_id, receipt.receipt_hash);
console.log(result.verified);
```

Onchain anchoring is optional and tamper-evident; it does not prove the AI answer is correct.

See `examples/receipt-first.ts` for a complete demo flow.
