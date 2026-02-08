# MMV

** Accountability for AI Outputs**

MMV is an open-source blockchain platform for AI output verification—a global, programmable **world computer** for trust in model responses. Instead of trusting a single AI model, get consensus-based verification with stake-backed accountability.

[Getting Started](docs/getting-started.md)

## What It Does

When you ask an AI a question, the answer can sound confident and still be wrong. MMV gives you a structured second opinion, delivered by a shared, decentralized verification layer that any app can program against:

- **Multi-LLM Cross-Check**: Runs prompts across multiple LLMs (OpenAI, Anthropic, Google, open-source models)
- **Consensus Scoring**: Compares responses for agreement and contradictions
- **Source Verification**: Checks claims against sources and flags uncertainty
- **Trust Score**: Produces actionable confidence scores with detailed explanations

**The unique twist**: Instead of "here's an answer," you get:
> "Here's the answer… and here's how confident we should be."

**Think of it as**: Ethereum-style infrastructure for AI outputs—an open network where verifiers, auditors, and applications coordinate to produce reliable, programmable trust.

## Developer Quickstart (10 minutes)

Get verification working in your app with the SDK and example.

### One-Command Dev Boot (Recommended)

Boot the full local stack (API, verifier node, dashboard, Redis) with:

```bash
make dev
```

By default, `make dev` runs the stack in **mock mode** (no keys required). See **Mock Mode** below
for environment flags and scenarios.

### 1. Install the SDK

```bash
npm install @mmv/sdk
```

### 2. Verify LLM Output (3 lines)

```typescript
import { verify, configure } from '@mmv/sdk';

// Configure once at startup
configure({ baseUrl: 'http://localhost:3000' });

// Verify any LLM output
const receipt = await verify('Paris is the capital of France');

console.log(receipt.verdict ? 'Verified' : 'Unverified');
console.log(`Score: ${receipt.score_bps / 100}%`);
```

### 3. Run the Example App

Try the Express example app with a verification badge UI:

```bash
# Navigate to the example
cd examples/express-quickstart

# Install dependencies
npm install

# Run (mock mode - no backend required)
npm start

# Open http://localhost:3001 in your browser
```

The example demonstrates:
- Sending a prompt to an LLM
- Calling `verify(...)` on the output
- Displaying a "Verified" badge with receipt details

### 4. Verify Receipts

Check that a receipt is valid:

```typescript
import { verifyReceiptOnchain } from '@mmv/sdk';

const result = verifyReceiptOnchain(receipt);

if (result.valid) {
  console.log('Receipt verified');
} else {
  console.error('Verification failed:', result.errors);
}
```

### Receipt Structure

Every verification produces a compact `Receipt`:

| Field | Description |
|-------|-------------|
| `task_id` | Unique task identifier |
| `verdict` | Pass/fail (true if score >= 5000 bps) |
| `score_bps` | Confidence score (0-10000 basis points) |
| `bundle_hash` | keccak256 hash of evidence bundle |
| `bundle_uri` | IPFS URI for evidence bundle |
| `program_id` | Verification program used |
| `program_version` | Program version (semver) |
| `chain_id` | Blockchain chain ID |
| `contract_address` | Verification contract address |

See [docs/PROGRAMS.md](docs/PROGRAMS.md) for details on the built-in `factual-consensus` program.

## Mock Mode (No Keys Required)

Set these flags in your `.env` (or inline) to enable deterministic mock receipts:

```bash
MOCK_VERIFIER=true
MOCK_CHAIN=true
MOCK_SCENARIO=happy   # happy | fail | dispute
MOCK_VERIFIER_DELAY_MS=150
```

Mock mode still validates schemas, computes bundle hashes, and stores receipts/bundles in Redis.

## Dashboard MVP

The dashboard lives in `apps/dashboard` and provides:
- Job list
- Receipt viewer (pretty JSON + key fields)
- Evidence bundle viewer (citations, contradictions, model outputs)
- Dispute timeline (stub events in mock mode)

Start it with:

```bash
cd apps/dashboard
npm install
npm run dev
```

Or run it as part of the stack with `make dev`.

## Run the Hello Receipt E2E Test

```bash
npm run test:e2e
```

The test starts the API + verifier node in mock mode, posts a job, waits for completion,
validates receipt and bundle schemas, and checks status transitions.

