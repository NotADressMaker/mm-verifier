# Verification Programs

Verification programs are filesystem plugins that define how evidence bundles are turned into receipts. Programs are loaded from the `programs/` directory, versioned with semver, and hashed with deterministic SHA-256 fingerprints.

## Built-in Program

### factual-consensus

**Program ID:** `factual-consensus`
**Version:** `1.0.0`
**Hash:** `dd5cf58f1617af56192049a9fda1ca848ae00f5fa9df000d3ad2f0b3c6431f9c`

Multi-model consensus verification for factual claims.

#### What It Checks

1. **Multi-Model Agreement**: Queries the same prompt to multiple LLMs and compares responses.
2. **Claim Extraction**: Extracts atomic claims for granular comparison.
3. **Consistency Analysis**: Checks whether claims agree or contradict across models.
4. **Scoring**: Produces a score in basis points (0-10000) based on agreement and citation quality.

#### Scoring Thresholds

| Score (bps) | Verdict | Meaning |
|-------------|---------|---------|
| 8000-10000 | Pass + Worthy | High confidence, suitable for production use |
| 5000-7999 | Pass | Acceptable confidence, may need review |
| 0-4999 | Fail | Low confidence, should not be used as-is |

#### Example Use

```typescript
import { verify, FACTUAL_CONSENSUS_PROGRAM } from '@mmv/sdk';

const receipt = await verify('Paris is the capital of France', {
  programId: FACTUAL_CONSENSUS_PROGRAM.id,
});

console.log(`Verdict: ${receipt.verdict ? 'PASS' : 'FAIL'}`);
console.log(`Score: ${receipt.score_bps / 100}%`);
console.log(`Program: ${receipt.program_id} v${receipt.program_version}`);
```

## Program Interface

Programs implement the following runtime contract:

- `id` (string) — program identifier (e.g., `factual-consensus`)
- `version` (semver string)
- `description`
- `input_schema` — JSON Schema for the evidence bundle
- `output_schema` — JSON Schema for the receipt (ReceiptV1 subset + program-specific fields)
- `evidence_requirements` — required bundle sections / minimum counts
- `scoring_rubric` — metadata about scoring weights and thresholds
- `run(bundle, context) -> ReceiptV1`

The `run()` method **must** populate the ReceiptV1 `explain` object.

## Program Hashing

Program hashes are deterministic SHA-256 digests of:

1. A canonicalized manifest JSON: `{ id, version, entrypoint }`
2. The canonicalized source files in the program directory:
   - sorted filenames
   - normalized newlines (`\n`)

Any source change or manifest change results in a new hash.

## Registry & CLI Tools

Programs are loaded from the `programs/` directory. The registry enforces:

- semver validity
- allowed program lists
- pinned expected hashes

CLI tools are provided in the verifier node package:

```bash
# list installed programs
npm --workspace verifier-node run list-programs

# verify a program by id@version
npm --workspace verifier-node run verify-program -- factual-consensus@1.0.0

# print the program hash
npm --workspace verifier-node run hash-program -- factual-consensus@1.0.0
```

## Writing a Program

1. **Create a program folder** under `programs/`:

```
programs/
  my-program/
    manifest.json
    index.js
```

2. **Add a manifest** (`manifest.json`):

```json
{
  "id": "my-program",
  "version": "1.0.0",
  "entrypoint": "index.js"
}
```

3. **Export a program module** (`index.js`):

```js
const evidenceSchema = require('../../shared/schemas/evidence_bundle.v1.schema.json');
const receiptSchema = require('../../shared/schemas/receipt.v1.schema.json');

module.exports = {
  program: {
    id: 'my-program',
    version: '1.0.0',
    description: 'Custom verification logic.',
    input_schema: evidenceSchema,
    output_schema: receiptSchema,
    evidence_requirements: { required_sections: ['claims', 'metrics'] },
    scoring_rubric: { pass_threshold_bps: 5000, worthy_threshold_bps: 8000 },
    run: async (bundle, context) => ({
      version: '1.0.0',
      receipt_version: '1.0.0',
      task_id: context.task_id,
      generated_at: Math.floor(Date.now() / 1000),
      input_hash: context.input_hash,
      output_hash: context.output_hash,
      score_bps: bundle.final_score_bps,
      verdict: bundle.final_score_bps >= 5000,
      worthy: bundle.final_score_bps >= 8000,
      program: { id: 'my-program', version: '1.0.0', hash: context.program_hash },
      evidence: {
        bundle_hash: context.bundle_hash,
        bundle_uri: context.bundle_uri,
        bundle_version: context.bundle_version,
      },
      provenance: {
        llm_provider: context.llm_provider,
        llm_model: context.llm_model,
      },
      explain: {
        version: '1.0.0',
        score_components: [],
        checks: {},
        contradictions_found: [],
        citation_checks: [],
        model_disagreement: { models: [], agreement_rate: 0 },
      },
    }),
  },
};
```

4. **Register config (optional)** via environment variables:

- `DEFAULT_PROGRAM` — default program (e.g., `factual-consensus@1.0.0`)
- `ALLOWED_PROGRAMS` — comma-delimited allowlist (`id` or `id@version`)
- `PROGRAM_HASHES` — JSON map of expected hashes
- `PROGRAMS_DIR` — override programs directory
