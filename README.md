# LLM Verifier

**AI Reliability Through Economic Accountability**

LLM Verifier is a decentralized marketplace for verifying AI model outputs with economic guarantees. Instead of trusting a single AI model, get consensus-based verification with stake-backed accountability.

## What It Does

When you ask an AI a question, the answer can sound confident and still be wrong. LLM Verifier gives you a structured second opinion:

- **Multi-LLM Cross-Check**: Runs prompts across multiple LLMs (OpenAI, Anthropic, Google, open-source models)
- **Consensus Scoring**: Compares responses for agreement and contradictions
- **Source Verification**: Checks claims against sources and flags uncertainty
- **Trust Score**: Produces actionable confidence scores with detailed explanations

**The unique twist**: Instead of "here's an answer," you get:
> "Here's the answer… and here's how confident we should be."

## Architecture

```
llm-verifier/
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

LLM Verifier operates as an **open verification marketplace** where independent verifiers compete:

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

## Verification Bundle

Verifiers submit structured evidence including:

- **Claim Extraction**: Atomic factual claims from the answer
- **Checks Performed**: Cross-model consistency, retrieval results
- **Sources**: Citations, URLs, quoted snippets
- **Reasoning**: Why the score was assigned
- **Commitments**: Tamper-evident hashes

Heavy data lives offchain (IPFS/Arweave); chain stores hashes + metadata.

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

## Quick Start

### Prerequisites

- Node.js 18+
- Foundry or Hardhat
- Arbitrum Sepolia testnet ETH
- API keys for LLM providers (OpenAI, Anthropic, Google)

### Installation

```bash
# Clone the repository
git clone https://github.com/michaelmannen3-oss/LLM-Verifier.git
cd LLM-Verifier

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
  "estimatedCompletion": "2026-01-10T12:00:00Z"
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
    "confidence": 0.98,
    "modelResponses": {
      "gpt-4": "Paris",
      "claude-3-opus": "Paris",
      "gemini-pro": "Paris"
    },
    "consensus": true,
    "evidenceHash": "ipfs://Qm...",
    "verifiers": ["0xabc...", "0xdef..."],
    "auditTrail": "0x789..."
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

- [x] Architecture design
- [x] Smart contract implementation
- [x] Multi-LLM integration
- [x] API layer
- [x] Verifier node
- [ ] Frontend dashboard
- [ ] TEE attestation support
- [ ] ZK proof integration
- [ ] Mainnet deployment
- [ ] Governance token

## Testing

```bash
# Run contract tests
cd contracts
npx hardhat test

# Run API tests
cd api
npm test

# Run verifier node tests
cd verifier-node
npm test
```

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](./LICENSE)

## Support

- Documentation: [docs/](./docs/)
- Issues: [GitHub Issues](https://github.com/michaelmannen3-oss/LLM-Verifier/issues)
- Discord: [Join our community](#)

## Acknowledgments

- Chainlink VRF for verifiable randomness
- Arbitrum for L2 infrastructure
- OpenAI, Anthropic, Google for LLM APIs

---

**Built with ❤️ for AI reliability and accountability**