### Troubleshooting

- **Ports**: API `3000`, Dashboard `5173`, Redis `6379`.
- **Reset Redis**: `docker-compose down -v` (clears mock receipts and jobs).
- **Mock scenarios**: set `MOCK_SCENARIO=dispute` to see dispute timeline events.

## AI Accountability: Beyond Ethereum

Ethereum provides general-purpose transaction transparency. MMV extends this with AI-specific accountability primitives that address the "black box" problem in AI systems:

| Capability | Ethereum | MMV |
|------------|----------|-----|
| Transaction immutability | ✅ | ✅ (inherits) |
| **Input/output provenance** | ❌ | ✅ Cryptographic hashes of AI inputs and outputs |
| **Model run metadata** | ❌ | ✅ Provider, model, timing, tokens for each LLM call |
| **Model version commitments** | ❌ | ✅ Detects silent model updates via commitment hashes |
| **Reasoning trace commitments** | ❌ | ✅ Hash-based audit trail of reasoning steps |
| **Multi-model consensus** | ❌ | ✅ Cross-checks outputs across multiple LLMs |
| **Scoring transparency** | ❌ | ✅ Breakdown of how scores were computed |
| **Evidence bundle audit** | ❌ | ✅ Complete verification trail stored off-chain |

### What This Enables

- **Prove what was verified**: Cryptographic commitments to exact inputs and outputs
- **Detect model changes**: Model commitment hashes reveal when providers update models
- **Audit reasoning**: Hash-based traces prove reasoning occurred without exposing sensitive content
- **Independent verification**: Anyone can verify receipt hashes against on-chain events

### What Remains Opaque

MMV provides transparency for the verification *process* but cannot reveal:
- Neural network internals (weights, attention patterns)
- Why a model produced a specific answer at the neural level
- Whether LLM providers are honest (trust assumption)

For a complete analysis, see [docs/BLACK_BOX_TRANSPARENCY.md](docs/BLACK_BOX_TRANSPARENCY.md).

## What's Implemented Today

- **Multi-LLM Cross-Check**: Routes prompts to OpenAI, Anthropic, and Google model providers.
- **Verification Job Processor**: Scores responses and assembles evidence bundles.
- **IPFS Evidence Uploads**: Stores evidence bundle URIs offchain.
- **Smart Contract Marketplace**: Commit/reveal workflow with evidence hashes and URIs.
- **Verifier Lifecycle + Disputes**: ETH staking, slashing, and bonded receipt challenges (see `docs/VERIFIER_LIFECYCLE.md`).
- **API Endpoints**: `/api/verify` and `/api/programs` for job submission and program registration.

## Security & Threat Model

- [Threat Model](docs/security/threat-model.md)
- [Security Status Matrix](docs/security/security-status.md)
- [Dispute Workflow](docs/disputes.md)

### Security Assumptions

- **Chain finality:** Dispute windows assume Arbitrum finality with standard reorg depth.
- **VRF / oracle assumptions:** Chainlink VRF randomness is trusted when enabled.
- **Storage assumptions:** IPFS/Arweave/DB storage is integrity-checked via hashes but can be unavailable.
- **Key management:** Verifiers and auditors must secure private keys and rotate if compromised.

## Programmable Verification Programs

MMV exposes **verification programs**: reusable, versioned workflows that define how AI outputs should be checked (retrieve sources, cross-check models, score, and assemble evidence). These programs make the network behave like a programmable "world computer" for verification logic.

### Register a Program (API)

```bash
curl -X POST http://localhost:3000/api/programs \
  -H "Content-Type: application/json" \
  -d '{
    "name": "citations-v1",
    "version": "1.0.0",
    "description": "Require sources, cross-check, then score.",
    "steps": [
      { "type": "retrieve", "description": "Collect primary sources" },
      { "type": "cross-check", "description": "Compare against peer models" },
      { "type": "score", "description": "Score for consistency + support" },
      { "type": "evidence", "description": "Package citations + hashes" }
    ]
  }'
```

### Submit a Job with a Program

```bash
curl -X POST http://localhost:3000/api/verify \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Summarize the latest CPI release with citations.",
    "models": ["gpt-4o", "claude-3-5-sonnet"],
    "taskType": "citation-check",
    "programId": "YOUR_PROGRAM_ID"
  }'
```

