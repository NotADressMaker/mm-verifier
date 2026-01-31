# Auditor Duties & Responsibilities

**Version**: 1.0
**Last Updated**: 2026-01-10

## Overview

Auditors in the MMV system perform **bundle integrity checks** and **rubric compliance validation**, **not** full re-evaluation of LLM outputs.

### Key Principle

> **Auditors verify process compliance, not truth**

Auditors check that verifiers followed the scoring pipeline correctly, not whether the LLMs gave "correct" answers.

---

## What Auditors DO

### ✅ Bundle Integrity Checks
1. Validate schema + signatures
2. Check evidence links match cited claims
3. Verify IPFS availability
4. Recompute key metrics (spot-check or full deterministic rerun)
5. Vote uphold/overturn based on compliance

### ❌ What Auditors DO NOT Do

- ❌ Re-query LLM models
- ❌ Judge "correctness" of LLM outputs
- ❌ Search for new evidence sources
- ❌ Rewrite scoring algorithms
- ❌ Second-guess verifier's interpretation

**Rationale**: Auditing is about **process fidelity**, not content re-evaluation.

---

## Duty 1: Validate Schema + Signatures

### Purpose
Ensure evidence bundle is well-formed and cryptographically signed

### Process

```typescript
async function validateBundleSchema(bundle: EvidenceBundle): Promise<ValidationResult> {
  const errors: string[] = [];

  // 1. Check required fields exist (v0.1 shared schema)
  const requiredFields = [
    'task_id',
    'bundle_version',
    'created_at',
    'evaluator',
    'prompt_hash',
    'rubric_hash',
    'model_runs',
    'claims',
    'metrics',
    'final_score_bps',
    'signatures'
  ];

  for (const field of requiredFields) {
    if (!(field in bundle)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // 2. Validate field types
  if (typeof bundle.task_id !== 'string' || !bundle.task_id.startsWith('0x')) {
    errors.push('Invalid task_id format');
  }

  if (!ethers.isAddress(bundle.evaluator?.eth_address)) {
    errors.push('Invalid evaluator.eth_address');
  }

  if (!Array.isArray(bundle.model_runs) || bundle.model_runs.length === 0) {
    errors.push('Invalid model_runs array');
  }

  if (!Array.isArray(bundle.claims)) {
    errors.push('Invalid claims array');
  }

  // 3. Validate final score
  if (typeof bundle.final_score_bps !== 'number') {
    errors.push('Invalid final_score_bps');
  }

  if (bundle.final_score_bps < 0 || bundle.final_score_bps > 10000) {
    errors.push('Score out of range (0-10000 bps)');
  }

  // 4. Validate signature presence
  if (!bundle.signatures?.bundle_sig_eip712) {
    errors.push('Missing EIP-712 signature');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
```

### Signature Verification

```typescript
async function verifySignature(signedBundle: SignedBundle): Promise<boolean> {
  // 1. Reconstruct EIP-712 message
  const message = {
    jobId: signedBundle.bundle.task_id,
    verifier: signedBundle.signer,
    promptHash: signedBundle.bundle.prompt_hash,
    score: signedBundle.bundle.final_score_bps,
    verdict: getVerdict(signedBundle.bundle.final_score_bps),
    bundleHash: signedBundle.bundleHash,
    timestamp: Math.floor(new Date(signedBundle.bundle.created_at).getTime() / 1000)
  };

  // 2. Recover signer from signature
  const domain = {
    name: 'LLMVerifier',
    version: '1',
    chainId: NETWORK_CHAIN_ID,
    verifyingContract: MARKETPLACE_ADDRESS
  };

  const recoveredAddress = ethers.verifyTypedData(
    domain,
    EIP712_TYPES,
    message,
    signedBundle.signature
  );

  // 3. Verify signer matches claimed verifier
  const signatureValid = recoveredAddress.toLowerCase() === signedBundle.signer.toLowerCase();

  // 4. Verify signer has verifier stake onchain
  const hasStake = await stakingManager.hasVerifierStake(recoveredAddress);

  return signatureValid && hasStake;
}
```

