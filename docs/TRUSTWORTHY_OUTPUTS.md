# Trustworthy AI Outputs Ledger

## Overview

The Trustworthy Outputs system provides a queryable ledger of verified AI artifacts. Each record represents a finalized verification with cryptographic provenance linking to on-chain evidence.

**Key principle**: Records are derived from existing on-chain events (VerificationMarketplace `Revealed` + `Finalized`), not stored in a new contract. This keeps the protocol minimal and leverages existing infrastructure.

## What is a VerifiedOutputRecord?

A `VerifiedOutputRecord` is a derived artifact that captures:
- **Task identity**: `task_id` linking to the on-chain verification
- **Quality score**: `score_bps` (0-10000 basis points)
- **Verdict**: `verdict` (pass/fail derived from score threshold)
- **Worthiness**: `worthy` flag (score >= 8000 bps by default)
- **Evidence provenance**: `bundle_hash` and `bundle_uri` for full audit trail
- **Chain context**: `chain_id`, `contract_address`, `finalized_at`, `block_number`, `tx_hash`
- **Content hashes**: `input_hash` and `output_hash` when available from MAMVReceipt

## What "Worthy" Means

A record is considered "worthy" when its score meets the quality threshold:

```
WORTHY_MIN_BPS = 8000 (80%)
```

This threshold is configurable via the `WORTHY_MIN_BPS` environment variable.

Records with `worthy: true` represent high-quality verifications suitable for:
- Public attestation
- Reward eligibility
- Trust-critical applications

## API Endpoints

### Get Record for Task

```
GET /api/mamv/tasks/{taskId}/record
```

Returns the VerifiedOutputRecord for a finalized task.

**Response:**
```json
{
  "record": {
    "record_version": "1",
    "task_id": "123",
    "score_bps": 8500,
    "verdict": true,
    "worthy": true,
    "bundle_hash": "0x...",
    "bundle_uri": "ipfs://Qm...",
    "finalized_at": 1705320000,
    "chain_id": 421614,
    "contract_address": "0x...",
    "input_hash": "0x...",
    "output_hash": "0x...",
    "evaluator": "0x...",
    "block_number": 12345678,
    "tx_hash": "0x..."
  }
}
```

**404** if task is not finalized or doesn't exist.

### List Records

```
GET /api/mamv/records?worthy_only=true&limit=50&offset=0
```

Returns paginated list of verified records.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `min_score_bps` | int | - | Minimum score (0-10000) |
| `worthy_only` | bool | `true` | Only return worthy records |
| `verdict` | bool | - | Filter by pass/fail |
| `limit` | int | 50 | Max records (1-100) |
| `offset` | int | 0 | Pagination offset |

**Response:**
```json
{
  "records": [...],
  "total": 150,
  "has_more": true,
  "filter": {
    "min_score_bps": 8000,
    "worthy_only": true,
    "limit": 50,
    "offset": 0
  }
}
```

### Verify On-Chain

```
GET /api/mamv/tasks/{taskId}/verify
```

Confirms that a Finalized event exists on-chain for the task.

**Response:**
```json
{
  "task_id": "123",
  "verified": true,
  "block_number": 12345678,
  "tx_hash": "0x..."
}
```

## SDK Usage

### JavaScript/TypeScript

```typescript
import { MAMVClient } from '@mamv/sdk-js';

const client = new MAMVClient({
  baseUrl: 'https://api.mamv.example.com',
  apiKey: 'your-api-key',
});

// Get record for a task
const record = await client.getRecord('123');
if (record) {
  console.log(`Task ${record.task_id}: ${record.score_bps/100}%`);
  console.log(`Worthy: ${record.worthy}`);
  console.log(`Evidence: ${record.bundle_uri}`);
}

// List worthy records
const { records, total, has_more } = await client.listRecords({
  worthy_only: true,
  limit: 20,
});

console.log(`Found ${total} worthy records`);
for (const r of records) {
  console.log(`- ${r.task_id}: ${r.score_bps} bps`);
}

// Verify on-chain existence
const verification = await client.verifyRecordOnChain('123');
if (verification.verified) {
  console.log(`Confirmed in block ${verification.block_number}`);
}
```

## How Records are Derived

Records are built from on-chain events, not stored separately:

```
VerificationMarketplace Events:
├── Revealed(taskId, evaluator, scoreBps, bundleHash, bundleURI)
└── Finalized(taskId, finalScoreBps, feePool)
         │
         ▼
VerifiedOutputRecord (derived at query time)
├── task_id, score_bps, verdict, worthy
├── bundle_hash, bundle_uri (from Revealed)
├── finalized_at, block_number, tx_hash (from Finalized)
└── input_hash, output_hash (from MAMVReceipt if available)
```

### Event Log Structure

The existing contract events provide all needed data:

```solidity
// VerificationMarketplace.sol
event Revealed(
  uint256 indexed taskId,
  address indexed evaluator,
  uint16 scoreBps,
  bytes32 bundleHash,
  string bundleURI
);

event Finalized(
  uint256 indexed taskId,
  uint16 finalScoreBps,
  uint256 feePool
);
```

