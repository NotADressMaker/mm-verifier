# MAMV: Trust receipts for AI answers

MAMV separates literal statements from clearly implied statements, recognizes quotations, hypotheticals, and hedges, and checks reference consistency before treating repeated names as the same fact. See [Statement handling and reference consistency](docs/PRAGMATICS_LAYER.md).

## Every AI answer comes with a trust receipt.

Before an AI answer goes to your boss, into a report, or out to the public, you need to know what supports it—and be able to show that you checked it. MAMV gives every reviewed AI answer a portable trust receipt: a clear record of what was checked, what the review found, and how someone else can inspect it.

MAMV does **AI verification**, not truth magic. Optional **onchain anchoring** can make a receipt tamper-evident for higher-stakes accountability, but blockchain anchoring does not prove an AI answer is correct.

## Allusion verification

MAMV can optionally identify implicit cultural, historical, literary, religious, mythological, philosophical, idiomatic, and conceptual references. Detection is probabilistic and source attribution can remain ambiguous. Model agreement is not evidence, and concise reasoning summaries are not hidden chain-of-thought. MAMV records reviewed support and limitations in receipts; it does not establish absolute truth. See [Allusion verification](docs/ALLUSION_VERIFICATION.md).

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

## MAMV Education Verification Mode

`POST /api/v1/education/verify` produces a deterministic, evidence-conditioned education report: atomic claims, claim types, declared verification frame, explicit evidence relations, multidimensional metrics, revision feedback, reflection prompts, and a hash-bound portable receipt. It reports support by reviewed evidence, contradiction, uncertainty, and interpretation dependence instead of claiming absolute truth or issuing grades. The initial local fixtures cover history, science, and civics; see [Education documentation](docs/EDUCATION.md) for its limitations and responsible-use guidance.

## Verification context

Receipts can bind a verdict to a frozen verification program, evidence scope, claims, evidence relations, and limitations. See [Verification Context](docs/VERIFICATION_CONTEXT.md) and the [verdict policy](docs/VERDICTS.md).

### Genericity verification

MAMV can optionally flag bare-plural generic claims, implicit quantifier strength, context sensitivity, and evidence-preserving overgeneralization risks. See [Genericity verification](docs/GENERICITY_VERIFICATION.md).