**Pass Criteria**:
- ✅ All required fields present
- ✅ Types match schema
- ✅ Hash is correct
- ✅ Signature is valid
- ✅ Signer has verifier stake

**Fail → Vote to overturn**

---

## Duty 2: Check Evidence Links Match Cited Claims

### Purpose
Verify that evidence sources actually support the claims they're cited for

### Process

```typescript
async function validateEvidenceLinks(bundle: EvidenceBundle): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const { claims, model_runs } = bundle;

  // 1. Gather evidence entries attached to claims
  const evidenceItems = claims.flatMap(claim => [
    ...(claim.support || []),
    ...(claim.contradictions || [])
  ]);

  // 2. For each claim, ensure at least one supporting evidence entry
  for (const claim of claims) {
    if (!claim.support || claim.support.length === 0) {
      warnings.push(`Claim "${claim.text}" has no supporting evidence`);
    }
  }

  // 3. Check evidence URLs are accessible
  for (const evidence of evidenceItems) {
    if (evidence.url) {
      const accessible = await checkURLAccessible(evidence.url);
      if (!accessible) {
        errors.push(`Evidence URL not accessible: ${evidence.url}`);
      }
    }
  }

  // 4. Verify evidence snippets are not fabricated
  for (const evidence of evidenceItems) {
    if (evidence.url && evidence.snippet) {
      const actualContent = await fetchURLContent(evidence.url);
      const snippetFound = actualContent.includes(evidence.snippet);

      if (!snippetFound) {
        errors.push(`Evidence snippet not found in source: ${evidence.url}`);
      }
    }
  }

  // 5. Ensure model_runs are present for auditor spot checks
  if (!Array.isArray(model_runs) || model_runs.length === 0) {
    errors.push('Missing model_runs for evidence verification');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
```

**URL Accessibility Check**:
```typescript
async function checkURLAccessible(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      timeout: 5000
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}
```

**Content Verification**:
```typescript
async function fetchURLContent(url: string): Promise<string> {
  try {
    const response = await fetch(url, { timeout: 10000 });
    const html = await response.text();

    // Extract text content (strip HTML)
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

    return text;
  } catch (error) {
    throw new Error(`Failed to fetch URL: ${url}`);
  }
}
```

**Pass Criteria**:
- ✅ Every claim has supporting evidence
- ✅ Evidence URLs are accessible
- ✅ Cited snippets exist in sources

**Warnings** (not automatic fail, but flagged):
- ⚠️ Low evidence count
- ⚠️ Low authority sources

**Fail → Vote to overturn**

---

## Duty 3: Recompute Key Metrics

### Purpose
Verify verifier computed scores correctly according to the rubric

### Options

#### Option A: Spot-Check (Faster)
Recompute a subset of metrics to verify correctness

```typescript
async function spotCheckMetrics(bundle: EvidenceBundle): Promise<boolean> {
  // 1. Recompute consensus score
  const recomputedConsensus = computeConsensusScore(bundle.model_runs);

  const consensusMatch = Math.abs(
    recomputedConsensus - bundle.metrics.consensus.agreement
  ) < 0.05; // Allow 5% tolerance

  // 2. Recompute factuality ratio (simplified)
  const verifiedClaims = bundle.claims.filter(c =>
    c.support && c.support.length > 0
  ).length;
  const totalClaims = bundle.claims.length;
  const recomputedFactuality = totalClaims === 0 ? 0 : (verifiedClaims / totalClaims);

  const factualityMatch = Math.abs(
    recomputedFactuality - bundle.metrics.factuality.supported_claim_ratio
  ) < 0.1; // Allow 10% tolerance

  // 3. Verify final score calculation
  const recomputedFinalScore = computeFinalScore(bundle.metrics);

  const finalScoreMatch = Math.abs(
    recomputedFinalScore - bundle.final_score_bps
  ) < 500; // Allow 5% tolerance (500 bps)

  return consensusMatch && factualityMatch && finalScoreMatch;
}
```

