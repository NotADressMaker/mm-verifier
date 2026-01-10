# Branch Legitimacy Scoring (BLS) System

**Version 1.0** | **Last Updated**: 2026-01-10

## Table of Contents

1. [Overview](#overview)
2. [Motivation](#motivation)
3. [System Architecture](#system-architecture)
4. [Branching Decision Trees](#branching-decision-trees)
5. [Per-Branch Legitimacy Scoring](#per-branch-legitimacy-scoring)
6. [Tree-Level BLS Score](#tree-level-bls-score)
7. [Fault Classification](#fault-classification)
8. [Slashing Mechanism](#slashing-mechanism)
9. [Configuration Parameters](#configuration-parameters)
10. [Implementation](#implementation)
11. [Attack Scenarios](#attack-scenarios)
12. [Governance & Tuning](#governance--tuning)

---

## Overview

The Branch Legitimacy Scoring (BLS) system is a sophisticated framework for evaluating **branching decision trees** submitted by LLM verifiers. Unlike simple consensus mechanisms, BLS:

1. **Rewards nuanced evaluation**: Sophisticated verifiers can express conditional logic ("IF X THEN Y")
2. **Punishes unjustified branching**: Adding branches without evidence is expensive
3. **Distinguishes honest error from laziness**: Wrong but well-supported branches are treated gently; unsupported spam branches are slashed hard

---

## Motivation

### The Problem: Simple Scoring Isn't Enough

Traditional verification systems score LLM outputs on a fixed scale (0-100). But reality is conditional:

- **Contextual accuracy**: "The model is reliable **IF** the query is about recent events **AND** cites primary sources"
- **Edge cases**: "The model is unreliable **IF** it contradicts itself **OR** provides no citations"
- **Nuanced verdicts**: "High confidence **IF** all models agree, medium confidence **IF** 2/3 agree"

### The Solution: Branching Decision Trees

Verifiers submit **decision trees with conditional branches**:

```
IF (model_consensus > 0.8 AND has_citations)
  THEN verdict="reliable", confidence=0.95
ELSE IF (model_consensus > 0.6)
  THEN verdict="mixed", confidence=0.70
ELSE
  THEN verdict="unreliable", confidence=0.85
```

Each branch must be **supported by evidence**. Unsupported branches are punished.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Verifier Node                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  1. Query multiple LLMs                             │   │
│  │  2. Extract claims + gather evidence                │   │
│  │  3. Build branching decision tree                   │   │
│  │  4. Submit tree + evidence bundle on-chain          │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  BLS Scorer (Off-chain Compute)                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Per-Branch Components (E, Q, N, C, S)              │   │
│  │  • Evidence Quality (E): Source authority + relevance │  │
│  │  • Quote Attribution (Q): Correctness of quotes       │  │
│  │  • Necessity (N): Non-redundancy                      │  │
│  │  • Condition Clarity (C): Machine-checkability        │  │
│  │  • Scope Correctness (S): No overclaiming             │  │
│  │                                                       │   │
│  │  Tree-Level Score: BLS = 100 * Avg(Legit_i) * ...   │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Fault Classifier                                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  • Ordinary Disagreement (D): Wrong but legit branches│  │
│  │  • Unjustified Branching (U): Unsupported spam      │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  BLSSlashingManager (On-Chain)                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  slash_rate = sD(D) + sU(U) - overlap + hard_triggers│  │
│  │                                                       │   │
│  │  • sD(D) = a * D²           (gentle, quadratic)     │   │
│  │  • sU(U) = b * U^γ          (harsh, superlinear)    │   │
│  │  • Hard triggers: fabricated quotes, spam, etc.      │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Branching Decision Trees

### Structure

Each verifier submits a **tree** with K branches:

```typescript
{
  tree_id: "tree-123",
  task_id: 456,
  evaluator: "0xABC...",

  declared_budget: 5,           // B: How many branches verifier claims to need
  trust_score: 82.4,            // Determines if budget is reasonable

  branches: [
    {
      branch_id: "b1",

      // Condition (machine-checkable)
      if_condition: "model_consensus > 0.8 && has_citations == true",
      condition_parseable: true,
      condition_type: "boolean",

      // Verdict
      then_verdict: "reliable",
      then_confidence: 0.95,

      // Evidence support
      supports: ["ev1", "ev2", "ev3"],  // Reference evidence IDs
      quote_spans: [
        { evidence_id: "ev1", text: "cited text...", byte_start: 120, byte_end: 180 }
      ],

      // Scores (computed by BLS)
      scores: {
        evidence_quality: 0.87,
        quote_attribution: 1.0,
        necessity: 0.92,
        condition_clarity: 1.0,
        scope_correctness: 0.95,
        legitimacy: 0.93
      }
    },
    // ... more branches
  ],

  has_else_branch: true,
  coverage_complete: true,

  scores: {
    avg_legitimacy: 0.89,
    coverage_factor: 1.0,
    complexity_discipline: 0.95,
    bls_score: 84.6
  }
}
```

### Key Constraints

1. **Declared Budget**: Verifier declares how many branches they need (B)
2. **Actual Branches**: Verifier submits K branches
3. **Exceeding Budget**: If K > B, complexity discipline penalty applies
4. **Coverage**: Must cover all plausible outcomes (else branch or exhaustive partitioning)

---

## Per-Branch Legitimacy Scoring

Each branch i gets a **legitimacy score** `Legit_i` (0-1) based on 5 components:

### Formula

```
Legit_i = wE * E_i + wQ * Q_i + wN * N_i + wC * C_i + wS * S_i
```

**Default weights**:
- wE = 0.35 (Evidence quality)
- wQ = 0.20 (Quote attribution)
- wN = 0.15 (Necessity)
- wC = 0.15 (Condition clarity)
- wS = 0.15 (Scope correctness)

---

### Component A: Evidence Quality (E_i)

**What it measures**: Quality and relevance of supporting evidence.

**Computation**:

```typescript
E_i = 0  if supports_i is empty

otherwise:
  For each evidence j in supports_i:
    src(j) = source authority (0-1)        // .gov = 0.9, .edu = 0.8, blogs = 0.3
    rel(j) = relevance to claim (0-1)      // Embedding similarity + keyword match

  E_i = average_j( sqrt(src(j) * rel(j)) )
```

**Intuition**:
- Empty supports → score 0
- Weak sources heavily penalized (square root amplifies low scores)
- Irrelevant evidence doesn't help

**Example**:

```
supports = [
  { url: "https://cdc.gov/...", authority: 0.9, relevance: 0.85 },  // sqrt(0.765) = 0.875
  { url: "https://wikipedia.org/...", authority: 0.7, relevance: 0.90 },  // sqrt(0.63) = 0.794
  { url: "https://blogspot.com/...", authority: 0.3, relevance: 0.60 }  // sqrt(0.18) = 0.424
]

E_i = (0.875 + 0.794 + 0.424) / 3 = 0.698
```

---

### Component B: Quote / Attribution (Q_i)

**What it measures**: Correctness of quoted evidence (no misquotes, no out-of-context).

**Computation**:

```typescript
Q_i = 1  if no quotes used (not all branches need quotes)

otherwise:
  quote_error_rate = (mismatched_quotes + out_of_context_quotes) / total_quotes
  Q_i = 1 - min(1, quote_error_rate)
```

**Intuition**:
- A single proven misquote should crater this score
- Out-of-context quotes (cherry-picking) also penalized

**Example**:

```
quote_spans = [
  { evidence_id: "ev1", text: "climate change is real" },  // ✅ matches evidence
  { evidence_id: "ev2", text: "97% of scientists agree" },  // ✅ matches evidence
  { evidence_id: "ev3", text: "the earth is flat" }  // ❌ NOT in evidence!
]

quote_error_rate = 1 / 3 = 0.333
Q_i = 1 - 0.333 = 0.667
```

---

### Component C: Necessity / Non-redundancy (N_i)

**What it measures**: Branch is not a duplicate or spam.

**Computation**:

```typescript
Canonicalize all conditions (normalize whitespace, operators, etc.)

For branch i, compute:
  dup_i = max( cosine_similarity(if_i, if_k) ) for all k ≠ i

N_i = 1 - clamp01( (dup_i - τdup) / (1 - τdup) )

where τdup = 0.85 (redundancy threshold)
```

**Intuition**:
- If two branches have nearly identical conditions (> 85% similarity), one is redundant
- Redundant branches get penalized exponentially

**Example**:

```
Branch 1: "model_consensus > 0.8 && has_citations"
Branch 2: "model_consensus > 0.85 && has_citations"  // 92% similar → redundant!

dup_2 = 0.92
N_2 = 1 - (0.92 - 0.85) / (1 - 0.85) = 1 - 0.07/0.15 = 1 - 0.467 = 0.533
```

---

### Component D: Condition Clarity (C_i)

**What it measures**: Condition is machine-checkable and falsifiable.

**Computation**:

```typescript
C_i = 1.0  if parseable AND uses allowed grammar (boolean ops, comparisons, enums)
C_i = 0.5  if partially parseable
C_i = 0.0  if unparseable OR unfalsifiable ("if vibes are bad")
```

**Allowed grammar**:
- Boolean operators: `&&`, `||`, `!`, `and`, `or`, `not`
- Comparisons: `==`, `!=`, `<`, `>`, `<=`, `>=`
- Enumerations: `in`, `is`, `matches`

**Forbidden**:
- Vague language: "vibes", "feels", "seems", "probably"
- Unverifiable claims: "if I think it's good"

**Example**:

```
✅ C = 1.0: "model_consensus > 0.8 && citation_count >= 3"
⚠️ C = 0.5: "the model seems confident and has some citations"  (partially parseable)
❌ C = 0.0: "if vibes are good"  (unfalsifiable)
```

---

### Component E: Scope Correctness (S_i)

**What it measures**: Branch doesn't overclaim (confidence exceeds evidence strength).

**Computation**:

```typescript
conf_i = branch confidence (0-1)
entail_i = evidence entailment score (0-1)  // How well evidence supports claim

overclaim_penalty = clamp01(conf_i - entail_i)
S_i = 1 - overclaim_penalty
```

**Intuition**:
- If you claim 95% confidence but evidence only supports 60%, you're overclaiming
- Overclaiming is punished to prevent overconfidence

**Example**:

```
Branch: "THEN verdict='reliable', confidence=0.95"
Evidence entailment: 0.60  (weak support)

overclaim_penalty = 0.95 - 0.60 = 0.35
S_i = 1 - 0.35 = 0.65  (significant penalty)
```

---

## Tree-Level BLS Score

### Formula

```
BLS = 100 * (average_i Legit_i) * CoverageFactor * ComplexityDiscipline
```

### CoverageFactor (0.7 - 1.0)

Penalizes incomplete trees that don't cover all plausible outcomes.

```typescript
covered = 1  if has_else_branch OR exhaustive partitioning
covered = 0  otherwise

CoverageFactor = 0.7 + 0.3 * covered
```

**Example**:
- Tree with else branch: `CoverageFactor = 1.0`
- Tree without else branch: `CoverageFactor = 0.7` (30% penalty)

---

### ComplexityDiscipline (0.5 - 1.0)

Penalizes exceeding declared branch budget.

```typescript
K = actual branch count
B = declared budget

excess_ratio = max(0, (K - B) / B)

ComplexityDiscipline = 1 / (1 + excess_ratio)
```

**Intuition**: "More accurate → more branches" is allowed, but only if you declared the need.

**Example**:

```
Declared budget: B = 5
Actual branches: K = 10
excess_ratio = (10 - 5) / 5 = 1.0  (100% over budget)

ComplexityDiscipline = 1 / (1 + 1.0) = 0.5  (50% penalty)
```

---

## Fault Classification

When ground truth is available, classify faults into two categories:

### 1. Ordinary Disagreement (D)

**Definition**: Legitimate branches that reached the wrong conclusion.

**Computation**:

```typescript
legit_branches = branches where Legit_i >= Lmin  (e.g., 0.65)
incorrect_legit_branches = legit_branches contradicted by ground truth

D = incorrect_legit_branches / legit_branches
```

**Interpretation**: "You tried, you were wrong." Gentle penalty.

---

### 2. Unjustified Branching (U)

**Definition**: Unsupported, spammy, or overclaimed branches.

**Computation**:

```typescript
For each branch i:
  deficit_i = max(0, Lmin - Legit_i) / Lmin

  // Weight branches exceeding budget more
  if (i > B):
    weight_i = 1 + λ * (i - B) / B  (λ = 2.0)
  else:
    weight_i = 1

U = clamp01( sum(weight_i * deficit_i) / sum(weight_i) )
```

**Interpretation**: Lots of low-legit branches, especially beyond budget, drives U up fast.

---

## Slashing Mechanism

### Formula

```
slash_rate = clamp01( sD(D) + sU(U) - overlap_bonus + hard_triggers )
```

### Component Penalties

#### 1. Ordinary Disagreement (sD)

```
sD(D) = a * D²
```

**Default**: `a = 0.10`

**Intuition**: Quadratic penalty, gentle slope. Small disagreements barely matter.

**Example**:
- D = 0.30 → sD = 0.10 * 0.09 = 0.009 (0.9% slash)
- D = 0.50 → sD = 0.10 * 0.25 = 0.025 (2.5% slash)

---

#### 2. Unjustified Branching (sU)

```
sU(U) = b * U^γ
```

**Default**: `b = 0.60`, `γ = 2.7`

**Intuition**: Superlinear penalty (γ > 2). High U explodes slashing.

**Example**:
- U = 0.10 → sU = 0.60 * (0.10^2.7) ≈ 0.60 * 0.002 ≈ 0.0012 (0.12% slash)
- U = 0.60 → sU = 0.60 * (0.60^2.7) ≈ 0.60 * 0.252 ≈ 0.151 (15.1% slash)
- U = 0.90 → sU = 0.60 * (0.90^2.7) ≈ 0.60 * 0.729 ≈ 0.437 (43.7% slash)

---

#### 3. Overlap Bonus

```
overlap_bonus = c * (D * U)
```

**Default**: `c = 0.05`

**Intuition**: If a branch is both illegitimate AND wrong, don't count it twice.

---

### Hard Triggers

Certain provable bad behaviors trigger minimum slashing:

| Trigger | Condition | Min Slash |
|---------|-----------|-----------|
| **Fabricated Quote** | Proven fake citation / misquote | 80% |
| **High Confidence, No Support** | `confidence > 0.75` AND `supports = []` | 50% |
| **Spam Redundancy** | >30% of branches are duplicates | 40% |

---

### Example Calculations

#### Case A: Ordinary Disagreement, Legit Tree

```
D = 0.30, U = 0.05

sD = 0.10 * (0.30²) = 0.009
sU = 0.60 * (0.05^2.7) ≈ 0.0002
overlap = 0.05 * (0.30 * 0.05) = 0.00075

slash_rate = 0.009 + 0.0002 - 0.00075 ≈ 0.00845 (0.845%)

Stake: 1000 WETH → Slash: 8.45 WETH
```

**Verdict**: Wrist tap.

---

#### Case B: Unjustified Branching

```
D = 0.10, U = 0.60

sD = 0.10 * (0.10²) = 0.001
sU = 0.60 * (0.60^2.7) ≈ 0.151
overlap = 0.05 * (0.10 * 0.60) = 0.003

slash_rate = 0.001 + 0.151 - 0.003 = 0.149 (14.9%)

Stake: 1000 WETH → Slash: 149 WETH
```

**Verdict**: Real pain.

---

#### Case C: Fabricated Quote (Hard Trigger)

```
D = 0.20, U = 0.30
Base slash_rate = 0.04 + 0.05 - 0.003 = 0.087 (8.7%)

Hard trigger: fabricated_quote = true
Final slash_rate = max(0.087, 0.80) = 0.80 (80%)

Stake: 1000 WETH → Slash: 800 WETH
```

**Verdict**: Severe punishment for bad faith.

---

## Configuration Parameters

### Tunable Knobs

| Parameter | Symbol | Default | Range | Description |
|-----------|--------|---------|-------|-------------|
| **Legit Threshold** | Lmin | 0.65 | 0.60-0.75 | Minimum legitimacy for "legit" branch |
| **Ordinary Disagreement Coeff** | a | 0.10 | 0.05-0.15 | Quadratic penalty weight |
| **Unjustified Branching Coeff** | b | 0.60 | 0.40-0.80 | Superlinear penalty weight |
| **Unjustified Exponent** | γ | 2.7 | 2.0-3.5 | Exponent for U penalty |
| **Overlap Bonus** | c | 0.05 | 0.03-0.10 | Correction for double-counting |
| **Redundancy Threshold** | τdup | 0.85 | 0.80-0.90 | Cosine similarity for duplicates |
| **Lambda Excess Weight** | λ | 2.0 | 1.5-3.0 | Weight multiplier for branches > budget |

### Component Weights

| Component | Symbol | Default |
|-----------|--------|---------|
| Evidence Quality | wE | 0.35 |
| Quote Attribution | wQ | 0.20 |
| Necessity | wN | 0.15 |
| Condition Clarity | wC | 0.15 |
| Scope Correctness | wS | 0.15 |

**Constraint**: Must sum to 1.0.

---

## Implementation

### TypeScript (Off-Chain Scorer)

**Location**: `verifier-node/src/scoring/blsScorer.ts`

**Key Functions**:
- `computeEvidenceQuality()`: E_i component
- `computeQuoteAttribution()`: Q_i component
- `computeNecessity()`: N_i component
- `computeConditionClarity()`: C_i component
- `computeScopeCorrectness()`: S_i component
- `computeBranchLegitimacy()`: Weighted average → Legit_i
- `computeBLS()`: Tree-level score (0-100)
- `classifyFaults()`: Compute D and U
- `computeSlashing()`: Calculate slash amount

**Usage**:

```typescript
import { evaluateBLS, updateWithGroundTruth } from './blsScorer';

// Initial evaluation (no ground truth yet)
const result = evaluateBLS(tree, evidenceMap, config);
console.log(`BLS Score: ${result.bls_score}`);

// After dispute resolution (ground truth available)
const finalResult = updateWithGroundTruth(
  result,
  groundTruth,
  stake,
  config
);
console.log(`Slash Rate: ${finalResult.slashing.slash_rate * 100}%`);
```

---

### Solidity (On-Chain Slashing)

**Location**: `contracts/contracts/BLSSlashingManager.sol`

**Key Functions**:
- `calculateSlashing()`: Pure function for slash computation
- `slash()`: Execute slashing via AuditorRegistry
- `setSlashingParams()`: Update a, b, γ, c (governance)
- `setHardTriggerThresholds()`: Update minimum slashes
- `simulateSlashing()`: View function for testing

**Usage**:

```solidity
// Construct fault data
FaultData memory faults = FaultData({
    D: 300_000_000_000_000_000,  // 0.30 * 1e18
    U: 50_000_000_000_000_000,   // 0.05 * 1e18
    fabricatedQuote: false,
    highConfidenceNoSupport: false,
    spamRedundancy: false
});

// Execute slashing
uint256 slashAmount = blsSlashingManager.slash(
    evaluator,
    taskId,
    stake,
    faults,
    recipient
);
```

---

## Attack Scenarios

### Attack 1: Branch Spam (Many Weak Branches)

**Strategy**: Submit 20 branches with minimal evidence to appear sophisticated.

**Defense**:
- **Necessity (N)**: Redundant branches get low N scores
- **Unjustified Branching (U)**: High deficit sum → U ≈ 0.70
- **Slashing**: `sU = 0.60 * (0.70^2.7) ≈ 0.22` → 22% slash
- **Hard Trigger**: If >30% redundant → minimum 40% slash

**Result**: Attack is deeply unprofitable.

---

### Attack 2: High Confidence, No Evidence

**Strategy**: Submit branches with `confidence=0.95` but `supports=[]`.

**Defense**:
- **Evidence Quality (E)**: E = 0 (empty supports)
- **Scope Correctness (S)**: S ≈ 0.05 (massive overclaim)
- **Legitimacy**: Legit_i ≈ 0.10 (well below Lmin)
- **Hard Trigger**: confidence > 0.75 AND empty supports → minimum 50% slash

**Result**: Minimum 50% slash applied.

---

### Attack 3: Fabricated Quotes

**Strategy**: Insert fake quotes to boost Q score.

**Defense**:
- **Quote Attribution (Q)**: Mismatched quotes detected → Q ≈ 0
- **Hard Trigger**: Proven fabricated quote → minimum 80% slash

**Result**: Severe punishment (80% stake loss).

---

### Attack 4: Lazy Evaluation (Copy Consensus)

**Strategy**: Just agree with median consensus without doing analysis.

**Defense**:
- **Evidence Quality (E)**: No evidence gathered → E = 0
- **Unjustified Branching (U)**: All branches have high deficit → U ≈ 0.60
- **Slashing**: ~15% slash even if verdict is "correct"

**Result**: Lazy evaluation punished even when verdict matches consensus.

---

## Governance & Tuning

### Phase 1: Conservative Launch

**Initial parameters** (maximize safety):
- `a = 0.05` (very gentle on disagreement)
- `b = 0.40` (moderate on unjustified branching)
- `γ = 2.5` (moderate superlinearity)
- `Lmin = 0.70` (high legitimacy bar)

**Goal**: Minimize false positives, build confidence.

---

### Phase 2: Equilibrium Tuning

**After 3-6 months**, adjust based on data:
- If too many low-quality submissions → increase `b`, `γ`
- If too few sophisticated trees → lower `Lmin`, increase component weights
- If spam attacks → tighten hard trigger thresholds

**Recommended process**:
1. Run simulations on historical data
2. Propose parameter changes via governance
3. Apply changes gradually (10-20% adjustments)
4. Monitor for 2 weeks before further changes

---

### Phase 3: Advanced Features

**Future enhancements**:
1. **Adaptive Budgets**: Budget increases with verifier reputation
2. **Domain-Specific Rubrics**: Different weights for factual-qa vs policy-compliance
3. **ZK-Proofs**: Prove legitimacy without revealing evidence
4. **ML-Based Entailment**: Replace heuristic entailment with NLI models
5. **Multi-Tier BLS**: Different slashing curves for different task tiers

---

## Appendix: Mathematical Proofs

### Theorem 1: Spam Branching is Unprofitable

**Claim**: For any attacker with stake S, adding N spam branches (Legit_i < Lmin) results in expected loss.

**Proof**:
1. Each spam branch contributes deficit: `d_i = (Lmin - Legit_i) / Lmin ≥ 0.65`
2. If spam branches exceed budget B, they get weighted: `w_i ≥ 1 + 2(i - B)/B`
3. Unjustified severity: `U ≥ 0.65 * (N_spam / N_total)`
4. For N_spam ≥ 0.5 * N_total: `U ≥ 0.325`
5. Slashing: `sU ≥ 0.60 * (0.325^2.7) ≈ 0.024` (2.4%)
6. Hard trigger if >30% redundancy: minimum 40% slash
7. Expected reward from spam: ~0% (low BLS score)
8. Expected loss: -2.4% to -40% of stake

**QED**: Negative expected value.

---

### Theorem 2: Sophisticated Trees are Rewarded

**Claim**: A verifier with K legit branches (all Legit_i ≥ Lmin) earns higher rewards than simple verifiers.

**Proof**:
1. Assume verifier declared budget B = K (honest declaration)
2. All branches have Legit_i ≥ 0.65
3. ComplexityDiscipline = 1.0 (no excess)
4. CoverageFactor = 1.0 (exhaustive coverage)
5. BLS = 100 * Avg(Legit_i) * 1.0 * 1.0 ≥ 65
6. Higher BLS → higher accuracy bonus in marketplace rewards
7. Simple verifier (K=1) has max BLS ≈ 65, sophisticated verifier (K=5) has BLS ≈ 85

**QED**: Sophisticated trees earn more.

---

## References

1. **Tokenomics**: See `TOKENOMICS.md` for bond structure and economic security
2. **Scoring Pipeline**: See `SCORING_PIPELINE.md` for evidence gathering and metrics
3. **Auditor Duties**: See `AUDITOR_DUTIES.md` for validation checklist

---

**End of Document**
