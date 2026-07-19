# MAMV: Trust receipts for AI answers

## Every AI answer comes with a trust receipt.

Before an AI answer goes to your boss, into a report, or out to the public, you need to know what supports it—and be able to show that you checked it. MAMV gives every reviewed AI answer a portable trust receipt: a clear record of what was checked, what the review found, and how someone else can inspect it.

MAMV does **AI verification**, not truth magic. Optional **onchain anchoring** can make a receipt tamper-evident for higher-stakes accountability, but blockchain anchoring does not prove an AI answer is correct.

## What a trust receipt helps you do

A MAMV receipt gives teams and readers a practical answer to the questions that matter:

- **Can I trust this AI answer?** See the support level, confidence signals, warnings, and evidence behind the review.
- **Will my boss or audience believe it?** Share a portable record of what was checked instead of asking them to take your word for it.
- **Can I safely publish this?** Surface gaps and limitations before an answer is used in a product, report, workflow, or decision.
- **How do I prove I checked it?** Let anyone inspect the receipt and independently verify its hash or signature.

Behind each receipt, MAMV runs verification against configured models, sources, and checks:

1. Submit an AI answer or claim.
2. MAMV reviews it against configured models, sources, and checks.
3. MAMV returns a portable trust receipt.
4. Anyone can view, share, download, and independently verify the receipt hash/signature.

## Quickstart

```bash
npm install
npm run dev
```

## Multi-tenant local development

MAMV is a shared deployment with organization-scoped data. After configuring PostgreSQL and Redis, run `npm run seed` to create two development organizations, a shared owner, and admin/member/viewer memberships. See [multi-tenancy architecture](docs/MULTI_TENANCY.md) for the migration and authenticated organization API flow.

Create a mocked trust receipt in local development:

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
  "verification_status": "Mostly supported",
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

See `docs/ABOUT.md`, `docs/VERDICTS.md`, `docs/RECEIPTS.md`, `docs/API.md`, `docs/ANCHORING.md`, and `docs/ROADMAP.md` for details.

## MAMV Education MVP

The dashboard includes an education vertical slice at `/education`. Use **Check an AI Answer** for student-answer review or **Review Teaching Material** for educator content. Start with `MOCK_VERIFIER=true`; education responses are visibly labeled deterministic demo mode and do not need paid provider credentials. See [Education documentation](docs/EDUCATION.md). MAMV provides evidence and confidence signals, not guarantees of truth, originality, fairness, or academic acceptability.

## Organization dashboard

The dashboard at the application root is the organization workspace for authenticated MAMV customers. It uses the server-side organization context on every request; the browser never selects a tenant by sending an unverified organization ID.

- **Create an organization:** provision an organization and owner membership through the existing authentication/provisioning flow.
- **Switch organizations:** choose a workspace from the organization switcher. MAMV validates the selected membership server-side, then requires a fresh signed session before loading the new context.
- **Manage members:** owners and admins can add existing MAMV users, change permitted roles, and remove members. The API prevents removal or demotion of the final owner.
- **Manage API keys:** owners and admins can create scoped, optional-expiration keys, copy the plaintext material once, and revoke keys. The dashboard only ever receives the plaintext key in the create response.
- **Manage branding:** owners and admins can edit the organization name, display name, logo URL, receipt prefix, and enabled branding features in **Settings**. The API accepts only its explicit mutable settings allowlist.

Set `VITE_AUTH_TOKEN` to an authenticated organization session token when running the dashboard locally. The dashboard passes this token as a bearer credential and renders organization-scoped receipts, activity, API keys, and membership data.