#### Option B: Full Deterministic Rerun (Slower, More Thorough)

```typescript
async function fullMetricsRecompute(bundle: EvidenceBundle): Promise<RecomputeResult> {
  // 1. Re-normalize outputs
  const normalized = bundle.model_runs.map(r => normalizeOutput(r.raw_output));

  // 2. Re-extract claims
  const claims = normalized.map(n => extractClaims(n.mainAnswer));

  // 3. Re-compute consensus
  const consensus = computeConsensus(bundle.model_runs);

  // 4. Re-compute all metrics
  const metrics = {
    consensusScore: computeConsensusScore(consensus),
    factualityRatio: computeFactualityRatio(claims, bundle.claims),
    citationAuthority: computeCitationScore(bundle.claims),
    stability: computeStabilityScore(bundle.model_runs)
  };

  // 5. Re-compute final score
  const finalScore = computeFinalScore(metrics);

  // 6. Compare with bundle's claimed scores
  const deviations = {
    consensus: Math.abs(metrics.consensusScore - bundle.metrics.consensus.agreement),
    factuality: Math.abs(metrics.factualityRatio - bundle.metrics.factuality.supported_claim_ratio),
    citation: Math.abs(metrics.citationAuthority - bundle.metrics.citation_quality.authority_score),
    stability: Math.abs(metrics.stability - bundle.metrics.stability.reask_delta),
    final: Math.abs(finalScore - bundle.final_score_bps)
  };

  // Allow small tolerance for floating point errors
  const TOLERANCE = 5; // 5% or 500 bps

  const allMatch = Object.values(deviations).every(d => d < TOLERANCE || d < 500);

  return {
    passed: allMatch,
    recomputedMetrics: metrics,
    recomputedFinalScore: finalScore,
    deviations
  };
}
```

**Pass Criteria**:
- ✅ Spot-check: All key metrics within 5-10% tolerance
- ✅ Full rerun: All metrics within 5% tolerance (or 500 bps for final score)

**Why Tolerance?**:
- Floating point precision differences
- Non-deterministic external API responses (URLs may change)
- Timestamp variations

**Fail → Vote to overturn**

---

## Duty 4: Verify IPFS Availability

### Purpose
Ensure evidence bundle is retrievable and pinned

### Process

