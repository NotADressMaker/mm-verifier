# MMV

**The Ethereum for AI Outputs**

MMV is an open-source blockchain platform for AI output verification—a global, programmable **world computer** for trust in model responses. Instead of trusting a single AI model, get consensus-based verification with stake-backed accountability.

## What It Does

When you ask an AI a question, the answer can sound confident and still be wrong. MMV gives you a structured second opinion, delivered by a shared, decentralized verification layer that any app can program against:

- **Multi-LLM Cross-Check**: Runs prompts across multiple LLMs (OpenAI, Anthropic, Google, open-source models)
- **Consensus Scoring**: Compares responses for agreement and contradictions
- **Source Verification**: Checks claims against sources and flags uncertainty
- **Trust Score**: Produces actionable confidence scores with detailed explanations

**The unique twist**: Instead of "here's an answer," you get:
> "Here's the answer… and here's how confident we should be."

**Think of it as**: Ethereum-style infrastructure for AI outputs—an open network where verifiers, auditors, and applications coordinate to produce reliable, programmable trust.

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

```
MMV/
├── contracts/          # Solidity smart contracts (Arbitrum)
│   ├── VerificationMarketplace.sol
│   ├── StakingManager.sol
│   ├── DisputeResolver.sol
│   └── AuditorRegistry.sol
├── api/               # REST API & WebSocket server
│   ├── src/
│   │   ├── routes/
│   │   ├── services/
│   │   └── server.ts
├── verifier-node/     # Verification service
│   ├── src/
│   │   ├── llm-providers/
│   │   ├── scoring/
│   │   └── evidence/
├── shared/            # Shared types and utilities
└── docs/              # Documentation
```

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

## Frontend Experience (MVP Dashboard)

The primary entry points should feel cohesive, trustworthy, and understandable to non-experts. For the upcoming dashboard, prioritize:

### Core Screens

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

### Installation

```bash
# Clone the repository
git clone https://github.com/michaelmannen3-oss/MMV.git
cd MMV

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys and RPC URLs

# Compile contracts
cd contracts
npm install
npx hardhat compile

# Deploy to Arbitrum Sepolia
npx hardhat run scripts/deploy.ts --network arbitrum-sepolia

# Start API server
cd ../api
npm install
npm run dev

# Start verifier node
cd ../verifier-node
npm install
npm run start
```

## Configuration

### Environment Variables

```bash
# Blockchain
ARBITRUM_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
PRIVATE_KEY=your_deployer_private_key
CHAINLINK_VRF_COORDINATOR=0x... # Arbitrum Sepolia VRF Coordinator

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
    "models": ["gpt-4", "claude-3-opus", "gemini-pro"],
    "taskType": "factual-qa",
    "deadline": 3600
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
- [ ] Frontend dashboard MVP (job status, evidence view, dispute status)
- [ ] Evidence bundle schema v1 (formal JSON schema + validation)

### Mid Term (3-6 months)
- [ ] TEE attestation MVP (attested verifier runtime + proof attachment)
- [ ] ZK proof prototype (score verification for simple claim types)
- [ ] Auditor tooling (CLI for evidence fetch + dispute workflow)

### Long Term (6+ months)
- [ ] Mainnet deployment (Arbitrum One)
- [ ] Governance token

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
