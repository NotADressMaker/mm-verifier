# MAMV-Guard

MAMV-Guard is a production-oriented General AI Output Verifier Service for gating AI-generated content before publishing or automation. It uses `@mamv/sdk` for multi-LLM MAMV consensus, stores the receipt and decision trail, exposes shareable badges, and treats Arbitrum on-chain anchoring as a first-class trust signal.

## Project structure

```text
apps/mamv-guard/
├── app/                         # Next.js 15 App Router UI and REST routes
│   ├── api/verify/route.ts       # Single verification endpoint
│   ├── api/verify/batch/route.ts # JSON/CSV batch endpoint
│   ├── api/receipts/[id]/        # Receipt JSON and SVG badge endpoints
│   ├── dashboard/page.tsx        # Operator dashboard
│   └── receipts/[id]/page.tsx    # Public receipt page
├── bin/mamv-guard.js             # CLI wrapper
├── lib/                          # Modular verification, policy, webhook, DB code
├── prisma/schema.prisma          # SQLite default persistence model
├── Dockerfile
├── docker-compose.yml
└── README.md
```

## Setup

```bash
cd apps/mamv-guard
cp .env.example .env
npm install
npx prisma migrate dev --name init
npm run dev
```

Set `MAMV_BASE_URL`, `MAMV_API_KEY`, `MAMV_CHAIN_ID`, and `MAMV_CONTRACT_ADDRESS` for your MAMV deployment. SQLite is the default via `DATABASE_URL=file:./dev.db`.

## Verify one output

```bash
curl -X POST http://localhost:3000/api/verify \
  -H 'content-type: application/json' \
  -d '{
    "prompt":"Write a claim about Paris.",
    "outputs":[{"content":"Paris is the capital of France.","model":"gpt-4o"}],
    "metadata":{"tenant":"docs"},
    "policy":{"thresholdBps":8000,"anchor":true,"domain":"general"}
  }'
```

A successful response includes `status`, `scoreBps`, `worthy`, `receiptUrl`, `badgeUrl`, and `anchor` fields with chain ID, contract address, transaction hash, and block number when available.

## Batch JSON and CSV

JSON:

```bash
curl -X POST http://localhost:3000/api/verify/batch \
  -H 'content-type: application/json' \
  -d '{"policy":{"anchor":true},"items":[{"prompt":"Check this","outputs":["AI text"]}]}'
```

CSV columns: `prompt,output,source,domain,anchor,threshold`.

```bash
curl -X POST http://localhost:3000/api/verify/batch \
  -H 'content-type: text/csv' --data-binary @items.csv
```

## CLI

```bash
mamv-guard verify input.json --threshold 8000 --anchor
```

`input.json` matches the `/api/verify` request body. The CLI exits `0` only when the service returns `VERIFIED`.

## Policies and domain extensions

Policies are centralized in `lib/policies.ts`. Add a domain default such as `healthcare`, point it to a custom MAMV `taskType`, `programId`, and `programVersion`, then pass `{ "policy": { "domain": "healthcare" } }` from API, CSV, or CLI. High-risk domains should set `anchor: true`, `requireWorthy: true`, and a higher `thresholdBps`.

## Webhooks

Pass `policy.webhooks` with HTTPS URLs. MAMV-Guard signs each JSON payload using `x-mamv-guard-signature = HMAC-SHA256(body, MAMV_GUARD_WEBHOOK_SECRET)` and records delivery status in SQLite.

## Docker

```bash
cd apps/mamv-guard
docker compose up --build
```

## Production notes

- Put the Next.js server behind a real edge/WAF rate limiter; the in-memory limiter is a safe default for a single instance.
- Use Postgres by changing `prisma/schema.prisma` provider and `DATABASE_URL` when scaling horizontally.
- Keep `anchor: true` for publish-critical workflows so consumers can validate receipt hashes against Arbitrum events.
