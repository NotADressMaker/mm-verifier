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

  // 1. Check required fields exist
  const requiredFields = [
    'jobId',
    'verifierAddress',
    'timestamp',
    'promptHash',
    'models',
    'modelResponses',
    'scoringResult',
    'analysis',
    'checksPerformed',
    'bundleHash'
  ];

  for (const field of requiredFields) {
    if (!(field in bundle)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // 2. Validate field types
  if (typeof bundle.jobId !== 'string' || !bundle.jobId.startsWith('0x')) {
    errors.push('Invalid jobId format');
  }

  if (!ethers.isAddress(bundle.verifierAddress)) {
    errors.push('Invalid verifier address');
  }

  if (!Array.isArray(bundle.models) || bundle.models.length === 0) {
    errors.push('Invalid models array');
  }

  if (!Array.isArray(bundle.modelResponses) || bundle.modelResponses.length === 0) {
    errors.push('Invalid modelResponses array');
  }

  // 3. Verify model count matches responses
  if (bundle.models.length !== bundle.modelResponses.length) {
    errors.push('Model count mismatch with responses');
  }

  // 4. Validate scoring result structure
  const scoringResult = bundle.scoringResult;
  if (!scoringResult || typeof scoringResult.score !== 'number') {
    errors.push('Invalid scoring result');
  }

  if (scoringResult.score < 0 || scoringResult.score > 10000) {
    errors.push('Score out of range (0-10000)');
  }

  const validVerdicts = ['reliable', 'mixed', 'unreliable'];
  if (!validVerdicts.includes(scoringResult.verdict)) {
    errors.push('Invalid verdict value');
  }

  // 5. Validate bundle hash
  const computedHash = hashEvidenceBundle(bundle);
  if (computedHash !== bundle.bundleHash) {
    errors.push('Bundle hash mismatch - potential tampering');
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
    jobId: signedBundle.bundle.jobId,
    verifier: signedBundle.signer,
    promptHash: signedBundle.bundle.promptHash,
    score: signedBundle.bundle.scoringResult.score,
    verdict: signedBundle.bundle.scoringResult.verdict,
    bundleHash: signedBundle.bundleHash,
    timestamp: signedBundle.bundle.timestamp
  };

  // 2. Recover signer from signature
  const recoveredAddress = ethers.verifyTypedData(
    EIP712_DOMAIN,
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

  const { analysis, modelResponses } = bundle;

  // 1. Extract all citations from analysis
  const citations = analysis.citations.flat();

  // 2. For each claim, check cited evidence exists
  for (let i = 0; i < analysis.claims.length; i++) {
    const claimSet = analysis.claims[i];

    for (const claim of claimSet) {
      // Find evidence for this claim
      const relevantEvidence = citations.filter(c =>
        calculateSimilarity(c.text, claim) > 0.5
      );

      if (relevantEvidence.length === 0) {
        warnings.push(`Claim "${claim}" has no supporting evidence`);
      }

      // Check evidence URLs are accessible
      for (const evidence of relevantEvidence) {
        if (evidence.type === 'url' && evidence.url) {
          const accessible = await checkURLAccessible(evidence.url);
          if (!accessible) {
            errors.push(`Evidence URL not accessible: ${evidence.url}`);
          }
        }
      }
    }
  }

  // 3. Verify evidence snippets are not fabricated
  for (const citation of citations) {
    if (citation.type === 'url' && citation.url) {
      // Fetch actual content from URL
      const actualContent = await fetchURLContent(citation.url);

      // Check if cited snippet appears in content
      const snippetFound = actualContent.includes(citation.text);

      if (!snippetFound) {
        errors.push(`Citation snippet not found in source: ${citation.url}`);
      }
    }
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
  const recomputedConsensus = computeConsensusScore(bundle.modelResponses);

  const consensusMatch = Math.abs(
    recomputedConsensus - bundle.scoringResult.breakdown.consensus
  ) < 5; // Allow 5% tolerance

  // 2. Recompute factuality ratio (simplified)
  const verifiedClaims = bundle.analysis.claims.flat().filter(c =>
    c.confidence > 0.8
  ).length;
  const totalClaims = bundle.analysis.claims.flat().length;
  const recomputedFactuality = (verifiedClaims / totalClaims) * 100;

  const factualityMatch = Math.abs(
    recomputedFactuality - bundle.scoringResult.breakdown.factualAccuracy
  ) < 10; // Allow 10% tolerance

  // 3. Verify final score calculation
  const recomputedFinalScore = computeFinalScore(bundle.scoringResult.breakdown);

  const finalScoreMatch = Math.abs(
    recomputedFinalScore - bundle.scoringResult.score
  ) < 500; // Allow 5% tolerance (500 bps)

  return consensusMatch && factualityMatch && finalScoreMatch;
}
```

#### Option B: Full Deterministic Rerun (Slower, More Thorough)

```typescript
async function fullMetricsRecompute(bundle: EvidenceBundle): Promise<RecomputeResult> {
  // 1. Re-normalize outputs
  const normalized = bundle.modelResponses.map(r => normalizeOutput(r.response));

  // 2. Re-extract claims
  const claims = normalized.map(n => extractClaims(n.mainAnswer));

  // 3. Re-compute consensus
  const consensus = computeConsensus(bundle.modelResponses);

  // 4. Re-compute all metrics
  const metrics = {
    consensusScore: computeConsensusScore(consensus),
    factualityRatio: computeFactualityRatio(claims, bundle.analysis.citations),
    citationAuthority: computeCitationScore(bundle.analysis.citations.flat()),
    stability: computeStabilityScore(bundle.modelResponses)
  };

  // 5. Re-compute final score
  const finalScore = computeFinalScore(metrics);

  // 6. Compare with bundle's claimed scores
  const deviations = {
    consensus: Math.abs(metrics.consensusScore - bundle.scoringResult.breakdown.consistency),
    factuality: Math.abs(metrics.factualityRatio - bundle.scoringResult.breakdown.factualAccuracy),
    citation: Math.abs(metrics.citationAuthority - bundle.scoringResult.breakdown.citationQuality),
    stability: Math.abs(metrics.stability - bundle.scoringResult.breakdown.agreement),
    final: Math.abs(finalScore - bundle.scoringResult.score)
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
