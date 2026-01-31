# MMV Architecture

## Overview

MMV is a decentralized marketplace for verifying AI model outputs with economic accountability. The system consists of smart contracts, an API layer, and verifier nodes that work together to provide reliable AI verification.

## System Components

### 1. Smart Contracts (Solidity on Arbitrum)

#### VerificationMarketplace.sol
**Purpose**: Core marketplace logic for verification jobs

**Key Features**:
- Job submission with prompt hashes and reward pools
- Commit-reveal mechanism to prevent evaluation copying
- Consensus calculation using median scoring
- Reward distribution to honest verifiers

**Workflow**:
1. Requester submits job with ETH reward
2. Commit phase: Verifiers submit commitment hashes
3. Reveal phase: Verifiers reveal evaluations
4. Finalization: Consensus computed, rewards distributed

#### StakingManager.sol
**Purpose**: Manage verifier/auditor stakes and slashing

**Key Features**:
- Minimum stake requirements (0.1 ETH verifier, 0.5 ETH auditor)
- Stake locking during active jobs
- 7-day unbonding period for withdrawals
- 50% slashing for provably wrong evaluations

**Security**:
- ReentrancyGuard for ETH transfers
- Locked stake prevents exit during disputes

#### AuditorRegistry.sol
**Purpose**: VRF-based random auditor selection

**Key Features**:
- Chainlink VRF integration for verifiable randomness
- Reputation-weighted auditor selection
- Dynamic reputation system (500/1000 initial)
- Performance tracking (votes, earnings)

**Why VRF?**:
- Prevents bribery (auditors unknown until selected)
- Verifiable on-chain
- Cannot be manipulated

#### DisputeResolver.sol
**Purpose**: Multi-tier dispute resolution

**Tier 0 - Auto-Check**:
- Automated validation of evidence completeness
- Quick resolution for invalid submissions

**Tier 1 - Auditor Review**:
- VRF-selected committee (3 auditors)
- Majority vote determines outcome
- 3-day voting period

**Tier 2+ - Appeals**:
- Larger committee (5+ auditors)
- Escalating stakes (doubles each tier)
- Makes griefing expensive

**Economics**:
- Challenger wins: Gets 60% of slashed stake
- Auditors: Get 40% of slashed stake
- Verifier wins: Gets challenger's stake

### 2. API Layer (TypeScript/Express)

#### Architecture

```
API Server
├── Routes
│   ├── /api/verify     - Submit verification requests
│   ├── /api/jobs       - Query jobs and results
│   └── /api/stats      - Platform statistics
├── Services
│   ├── blockchain      - Smart contract interactions
│   ├── jobQueue        - Bull queue for async processing
│   ├── redis           - Caching and pub/sub
│   └── websocket       - Real-time updates
└── Middleware
    ├── errorHandler    - Global error handling
    └── rateLimit       - DDoS protection
```

#### Request Flow

1. **Job Submission**:
   ```
   Client → POST /api/verify
   → Hash prompt
   → Submit to blockchain
   → Queue for verifier nodes
   → Return jobId
   ```

2. **Result Retrieval**:
   ```
   Client → GET /api/verify/:jobId
   → Check cache (Redis)
   → Query blockchain
   → Aggregate evaluations
   → Return consensus result
   ```

3. **Real-time Updates**:
   ```
   Client → WebSocket connection
   → Subscribe to jobId
   → Receive updates (commit, reveal, complete)
   ```

#### Database Schema

**PostgreSQL** (optional, for API caching):
- `jobs`: Job metadata and cache
- `verifiers`: Verifier performance tracking
- `evaluations`: Historical evaluation data

**Redis**:
- Job results cache (TTL: 1 hour)
- WebSocket session management
- Bull queue job tracking

### 3. Verifier Node (TypeScript Service)

#### Architecture

```
Verifier Node
├── LLM Providers
│   ├── OpenAI          - GPT-4, GPT-3.5
│   ├── Anthropic       - Claude 3
│   ├── Google          - Gemini Pro
│   └── ModelRouter     - Provider dispatch
├── Scoring Pipeline
│   ├── ClaimExtractor  - Extract factual claims
│   ├── ConsistencyChecker - Inter-model agreement
│   ├── CitationAnalyzer - Source verification
│   └── Scorer          - Final score calculation
├── Evidence Bundling
│   ├── EvidenceBundler - Create tamper-evident bundles
│   └── IPFSStorage     - Decentralized storage
└── Blockchain Service
    ├── CommitReveal    - Commit-reveal protocol
    └── Staking         - Stake management
```

#### Verification Flow

1. **Job Detection**:
   - Listen to Redis queue for new jobs
   - Fetch job details from blockchain

2. **Multi-LLM Querying**:
   - Query all specified models in parallel
   - Capture responses + metadata
   - Handle failures gracefully

3. **Scoring**:
   - Extract claims from each response
   - Calculate consistency score
   - Analyze citations (if present)
   - Compute task-specific score
   - Generate verdict (reliable/mixed/unreliable)

4. **Evidence Creation**:
   - Bundle all data (responses, scores, analysis)
   - Generate cryptographic hash
   - Upload to IPFS

5. **Commit**:
   - Generate random salt
   - Create commitment: `hash(jobId, verifier, salt, score, verdict, evidenceHash)`
   - Submit to blockchain

6. **Reveal** (after commit phase):
   - Submit score, verdict, evidenceHash, salt
   - Blockchain verifies commitment
   - Stake unlocked upon successful reveal

#### Scoring Algorithm

