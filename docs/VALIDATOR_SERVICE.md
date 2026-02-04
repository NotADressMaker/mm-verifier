# Validator-as-a-Service (MMV)

This document summarizes the request/result interfaces discovered in the MMV repo and how the new validator service integrates with them.

## Repository discovery (interfaces)

**Verification request creation**
- `/api/verify` creates an on-chain task via `submitVerificationJob` and enqueues a job for verifier nodes in Redis (`api/src/routes/verify.ts`, `api/src/services/jobQueue.ts`).【F:api/src/routes/verify.ts†L1-L214】【F:api/src/services/jobQueue.ts†L1-L83】
- On-chain tasks are created by `VerifierMarketplace.createTask` and identified by the `TaskCreated` event, which is parsed in `api/src/services/blockchain.ts`.【F:api/src/services/blockchain.ts†L1-L116】

**Request contents**
- On-chain task metadata (prompt hash, rubric hash, deadlines, eval counts, etc.) is fetched via `getTaskDetails` in the API blockchain service.【F:api/src/services/blockchain.ts†L118-L171】
- For MMV API verification (`/api/mmv/verify`), the request is `{ taskId, input, candidates[] }` and produces an MMV receipt via `buildMMVReceipt`.【F:api/src/routes/mmv.ts†L1-L70】

**Result posting**
- Verifier nodes commit/reveal results on-chain via `commitEvaluation` and `revealEvaluation` in `verifier-node/src/services/blockchain.ts`.【F:verifier-node/src/services/jobProcessor.ts†L132-L210】
- For validator-as-a-service, results are posted to the new MMV read API endpoint `/api/validation/requests/:id/results` with a `ValidationReceipt`.

**Validator identity**
- Validator identity in this service is a configured `VALIDATOR_ID` (env). This aligns with existing MMV patterns where verifiers are represented by addresses or node IDs (e.g., `VERIFIER_NODE_ID`, wallet address).【F:verifier-node/src/services/jobProcessor.ts†L78-L118】

## Validator Service Overview

The validator service (`services/validator`) polls the MMV API for work validation requests, runs the appropriate verification plugin, stores receipts locally, and posts receipts back to MMV.

### Request Schema

Requests are created via:

```
POST /api/validation/requests
```

Payload (from `shared/validationTypes.ts`):
- `plugin`: `deterministic`, `test-suite`, or `tee_or_zk`
- `payload`: plugin-specific payload (runner, command, workspacePath/testsCommand, proofURI, etc.)

### Receipt Schema

Receipts include:
- `requestId`, `receiptId`, `plugin`
- `verdict`, `score`, `tag`
- `receiptHash`, `logsHash`, `environmentHash`
- `validatorId`, `workHash`, `proofHash`, `receiptURI`

Receipts are posted to:

```
POST /api/validation/requests/:id/results
```

## Local Dev

1. Start a local chain (optional, for MMV contracts):
   ```
   ./scripts/dev-chain.sh
   ```
2. Start the API:
   ```
   cd api && npm run dev
   ```
3. Start the validator service:
   ```
   cd services/validator && npm run dev
   ```
4. Create a validation request:
   ```
   curl -X POST http://localhost:3000/api/validation/requests \
     -H 'Content-Type: application/json' \
     -d '{"plugin":"deterministic","payload":{"runner":"bash","command":"echo hello","inputHash":"0x123"}}'
   ```
5. Open the demo endpoint (adds `X-MMV-Receipt` header):
   ```
   http://localhost:3000/api/validation/demo/protected?requestId=<requestId>
   ```
