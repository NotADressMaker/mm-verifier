# Getting Started

This is a “local-first” setup path to run MMV end-to-end: contracts (dev chain), API, and verifier node.

## Prerequisites

- Node.js 18+
- A local Ethereum dev environment (Hardhat/Foundry, depending on repo scripts)
- Redis (used for the verification job queue)
- API keys for any LLM providers you plan to use (OpenAI/Anthropic/Google), or run in mock mode where available

## Quickstart: SDK in an app

Install the SDK:

```bash
npm install @mmv/sdk
```

Minimal usage (configure once, then verify any output):

```ts
import { verify, configure } from '@mmv/sdk';

configure({ baseUrl: 'http://localhost:3000' });

const receipt = await verify('Paris is the capital of France');

console.log(receipt.verdict ? 'Verified' : 'Unverified');
console.log(`Score: ${receipt.score_bps / 100}%`);
```

## Run the example app

There is an example app under `examples/` that demonstrates:

* generating an LLM response
* verifying it
* rendering a “Verified” badge + receipt details

Follow the README instructions inside `examples/`.

## Run the platform locally (API + verifier node)

High-level steps:

1. Configure environment variables:

* Copy `.env.example` to `.env`
* Add provider keys, RPC URLs, and Redis connection details

2. Install dependencies:

```bash
npm install
```

3. Compile and deploy contracts (local chain or testnet):

```bash
cd contracts
npm install
npx hardhat compile
# Deploy command depends on scripts/network configuration
```

4. Run the API:

```bash
cd api
npm install
npm run dev
```

5. Run the verifier node (separate terminal):

```bash
cd verifier-node
npm install
npm run start
```

## Health check

* API responds to `GET /api/...` routes (see API docs for exact paths)
* verifier node picks up queued jobs and submits commits/reveals
* a verification call returns a receipt and an evidence bundle URI
* if anything is missing, check `docs/KNOWN_GAPS.md` and `docs/INTEGRATION.md`

---

## Appendix: Core concepts

### Verification task (job)

A request to evaluate an AI output. Tasks are typically posted with a reward or fee budget and, often, a reference to a verification program. The task may include raw text or hashes of the prompt/output for privacy.

### Verifier

An independent operator that evaluates tasks. Verifiers usually participate through a commit-reveal flow: they commit to an evaluation hash first, then reveal score/verdict and evidence later. This helps prevent copying and herding.

### Receipt

A compact proof object that a verification occurred under specific rules. A receipt commonly includes `task_id`, `verdict` and `score_bps`, evidence `bundle_hash` and `bundle_uri`, `program_id`/`program_version`/hash, and `chain_id`/`contract_address`. Apps store and display receipts; anyone can check the onchain anchor.

### Evidence bundle

A structured offchain JSON artifact stored via IPFS/Arweave (or equivalent). It contains the audit trail: checks performed, citations, provenance, model run metadata, and scoring trace. Onchain data stores only compact commitments (hashes) and pointers.

### Verification program

A versioned workflow definition describing how verification is performed (steps, constraints, thresholds). Programs are fingerprinted so integrators can say “verified with Program X v1.2” and know the rules did not silently change.
