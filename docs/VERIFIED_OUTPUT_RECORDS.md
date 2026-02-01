# Verified Output Records

## Overview

The VerifiedOutputRecord system provides the canonical "blockchain contribution" primitive for the MMV ecosystem. Each record represents a single unit of **trustworthy AI output** that has been verified through the Multi-Model Verification system and can be:

1. **Recorded on-chain** for permanent, queryable provenance
2. **Indexed** by program, task, builder, and other dimensions
3. **Optionally rewarded** through an ETH-based or points-based incentive system

This document describes the record format, on-chain registry, and integration patterns.

---

## VerifiedOutputRecord Type

The canonical record structure (`shared/verifiedOutput.ts`):

```typescript
interface VerifiedOutputRecord {
  // Schema version
  record_version: '1';

  // Core identifiers
  task_id: string;              // uint256-safe string, never JS number
  program_id: string;           // e.g., "mmv-factual-qa"
  program_version: string;      // semver, e.g., "1.0.0"

  // Content hashes (keccak256, 0x-prefixed)
  input_hash: `0x${string}`;    // Hash of input content
  output_hash: `0x${string}`;   // Hash of output content

  // Verification result
  score_bps: number;            // 0-10000 basis points
  verdict: boolean;             // true = passed (score >= 5000)

  // Evidence bundle reference
  bundle_hash: `0x${string}`;   // Canonical hash of bundle (excl. signatures)
  bundle_uri: string;           // IPFS/Arweave URI

  // On-chain context
  chain_id: number;             // e.g., 421614 (Arbitrum Sepolia)
  contract_address: `0x${string}`;  // VerifiedOutputRegistry address
  finalized_at: number;         // Unix timestamp (seconds)

  // Optional metadata
  tags?: string[];              // Domain labels
  source_refs?: string[];       // Source URIs from provenance
  model_run_refs?: `0x${string}`[];  // Model response hashes
}
```

---

## Building Records from Evidence Bundles

Records are built from finalized `EvidenceBundleV02` structures:

```typescript
import { buildVerifiedOutputRecord } from 'shared/verifiedOutput';

const record = buildVerifiedOutputRecord({
  bundle,                       // EvidenceBundleV02
  program_id: 'mmv-factual-qa',
  program_version: '1.0.0',
  bundle_uri: 'ipfs://QmBundle123',
  chain_id: 421614,
  contract_address: '0x...' as `0x${string}`,
  tags: ['finance', 'factual'],  // Optional
});
```

The builder automatically:
- Extracts `input_hash` and `output_hash` from the bundle's v0.2 content hashes
- Computes `bundle_hash` using canonical JSON + keccak256 (excluding signatures)
- Extracts `model_run_refs` from provenance
- Extracts `source_refs` from provenance sources
- Determines `verdict` based on score threshold

---

## On-Chain Registry

### Contract: VerifiedOutputRegistry.sol

The registry stores verified output records on-chain with:
- EIP-712 signature verification from authorized verifiers
- Efficient indexing by task, program, and builder
- Optional ETH-based rewards for builders

**Key Functions:**

```solidity
// Register a single output
function registerOutput(
    bytes32 taskId,
    bytes32 programId,
    bytes32 inputHash,
    bytes32 outputHash,
    uint16 scoreBps,
    bool verdict,
    bytes32 bundleHash,
    string bundleUri,
    bytes signature
) external returns (bytes32 recordId);

// Batch register for gas efficiency
function registerOutputBatch(...) external returns (bytes32[] recordIds);

// Query functions
function getOutput(bytes32 recordId) external view returns (VerifiedOutput);
function getProgramStats(bytes32 programId) external view returns (ProgramStats);
function getBuilderStats(address builder) external view returns (BuilderStats);
function getRecordsByTask(bytes32 taskId) external view returns (bytes32[]);
function getRecordsByProgram(bytes32 programId, uint256 offset, uint256 limit)
    external view returns (bytes32[] recordIds, uint256 total);
```

### Events

```solidity
event OutputRecorded(
    bytes32 indexed recordId,
    bytes32 indexed taskId,
    bytes32 indexed programId,
    address submitter,
    uint16 scoreBps,
    bool verdict,
    bytes32 bundleHash,
    string bundleUri
);

event BuilderRewarded(
    address indexed builder,
    bytes32 indexed recordId,
    uint256 rewardAmount,
    bool qualityBonus
);
```

---

## Verifier-Node Integration

The `verifiedOutputService.ts` provides a high-level API:

```typescript
import {
  initializeVerifiedOutputService,
  processVerifiedOutput,
} from 'verifier-node/src/services/verifiedOutputService';

// Initialize once
await initializeVerifiedOutputService({
  rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
  privateKey: process.env.VERIFIER_PRIVATE_KEY,
  registryAddress: '0x...',
  chainId: 421614,
  enableOnChainSubmission: true,
});

// After verification completes:
const result = await processVerifiedOutput(bundle, {
  programId: 'mmv-factual-qa',
  programVersion: '1.0.0',
  bundleUri: 'ipfs://QmBundle123',
  tags: ['finance'],
  submitOnChain: true,  // Default: true
});

console.log(result.record);      // VerifiedOutputRecord
console.log(result.signature);   // EIP-712 signature
console.log(result.txHash);      // On-chain tx hash
console.log(result.recordId);    // On-chain record ID
console.log(result.reward);      // { amount: '150', qualityBonus: true }
```

---

## Builder Rewards (MVP)

The rewards system is an **opt-in feature** (disabled by default) that incentivizes high-quality verifications.

### Configuration

**Off-chain (TypeScript):**