```typescript
finalScore =
  consistency * 0.3 +        // Inter-model agreement
  agreement * 0.3 +           // Response similarity
  citationQuality * 0.2 +     // Source quality
  factualAccuracy * 0.2       // Task-specific check
```

**Verdict Thresholds**:
- ≥80: Reliable
- 50-79: Mixed
- <50: Unreliable

**Confidence**:
- Based on score variance (low variance = high confidence)
- Normalized to 0-1 scale

### 4. Evidence Bundle Format (v0.1 canonical)

The canonical evidence bundle contract is defined in `shared/types.ts` (v0.1).

```json
{
  "task_id": "0x...",
  "bundle_version": "0.1",
  "created_at": "2024-10-12T09:43:22Z",
  "evaluator": {
    "node_id": "node:abcd",
    "eth_address": "0x...",
    "software": {
      "name": "verifier-node",
      "ver": "0.1",
      "commit": "abc1234"
    }
  },
  "prompt_hash": "0x...",
  "rubric_hash": "0x...",
  "model_runs": [
    {
      "provider": "openai",
      "model": "gpt-4",
      "temperature": 0.1,
      "max_tokens": 2000,
      "raw_output": "...",
      "output_hash": "0x...",
      "timestamp": 1728726202,
      "latency_ms": 1234,
      "tokens_used": 150
    }
  ],
  "claims": [
    {
      "claim_id": "c1",
      "text": "Paris is the capital of France.",
      "type": "factual",
      "support": [],
      "contradictions": [],
      "confidence": 0.93
    }
  ],
  "metrics": {
    "consensus": {
      "agreement": 0.92,
      "clusters": 1,
      "cluster_sizes": [3],
      "outliers": 0
    },
    "factuality": {
      "supported_claim_ratio": 0.94,
      "total_claims": 12,
      "verified_claims": 11,
      "contradicted_claims": 1
    },
    "citation_quality": {
      "authority_score": 0.98,
      "source_count": 5,
      "high_authority_ratio": 0.6,
      "citation_density": 0.4
    },
    "bias": {
      "sensitive_variance": 0.0
    },
    "stability": {
      "reask_delta": 0.94
    }
  },
  "final_score_bps": 9500,
  "explanation": "Verified across 3 models. High consistency...",
  "signatures": {
    "bundle_sig_eip712": "0x..."
  }
}
```

## Data Flow

### End-to-End Flow

```
1. User submits prompt
   ↓
2. API hashes prompt, submits to blockchain
   ↓
3. Smart contract emits JobSubmitted event
   ↓
4. API queues job in Redis
   ↓
5. Verifier nodes pick up job
   ↓
6. Nodes query multiple LLMs
   ↓
7. Nodes score responses
   ↓
8. Nodes create evidence bundles
   ↓
9. Nodes upload to IPFS
   ↓
10. Nodes commit evaluations (hashed)
    ↓
11. After commit phase, nodes reveal
    ↓
12. Smart contract calculates consensus
    ↓
13. Rewards distributed to honest verifiers
    ↓
14. User retrieves final result via API
```

## Security Considerations

### Smart Contract Security

**Reentrancy Protection**:
- All ETH transfers use ReentrancyGuard
- Checks-Effects-Interactions pattern

**Access Control**:
- Ownable pattern for admin functions
- Marketplace owns StakingManager
- DisputeResolver owns AuditorRegistry

**Economic Security**:
- Stake slashing deters malicious behavior
- Dispute ladder makes attacks expensive
- VRF prevents auditor manipulation

### API Security

**Rate Limiting**:
- 100 requests per 15 minutes per IP
- Prevents DDoS attacks

**Input Validation**:
- express-validator for all inputs
- Sanitize prompt content
- Validate model names

**Authentication** (optional):
- JWT tokens for authenticated requests
- API keys for developers

### Verifier Node Security

**Private Key Management**:
- Environment variables (never committed)
- Consider hardware wallets for production

**LLM API Key Protection**:
- Separate keys per node
- Rotate regularly
- Monitor usage

## Scalability

### Horizontal Scaling

**Verifier Nodes**:
- Stateless design allows unlimited nodes
- Queue-based job distribution
- Each node operates independently

**API Servers**:
- Load balancer in front
- Shared Redis for session state
- Read replicas for PostgreSQL

### Performance Optimizations

**Caching**:
- Redis for job results (1 hour TTL)
- IPFS for evidence (permanent)

**Async Processing**:
- Bull queue for background jobs
- WebSocket for real-time updates

**Batch Operations**:
- Parallel LLM queries
- Concurrent evidence uploads

## Deployment

### Development

```bash
docker-compose up -d
npm run deploy:sepolia
npm run dev:api
npm run dev:verifier
```

### Production

**Infrastructure**:
- Kubernetes for orchestration
- Arbitrum One for mainnet
- IPFS cluster for redundancy

**Monitoring**:
- Prometheus metrics
- Grafana dashboards
- Sentry error tracking

## Future Enhancements

### Privacy Mode

**TEE Attestation**:
- Run verifiers in SGX enclaves
- Prove computation without revealing data

**ZK Proofs**:
- Zero-knowledge proof of correct scoring
- Reveal score without revealing responses

### Advanced Features

**Governance Token**:
- Decentralized parameter tuning
- Verifier elections

**Reputation System**:
- Historical accuracy tracking
- Stake multipliers for top verifiers

**Multi-Chain Support**:
- Deploy to Optimism, Base, zkSync
- Cross-chain verification requests

## Conclusion

MMV combines blockchain economics, multi-model consensus, and cryptographic proofs to create a trustworthy AI verification marketplace. The modular architecture allows for easy extension and customization while maintaining security and decentralization.
