# MAMV

MAMV helps people see how an AI answer was checked. AI answers can be wrong, unsupported, or hard to audit; MAMV reviews model outputs, records the verification process, and packages the result as a portable MAMV trust receipt.

MAMV does **AI verification**, not truth magic. Optional **onchain anchoring** can make a receipt tamper-evident for higher-stakes accountability, but blockchain anchoring does not prove an AI answer is correct.

## Why it matters

A MAMV receipt gives teams and readers an audit trail for an AI output:

1. Submit an AI answer or claim.
2. MAMV runs verification against configured models, sources, and checks.
3. MAMV returns a portable receipt.
4. Anyone can view, share, download, and independently verify the receipt hash/signature.

## Quickstart

```bash
npm install
npm run dev
```

Create a mocked verification receipt in local development:

```bash
curl -X POST http://localhost:3000/api/verify \
  -H 'content-type: application/json' \
  -d '{"prompt":"Check this AI answer","models":["mock-llm"],"task_type":"factual-qa"}'
```

Open the dashboard and receipt viewer:

```bash
npm run dev:dashboard
```

## Example receipt

A receipt includes public fields such as `receipt_id`, `created_at`, checked input/output hashes, claim summary, verification status, confidence score, warnings, model/provider votes, outliers, quorum status, evidence metadata, receipt hash, signer metadata, and optional onchain anchor metadata.

```json
{
  "receipt_id": "0x...",
  "verification_status": "Likely",
  "confidence_score": 0.86,
  "quorum_status": { "met": true, "method": "supermajority" },
  "onchain_anchor": { "anchor_status": "not_anchored" }
}
```

## Verify a receipt

Use the receipt verifier package or API to recompute the receipt hash, check signer metadata when present, and compare optional onchain anchor fields against an independently fetched transaction.

## Roadmap

- **MVP:** AI output verification, receipt generation, receipt viewer, receipt verification, SDK/API.
- **Higher-stakes/accountability:** signed receipts, optional onchain anchoring, public receipt explorer.
- **Future protocol:** decentralized verifier marketplace, provider reputation, disputes/challenges, and staking/slashing if applicable.

See `docs/ABOUT.md`, `docs/RECEIPTS.md`, `docs/API.md`, `docs/ANCHORING.md`, and `docs/ROADMAP.md` for details.

## MAMV Education MVP

The dashboard includes an education vertical slice at `/education`. Use **Check an AI Answer** for student-answer review or **Review Teaching Material** for educator content. Start with `MOCK_VERIFIER=true`; education responses are visibly labeled deterministic demo mode and do not need paid provider credentials. See [Education documentation](docs/EDUCATION.md). MAMV provides evidence and confidence signals, not guarantees of truth, originality, fairness, or academic acceptability.