```typescript
const config: BuilderRewardsConfig = {
  enabled: true,
  rewardType: 'points',           // or 'eth'
  baseRewardPerOutput: '100',     // Points or wei
  qualityBonusMultiplier: 1.5,    // 50% bonus for score >= 8000
  minScoreForRewards: 5000,       // Must pass minimum
  maxDailyRewardsPerBuilder: '10000',
};
```

**On-chain:**

```solidity
// Owner configures rewards
registry.configureRewards(
    true,                         // enabled
    0.0001 ether,                 // base reward
    15000,                        // 1.5x quality multiplier (in bps)
    5000                          // min score (50%)
);

// Fund the reward pool
registry.depositRewardPool{ value: 1 ether }();
```

### Reward Calculation

```typescript
function calculateBuilderReward(record, config) {
  if (!config.enabled || record.score_bps < config.minScoreForRewards) {
    return { reward: '0', qualityBonus: false };
  }

  const isHighQuality = record.score_bps >= 8000; // RELIABLE_THRESHOLD
  const baseReward = BigInt(config.baseRewardPerOutput);

  if (isHighQuality) {
    return {
      reward: (baseReward * 150n / 100n).toString(),
      qualityBonus: true,
    };
  }

  return { reward: baseReward.toString(), qualityBonus: false };
}
```

### Claiming Rewards

```solidity
// Builder claims accumulated rewards
uint256 amount = registry.claimRewards();
```

---

## EIP-712 Signing

Records are signed using EIP-712 typed data:

```typescript
const domain = {
  name: 'VerifiedOutputRegistry',
  version: '1',
  chainId: 421614,
  verifyingContract: '0x...',
};

const types = {
  VerifiedOutput: [
    { name: 'taskId', type: 'bytes32' },
    { name: 'programId', type: 'bytes32' },
    { name: 'inputHash', type: 'bytes32' },
    { name: 'outputHash', type: 'bytes32' },
    { name: 'scoreBps', type: 'uint16' },
    { name: 'verdict', type: 'bool' },
    { name: 'bundleHash', type: 'bytes32' },
    { name: 'finalizedAt', type: 'uint64' },
  ],
};

const message = toEip712Message(record);
const signature = await wallet.signTypedData(domain, types, message);
```

---

## Query and Filtering

### Off-chain Filtering

```typescript
import { matchesFilter, VerifiedOutputQueryFilter } from 'shared/verifiedOutput';

const filter: VerifiedOutputQueryFilter = {
  program_id: 'mmv-factual-qa',
  min_score_bps: 8000,
  verdict: true,
  tag: 'finance',
  finalized_after: 1705000000,
};

const matching = records.filter(r => matchesFilter(r, filter));
```

### On-chain Queries

```solidity
// Get all records for a task
bytes32[] memory taskRecords = registry.getRecordsByTask(taskId);

// Paginate program records
(bytes32[] memory records, uint256 total) =
    registry.getRecordsByProgram(programId, 0, 100);

// Get statistics
ProgramStats memory stats = registry.getProgramStats(programId);
// stats.totalRecords, stats.passedRecords, stats.cumulativeScore

BuilderStats memory bStats = registry.getBuilderStats(builder);
// bStats.totalSubmissions, bStats.qualitySubmissions, bStats.totalRewardsEarned
```

---

## Relationship to EvidenceBundle

```
EvidenceBundleV02 (Full provenance, stored off-chain on IPFS/Arweave)
    │
    ├── input/output content hashes
    ├── provenance.model_runs[]
    ├── provenance.sources[]
    ├── scoring_trace
    └── signatures
         │
         ▼
VerifiedOutputRecord (Compact on-chain record)
    │
    ├── input_hash, output_hash
    ├── bundle_hash, bundle_uri
    ├── score_bps, verdict
    ├── model_run_refs[], source_refs[]
    └── chain context (chain_id, contract_address, finalized_at)
         │
         ▼
VerifiedOutputRegistry.sol (On-chain indexing)
    │
    ├── Permanent record storage
    ├── Task/Program/Builder indexes
    ├── Statistics aggregation
    └── Optional rewards distribution
```

---

## Security Considerations

1. **Signature Verification**: Only authorized verifiers can register records
2. **Replay Prevention**: Records are uniquely identified by (taskId, programId, bundleHash, timestamp, nonce)
3. **Score Validation**: Scores must be in valid range (0-10000 bps)
4. **Bundle Integrity**: bundle_hash is computed from canonical JSON (deterministic)
5. **Reward Pool Management**: Owner can configure rewards but cannot drain builder earnings

---

## Environment Variables

```bash
# Required for on-chain submission
VERIFIER_PRIVATE_KEY=0x...
VERIFIED_OUTPUT_REGISTRY_ADDRESS=0x...
CHAIN_ID=421614
RPC_URL=https://sepolia-rollup.arbitrum.io/rpc

# Optional: Enable rewards locally
BUILDER_REWARDS_ENABLED=true
```

---

## Testing

**TypeScript tests:**
```bash
cd verifier-node && npm test -- verifiedOutput.test.ts
```

**Solidity tests:**
```bash
cd contracts && npx hardhat test test/VerifiedOutputRegistry.test.ts
```

---

## Future Extensions

1. **Cross-chain Registry**: Deploy to multiple chains with LayerZero bridging
2. **Staking Integration**: Tie rewards to verifier stake levels
3. **Program Governance**: On-chain program registration and versioning
4. **Advanced Querying**: Subgraph indexer for complex queries
5. **Token Rewards**: Migrate from ETH to VERIFY token rewards
