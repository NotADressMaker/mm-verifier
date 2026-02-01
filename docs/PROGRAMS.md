# Verification Programs

Programs are versioned verification workflows that define how AI outputs are checked. Each program has a unique fingerprint derived from its definition, ensuring reproducibility.

## Built-in Programs

### factual-consensus-v1

**Program ID:** `factual-consensus-v1`
**Version:** `1.0.0`
**Fingerprint:** `0x7f8c9d0e1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d`

Multi-model consensus verification for factual claims.

#### What It Checks

1. **Multi-Model Agreement**: Queries the same prompt to multiple LLMs (e.g., GPT-4, Claude-3) and compares their responses.

2. **Claim Extraction**: Extracts atomic factual claims from each response for granular comparison.

3. **Consistency Analysis**: Checks whether claims agree, contradict, or differ across models.

4. **Confidence Scoring**: Produces a score in basis points (0-10000) based on:
   - Agreement rate across models (66%+ required)
   - Claim-level confidence from each model
   - Contradiction penalties

#### Scoring Thresholds

| Score (bps) | Verdict | Meaning |
|-------------|---------|---------|
| 8000-10000 | Pass + Worthy | High confidence, suitable for production use |
| 5000-7999 | Pass | Acceptable confidence, may need review |
| 0-4999 | Fail | Low confidence, should not be used as-is |

#### Steps

```
1. query    - Query multiple LLMs with identical prompt (temperature=0.1)
2. extract  - Extract atomic claims from each response
3. consensus - Compare claims across models (min_agreement=0.66)
4. score    - Compute final score based on consensus metrics
5. bundle   - Package all evidence into auditable bundle
```

#### Configuration

```json
{
  "steps": [
    {
      "id": "query",
      "type": "prompt",
      "config": {
        "temperature": 0.1,
        "max_tokens": 2048
      }
    },
    {
      "id": "consensus",
      "type": "consensus",
      "config": {
        "min_agreement": 0.66,
        "allow_partial": true
      }
    },
    {
      "id": "score",
      "type": "score",
      "config": {
        "pass_threshold_bps": 5000,
        "worthy_threshold_bps": 8000
      }
    }
  ]
}
```

#### Use Cases

- **Factual Q&A**: Verify answers to factual questions
- **Knowledge Retrieval**: Check accuracy of retrieved information
- **Content Validation**: Verify AI-generated content for factual accuracy

#### Example

```typescript
import { verify, FACTUAL_CONSENSUS_PROGRAM } from '@mmv/sdk';

// Verify using the built-in program
const receipt = await verify('Paris is the capital of France', {
  programId: FACTUAL_CONSENSUS_PROGRAM.program_id,
});

console.log(`Verdict: ${receipt.verdict ? 'PASS' : 'FAIL'}`);
console.log(`Score: ${receipt.score_bps / 100}%`);
console.log(`Program: ${receipt.program_id} v${receipt.program_version}`);
```

## Creating Custom Programs

You can register custom programs with your own verification logic:

```typescript
import { MMVClient } from '@mmv/sdk';

const client = new MMVClient({ baseUrl: 'http://localhost:3000' });

const program = await client.registerProgram({
  name: 'my-custom-program',
  version: '1.0.0',
  description: 'Custom verification logic',
  steps: [
    { type: 'prompt', description: 'Initial query' },
    { type: 'retrieve', description: 'Fetch sources' },
    { type: 'cross-check', description: 'Compare with sources' },
    { type: 'score', description: 'Compute score' },
    { type: 'evidence', description: 'Bundle evidence' },
  ],
});

console.log(`Registered: ${program.program_id}`);
console.log(`Fingerprint: ${program.fingerprint}`);
```

## Program Fingerprinting

Each program has a deterministic fingerprint computed from its canonical JSON representation using keccak256. This ensures:

1. **Reproducibility**: Same definition always produces same fingerprint
2. **Tamper-evidence**: Any change to the program changes the fingerprint
3. **Auditability**: Receipts include program fingerprint for verification

The fingerprint is included in every verification receipt:

```json
{
  "program": {
    "program_id": "factual-consensus-v1",
    "fingerprint": "0x7f8c9d0e...",
    "name": "factual-consensus",
    "version": "1.0.0"
  }
}
```