## Architecture

## Repo Structure (Workspaces)

This monorepo is organized into the following workspaces:

```
MMV/
├── contracts/      # Solidity smart contracts (Arbitrum)
├── api/            # REST API & WebSocket server
├── verifier-node/  # Verification service
├── shared/         # Shared types and utilities
└── docs/           # Documentation
```

## Content Insurance Layer

MMV now includes a content insurance concept that pairs onchain policies with verification
guarantees. Creators can insure either human-authored work or AI-generated work that has been
verified, while claimants can challenge coverage with evidence. See
[`docs/CONTENT_INSURANCE.md`](docs/CONTENT_INSURANCE.md) for contract and verification details.

## How It Works

### The Marketplace Model

MMV operates as an **open verification marketplace** where independent verifiers compete:

1. **Verifiers stake ETH** to participate
2. They submit evaluations with **structured evidence**
3. If disputed, **randomly selected auditors** (via Chainlink VRF) review the work
4. Honest work earns rewards; bad work gets slashed

**Think**: Uber meets fact-checking meets security engineering.

### Normal Flow (No Dispute)

1. **Job Posted**: Requester deposits payment for verification
2. **Verifiers Commit**: Multiple verifiers lock bonds and commit evaluation hashes (commit-reveal prevents copying)
3. **Reveal Phase**: Verifiers reveal:
   - Scores (0-100)
   - Verdict labels (reliable/mixed/unreliable)
   - Evidence bundle hashes (citations, checks performed)
4. **Aggregation**: Protocol computes consensus result
5. **Payouts**: Requester gets verdict, honest verifiers get paid

### Dispute Ladder (Escalation)

If someone challenges a result:

- **Tier 0**: Auto-check for missing/malformed evidence → quick resolution
- **Tier 1**: VRF-selected auditor committee reviews and votes
- **Tier 2+**: Appeals with increasing stakes and committee size

Each escalation costs more, making griefing expensive.

### Auditor Committee Operations (Overview)

Auditor committees should follow a repeatable process to keep dispute resolution consistent and auditable:

1. **Selection & Assignment**: VRF selects auditors; assignments include job metadata and evidence bundle hash.
2. **Evidence Retrieval**: Auditors pull the evidence bundle from IPFS/Arweave using the hash.
3. **Claim Review**: Each claim is re-checked against cited sources and cross-model consistency results.
4. **Vote & Justification**: Auditors submit a signed verdict plus a brief rationale for any disagreements.
5. **Onchain Finalization**: Results are tallied; slashing/rewards applied per protocol rules.

#### Local Audit Checklist

```bash
# 1) Fetch evidence bundle
ipfs cat <evidenceHash> > evidence.json

# 2) Review claims and sources
jq '.claims[] | {id, text, label, confidence, checks}' evidence.json
jq '.sources[] | {id, url, title}' evidence.json

# 3) Verify claim coverage
jq '.claims | length' evidence.json
```

## Verification Bundle

Verifiers submit structured evidence including:

- **Claim Extraction**: Atomic factual claims from the answer
- **Checks Performed**: Cross-model consistency, retrieval results
- **Sources**: Citations, URLs, quoted snippets
- **Reasoning**: Why the score was assigned
- **Commitments**: Tamper-evident hashes

Heavy data lives offchain (IPFS/Arweave); chain stores hashes + metadata.

### Evidence Bundle Schema (Example)

```json
{
  "jobId": "0x1234...",
  "verifier": "0x8ba1f109551bD432803012645Ac136ddd64DBA72",
  "model": "gpt-4o",
  "score": 88,
  "verdict": "mostly-reliable",
  "claims": [
    {
      "id": "claim-1",
      "text": "Paris is the capital of France.",
      "label": "supported",
      "confidence": 0.93,
      "checks": [
        {
          "type": "source",
          "sourceId": "src-1",
          "snippet": "Paris is the capital and most populous city of France.",
          "result": "pass"
        },
        {
          "type": "cross-model",
          "models": ["gpt-4o", "claude-3-5-sonnet", "gemini-1.5-pro"],
          "result": "consistent"
        }
      ]
    }
  ],
  "sources": [
    {
      "id": "src-1",
      "url": "https://en.wikipedia.org/wiki/Paris",
      "title": "Paris - Wikipedia",
      "retrievedAt": "2024-10-12T09:43:22Z"
    }
  ],
  "notes": "No contradictions detected; minor phrasing differences across models.",
  "evidenceHash": "ipfs://bafybeih4q5k7x3k5c5yy5o4y2qz3z3m3fjqdxq5lzn7y6m2b2x6a3ye3ai"
}
```