## Verifying Records On-Chain

To independently verify a record:

1. **Fetch the Finalized event** for the task ID
2. **Check the block timestamp** matches `finalized_at`
3. **Fetch the Revealed events** to get `bundle_hash` and `bundle_uri`
4. **Download the evidence bundle** from the URI
5. **Verify the bundle hash** matches `keccak256(bundle_content)`

Using ethers.js:

```typescript
import { ethers } from 'ethers';

async function verifyRecord(
  record: VerifiedOutputRecord,
  rpcUrl: string
): Promise<boolean> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  const contract = new ethers.Contract(
    record.contract_address,
    ['event Finalized(uint256 indexed taskId, uint16 finalScoreBps, uint256 feePool)'],
    provider
  );

  // Query Finalized events for this task
  const filter = contract.filters.Finalized(record.task_id);
  const events = await contract.queryFilter(filter);

  if (events.length === 0) {
    return false; // Not finalized on-chain
  }

  const event = events[0];
  const block = await provider.getBlock(event.blockNumber);

  // Verify timestamp (allowing for small drift)
  const timeDiff = Math.abs(block.timestamp - record.finalized_at);
  if (timeDiff > 60) {
    console.warn('Timestamp mismatch');
  }

  return true;
}
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WORTHY_MIN_BPS` | 8000 | Minimum score for "worthy" status |
| `MARKETPLACE_ADDRESS` | - | VerificationMarketplace contract address |
| `RPC_URL` | - | Ethereum RPC endpoint |

### Threshold Constants

```typescript
import { SCORE_THRESHOLDS, WORTHY_MIN_BPS } from 'shared/verifiedOutput';

// WORTHY_MIN_BPS = 8000 (configurable)
// SCORE_THRESHOLDS.PASS = 5000 (CONSTANTS.MIXED_THRESHOLD)
// SCORE_THRESHOLDS.RELIABLE = 8000 (CONSTANTS.RELIABLE_THRESHOLD)
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Blockchain (Arbitrum)                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              VerificationMarketplace                 │    │
│  │  - TaskCreated, Committed, Revealed, Finalized      │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ Event logs
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      API Server                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              recordsService.ts                       │    │
│  │  - Fetches Revealed + Finalized events              │    │
│  │  - Builds VerifiedOutputRecord from events          │    │
│  │  - In-memory cache for efficiency                   │    │
│  └─────────────────────────────────────────────────────┘    │
│                              │                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              mamv.ts routes                           │    │
│  │  - GET /api/mamv/tasks/:taskId/record                │    │
│  │  - GET /api/mamv/records                             │    │
│  │  - GET /api/mamv/tasks/:taskId/verify                │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP/JSON
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      SDK (sdk-js)                            │
│  - getRecord(taskId)                                        │
│  - listRecords({ worthy_only, limit, offset })              │
│  - verifyRecordOnChain(taskId)                              │
└─────────────────────────────────────────────────────────────┘
```

## Use Cases

### 1. Public AI Output Registry

Query all worthy AI outputs for transparency:

```typescript
const { records } = await client.listRecords({
  worthy_only: true,
  limit: 100,
});

// Display verified AI outputs publicly
for (const record of records) {
  displayVerifiedOutput({
    taskId: record.task_id,
    quality: `${record.score_bps / 100}%`,
    evidence: record.bundle_uri,
    verified: new Date(record.finalized_at * 1000),
  });
}
```

### 2. Downstream Application Trust

Verify an AI output before using it:

```typescript
async function checkAIOutput(taskId: string): Promise<boolean> {
  const record = await client.getRecord(taskId);

  if (!record) {
    return false; // Not verified
  }

  if (!record.worthy) {
    return false; // Below quality threshold
  }

  // Optionally verify on-chain
  const onChain = await client.verifyRecordOnChain(taskId);
  return onChain.verified;
}
```

### 3. Analytics and Reporting

Aggregate verification statistics:

```typescript
let offset = 0;
let totalWorthy = 0;
let totalScore = 0;

while (true) {
  const { records, has_more } = await client.listRecords({
    worthy_only: true,
    limit: 100,
    offset,
  });

  totalWorthy += records.length;
  totalScore += records.reduce((sum, r) => sum + r.score_bps, 0);

  if (!has_more) break;
  offset += 100;
}

console.log(`Total worthy outputs: ${totalWorthy}`);
console.log(`Average score: ${totalScore / totalWorthy / 100}%`);
```

## Security Considerations

1. **Immutability**: Records derive from on-chain events which are immutable
2. **Verification**: Bundle hashes enable independent content verification
3. **Transparency**: All data is publicly queryable from blockchain events
4. **No New Trust**: Uses existing VerificationMarketplace - no new contracts

## Related Documentation

- [API Reference](./api.md) - Full API documentation
- [MAMV Integration](./mamv-integration.md) - MAMV system overview
- [Economic Security](./economic-security.md) - Staking and incentives
- [BLS System](./BLS_SYSTEM.md) - Branch Legitimacy Scoring