```typescript
async function verifyIPFSAvailability(
  cid: string,
  expectedHash: string
): Promise<AvailabilityResult> {
  const errors: string[] = [];

  // 1. Try retrieving from local IPFS node
  let localRetrieved = false;
  try {
    const content = await ipfsClient.cat(cid);
    const retrieved = Buffer.concat(Array.from(content)).toString();
    const hash = ethers.keccak256(ethers.toUtf8Bytes(retrieved));

    if (hash === expectedHash) {
      localRetrieved = true;
    } else {
      errors.push('Hash mismatch on local IPFS retrieval');
    }
  } catch (error) {
    errors.push('Failed to retrieve from local IPFS');
  }

  // 2. Try retrieving from public gateways
  const gateways = [
    `https://ipfs.io/ipfs/${cid}`,
    `https://gateway.pinata.cloud/ipfs/${cid}`,
    `https://cloudflare-ipfs.com/ipfs/${cid}`
  ];

  let gatewaySuccesses = 0;
  for (const gateway of gateways) {
    try {
      const response = await fetch(gateway, { timeout: 5000 });
      if (response.ok) {
        const content = await response.text();
        const hash = ethers.keccak256(ethers.toUtf8Bytes(content));

        if (hash === expectedHash) {
          gatewaySuccesses++;
        }
      }
    } catch (error) {
      // Gateway failed, continue
    }
  }

  if (gatewaySuccesses === 0) {
    errors.push('Not retrievable from any public gateway');
  }

  // 3. Check if pinned (not just cached)
  let pinned = false;
  try {
    const pinStatus = await ipfsClient.pin.ls({ paths: [cid] });
    pinned = true;
  } catch (error) {
    errors.push('Bundle not pinned on IPFS');
  }

  // 4. Verify Pinata pinning (if claimed)
  // (Would check Pinata API for pin status)

  return {
    available: localRetrieved || gatewaySuccesses >= 2,
    pinned,
    localRetrieved,
    gatewaySuccesses,
    errors
  };
}
```

**Pass Criteria**:
- ✅ Retrievable from local node OR ≥2 public gateways
- ✅ Hash matches expected hash
- ✅ Pinned (not just cached)

**Fail → Vote to overturn** (missing bundle = critical failure)

---

## Duty 5: Vote Uphold/Overturn

### Purpose
Submit auditor vote via commit/reveal protocol

### Voting Decision Tree

```
┌─────────────────────────┐
│  Start Audit Review     │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Schema Valid?          │
│  Signature Valid?       │
└────┬─────────────┬──────┘
     NO            YES
     │             │
     ▼             ▼
 [OVERTURN]   ┌─────────────────────┐
              │  Evidence Links OK? │
              │  URLs Accessible?   │
              └────┬────────────┬───┘
                   NO           YES
                   │            │
                   ▼            ▼
               [OVERTURN]  ┌──────────────────┐
                           │  IPFS Available? │
                           │  Bundle Pinned?  │
                           └────┬────────┬────┘
                                NO       YES
                                │        │
                                ▼        ▼
                            [OVERTURN]  ┌─────────────────────┐
                                        │  Metrics Recompute? │
                                        │  Scores Match?      │
                                        └────┬────────────┬───┘
                                             NO           YES
                                             │            │
                                             ▼            ▼
                                         [OVERTURN]   [UPHOLD]
```

### Commit Vote

```typescript
async function commitVote(
  disputeId: string,
  vote: boolean, // true = overturn (challenger wins), false = uphold (verifier wins)
  salt: string
): Promise<void> {
  // 1. Create commitment hash
  const commitHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'address', 'bool', 'bytes32'],
      [disputeId, auditorAddress, vote, salt]
    )
  );

  // 2. Submit commitment to contract
  const tx = await disputeResolver.commitAuditorVote(disputeId, commitHash);
  await tx.wait();

  // 3. Store salt locally for reveal
  storeVoteData(disputeId, { vote, salt });
}
```

### Reveal Vote

```typescript
async function revealVote(
  disputeId: string
): Promise<void> {
  // 1. Retrieve stored vote data
  const { vote, salt } = getStoredVoteData(disputeId);

  // 2. Submit reveal to contract
  const tx = await disputeResolver.revealAuditorVote(
    disputeId,
    vote, // true = challenger wins (overturn)
    salt
  );
  await tx.wait();
}
```

**Vote Meanings**:
- **true (Overturn)**: Challenger is correct, verifier's bundle is invalid
- **false (Uphold)**: Verifier's bundle is valid, challenger is wrong

---

## Auditor Checklist

Before voting, auditors should complete:

### Pre-Vote Checklist

- [ ] **Retrieved bundle from IPFS using CID**
- [ ] **Validated schema** (all required fields present)
- [ ] **Verified signature** (EIP-712 valid, signer has stake)
- [ ] **Checked bundle hash** (matches content)
- [ ] **Verified evidence links** (URLs accessible, snippets exist)
- [ ] **Spot-checked metrics** (consensus, factuality within tolerance)
- [ ] **Verified IPFS availability** (retrievable from ≥2 gateways)
- [ ] **Checked pinning status** (bundle is pinned)

### Vote Decision

```
IF any critical check fails:
  → Vote OVERTURN (challenger wins)

IF all checks pass:
  → Vote UPHOLD (verifier wins)

IF borderline (warnings but no errors):
  → Auditor discretion (lean toward UPHOLD)
