# MAMV JavaScript SDK

Minimal, typed client for the MAMV verification API.

## Install (workspace)

```bash
npm install
```

## Usage

```ts
import { MAMVClient } from '@mamv/sdk';

const client = new MAMVClient({ baseUrl: 'http://localhost:3000' });

const response = await client.verifyText({
  prompt: 'Summarize the article.',
  models: ['gpt-4.1-mini'],
  taskType: 'general',
  idempotencyKey: 'demo-1',
});

console.log(response.task_id, response.status);
```

## Program-based verification

```ts
const response = await client.verifyWithProgram({
  prompt: 'Check the compliance statement.',
  models: ['gpt-4.1-mini'],
  taskType: 'policy-compliance',
  program: {
    name: 'Compliance Check',
    version: '1.0.0',
    inputs: [{ name: 'statement', type: 'string', required: true }],
    outputs: [{ name: 'verdict', type: 'boolean' }],
    steps: [
      { type: 'prompt', description: 'Ask the model to evaluate the statement.' },
      { type: 'score', description: 'Score based on policy rules.' },
    ],
  },
});
```