## Target Chain

**Arbitrum One** (mainnet) + **Arbitrum Sepolia** (testnet)

Why Arbitrum:
- ETH-native bonding with L2 fees
- Chainlink VRF for auditor selection
- Cheap dispute ladder transactions
- Production-ready infrastructure

## Who It's For

- **Developers**: API to auto-check model outputs in products (support bots, assistants)
- **Enterprises**: Compliance, hallucination monitoring, audit trails
- **Researchers**: Benchmarking and model drift tracking
- **End Users**: Simple "is this answer real?" verification

## Dashboard MVP (Now Included)

A lightweight dashboard is included under `apps/dashboard` with job list, receipt view,
evidence viewer, and dispute timeline (mock-mode friendly).

When the dashboard work begins, the intended experience includes:

### Core Screens (Included)

- **Job Timeline**: Visual progression from submission → verification → dispute resolution.
- **Confidence Breakdown**: Clear display of consensus score, variance across models, and any contradictions.
- **Evidence Drill-Down**: Clickable citations and claim-level checks with provenance.
- **Dispute Status**: Clear badges for challenge tiers and auditor outcomes.
- **Verifier Trust Signals**: At-a-glance stakes, slashing history, and audit success rate.

### UX Principles

- **Clarity over cleverness**: Avoid jargon where possible; explain “verdict,” “confidence,” and “dispute” in plain language.
- **Progressive disclosure**: Show the headline verdict first, then expand into evidence and audit trails.
- **Actionability**: Provide “what this means” guidance (e.g., “safe to use,” “needs review,” “high risk”).
- **Audit-readiness**: Every result should link to the evidence bundle hash and verification metadata.

## Quick Start

### Prerequisites

- Node.js 18+
- Foundry or Hardhat
- Arbitrum Sepolia testnet ETH
- API keys for LLM providers (OpenAI, Anthropic, Google)
- Redis (for the verification job queue)

### Installation

```bash
# Clone the repository
git clone https://github.com/michaelmannen3-oss/MMV.git
cd MMV

# Install dependencies (root + workspaces)
npm install
cd contracts && npm install
cd ../api && npm install
cd ../verifier-node && npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys, RPC URLs, and Redis connection

# Compile contracts
cd ../contracts
npx hardhat compile

# Deploy to Arbitrum Sepolia (requires funded deployer key)
npx hardhat run scripts/deploy.ts --network arbitrum-sepolia

# Start API server
cd ../api
npm run dev

# Start verifier node (in another terminal)
cd ../verifier-node
npm run start
```

## Configuration

### Environment Variables

```bash
# Blockchain
ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
ARBITRUM_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc # optional legacy alias
PRIVATE_KEY=your_deployer_private_key
CHAINLINK_VRF_COORDINATOR=0x... # Arbitrum Sepolia VRF Coordinator
MMV_CHAIN_ID=421614 # Chain ID used for EIP-712 signing

# LLM Providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...

# API
API_PORT=3000
DATABASE_URL=postgresql://...

# Verifier Node
VERIFIER_PRIVATE_KEY=your_verifier_wallet_private_key
STAKE_AMOUNT=1000000000000000000 # 1 ETH in wei
```

## API Usage

### LLM Client Guide

For LLM tool/function integration, copy/paste-ready schemas and prompt templates are in
[`docs/LLM_CLIENT_GUIDE.md`](docs/LLM_CLIENT_GUIDE.md).

### Submit Verification Request

```bash
curl -X POST http://localhost:3000/api/verify \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What is the capital of France?",
    "models": ["gpt-4o", "claude-3-5-sonnet", "gemini-1.5-pro"],
    "taskType": "factual-qa"
  }'
```

Response:
```json
{
  "jobId": "0x123...",
  "status": "pending",
  "estimatedCompletion": "2024-10-12T10:15:00Z"
}
```

### Get Verification Result