```

---

## Example: Full Audit Process

**Scenario**: Dispute over job 0x123, verifier 0xABC claimed score of 9200

### Step 1: Retrieve Bundle
```typescript
const cid = "QmXYZ...";
const bundle = await retrieveFromIPFS(cid);
```

### Step 2: Schema Validation
```typescript
const schemaResult = await validateBundleSchema(bundle);
// Result: { valid: true, errors: [] }
```

### Step 3: Signature Verification
```typescript
const sigValid = await verifySignature(signedBundle);
// Result: true
```

### Step 4: Evidence Links
```typescript
const evidenceResult = await validateEvidenceLinks(bundle);
// Result: { valid: true, errors: [], warnings: ["Low evidence count"] }
```

### Step 5: Metrics Recompute
```typescript
const metricsResult = await spotCheckMetrics(bundle);
// Result: true (all within tolerance)
```

### Step 6: IPFS Availability
```typescript
const availResult = await verifyIPFSAvailability(cid, bundle.bundleHash);
// Result: { available: true, pinned: true, gatewaySuccesses: 3 }
```

### Step 7: Vote Decision
```
All checks passed → Vote UPHOLD (false)
```

### Step 8: Commit Vote
```typescript
const salt = ethers.hexlify(ethers.randomBytes(32));
await commitVote(disputeId, false, salt); // false = uphold
```

### Step 9: Reveal Vote (after commit deadline)
```typescript
await revealVote(disputeId); // Reveals: false (uphold)
```

---

## Auditor Earnings

**Per Dispute**:
- If vote correctly: ~0.01 WETH ($20)
- If vote incorrectly: -0.02 WETH ($40 slash)

**Expected Monthly** (30% selection rate, 90% accuracy):
- 10 disputes × 0.3 selected × 0.9 correct × 0.01 WETH
- = 0.027 WETH/month (~$54)

**Time Investment**:
- Schema check: 2 min
- Evidence links: 5 min
- Metrics recompute: 3 min
- IPFS verification: 2 min
- **Total: ~12 minutes per dispute**

**Hourly Rate**:
- $20 / 0.2 hours = $100/hour

---

## Red Flags (Automatic Overturn)

If auditor sees any of these, **vote to overturn immediately**:

1. ❌ **Bundle not retrievable from IPFS**
2. ❌ **Signature invalid or from non-staked address**
3. ❌ **Hash mismatch (tampering detected)**
4. ❌ **Missing required fields**
5. ❌ **Evidence URLs return 404**
6. ❌ **Cited snippets not found in sources**
7. ❌ **Score out of range (0-10000 bps)**
8. ❌ **Metrics deviate >20% from recompute**

---

## Auditor Best Practices

### DO:
- ✅ Run all checks systematically
- ✅ Document findings
- ✅ Use deterministic recompute when uncertain
- ✅ Commit vote promptly
- ✅ Always reveal (don't forfeit)

### DON'T:
- ❌ Re-query LLM models
- ❌ Judge answer "correctness"
- ❌ Introduce personal bias
- ❌ Rush through checks
- ❌ Skip signature verification

---

## Dispute Resolution Outcomes

### If Majority Votes OVERTURN:
- Verifier slashed (50% of bond)
- Challenger rewarded (60% of slash)
- Correct-voting auditors rewarded (40% of slash, split)
- Incorrect-voting auditors slashed (20% of stake)

### If Majority Votes UPHOLD:
- Verifier wins (no slash)
- Challenger loses bond (transferred to verifier)
- Correct-voting auditors earn reputation
- Incorrect-voting auditors slashed (20% of stake)

---

## Conclusion

Auditors are **process validators**, not content judges. Their role is to ensure:

1. ✅ Verifiers followed the scoring pipeline correctly
2. ✅ Evidence bundles are valid and retrievable
3. ✅ Metrics were computed according to the rubric
4. ✅ Cryptographic signatures are valid

This creates a **trustless verification system** where:
- Verifiers must produce valid bundles or get slashed
- Auditors verify process compliance deterministically
- Challengers can dispute invalid bundles profitably
- Economic incentives align with honest behavior

**The system works because auditing is objective, not subjective.**