```bash
curl http://localhost:3000/api/verify/0x123...
```

Response:
```json
{
  "jobId": "0x123...",
  "status": "completed",
  "result": {
    "score": 95,
    "verdict": "reliable",
    "confidence": 0.96,
    "modelResponses": {
      "gpt-4o": "Paris",
      "claude-3-5-sonnet": "Paris",
      "gemini-1.5-pro": "Paris"
    },
    "consensus": true,
    "evidenceHash": "ipfs://bafybeih4q5k7x3k5c5yy5o4y2qz3z3m3fjqdxq5lzn7y6m2b2x6a3ye3ai",
    "verifiers": [
      "0x8ba1f109551bD432803012645Ac136ddd64DBA72",
      "0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
    ],
    "auditTrail": "0x3c1b4f6d9f8a2b0c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4"
  }
}
```

## Smart Contract Interface

### Submit Verification Job

```solidity
function submitJob(
    bytes32 promptHash,
    string[] memory models,
    uint256 deadline,
    uint256 rewardPool
) external payable returns (bytes32 jobId)
```

### Commit Evaluation

```solidity
function commitEvaluation(
    bytes32 jobId,
    bytes32 commitment
) external
```

### Reveal Evaluation

```solidity
function revealEvaluation(
    bytes32 jobId,
    uint256 score,
    string memory verdict,
    bytes32 evidenceHash,
    bytes32 salt
) external
```

### Challenge Result

```solidity
function challengeResult(
    bytes32 jobId,
    address verifier,
    string memory reason
) external payable
```

## Tokenomics

- **Verifier Bonds**: Minimum 0.1 ETH to participate
- **Challenge Stake**: Starts at 0.01 ETH, doubles each tier
- **Slashing**: 50% of bond for provably wrong evaluations
- **Rewards**: 80% of job payment split among honest verifiers
- **Auditor Fees**: 10% of slashed bonds

## Security Considerations

- **Commit-Reveal**: Prevents evaluation copying
- **VRF Auditor Selection**: Prevents bribery attacks
- **Dispute Ladder**: Makes griefing expensive
- **TEE Attestation**: Optional trusted execution for sensitive data
- **Evidence Hashing**: Tamper-evident audit trails

## Privacy Mode

For sensitive prompts:
- Encrypted offchain storage
- Onchain commitments only
- ZK proofs for scoring verification (future)

## Development Roadmap

### Near Term (0-3 months)
- [x] Architecture design
- [x] Smart contract implementation
- [x] Multi-LLM integration
- [x] API layer
- [x] Verifier node
- [x] Frontend dashboard MVP (job status, evidence view, dispute status)
- [ ] Evidence bundle schema v1 (formal JSON schema + validation)

### Mid Term (3-6 months)
- [ ] TEE attestation MVP (attested verifier runtime + proof attachment)
- [ ] ZK proof prototype (score verification for simple claim types)
- [ ] Auditor tooling (CLI for evidence fetch + dispute workflow)
- [ ] Validator-as-a-Service (work verification pipeline)
  - [ ] Validator agent accepts validation requests and posts responses
  - [ ] Plugins for deterministic re-execution, test-suite verification, and optional TEE attestation/ZK proof verification

### Long Term (6+ months)
- [ ] Mainnet deployment (Arbitrum One)
- [ ] Governance token
- [ ] “Trust Lens” browser extension for agent/endpoint safety
  - [ ] Show agent identity token, reputation summary, last validation outcomes, and risk flags (new agent, low-signal reviews, sudden score changes)

## Testing

```bash
# Run contract tests
cd contracts
npm test

# Run API tests
cd api
npm test

# Run verifier node tests
cd verifier-node
npm test
```

Quality checks (API + verifier node):

```bash
cd api
npm run lint
npm run format:check
npm run typecheck

cd ../verifier-node
npm run lint
npm run format:check
npm run typecheck
```

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](./LICENSE)

## Support

- Documentation: [docs/](./docs/)
- Issues: [GitHub Issues](https://github.com/michaelmannen3-oss/MMV/issues)
- Discord: [Join our community](#)

## Acknowledgments

- Chainlink VRF for verifiable randomness
- Arbitrum for L2 infrastructure
- OpenAI, Anthropic, Google for LLM APIs

---

**Built with ❤️ for AI reliability and accountability**
