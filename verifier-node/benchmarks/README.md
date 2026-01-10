# MM Verifier Benchmarking System

Comprehensive benchmarking infrastructure to measure and validate scoring pipeline accuracy.

## Overview

The benchmarking system provides:

- **Precision/Recall Metrics**: Standard ML evaluation metrics
- **Calibration Analysis**: Measure and track calibration error
- **Ablation Studies**: Test impact of individual features
- **Category Breakdown**: Performance by question type
- **Historical Tracking**: Track improvements over time

## Quick Start

```bash
# Run benchmark on factual-qa dataset
npm run benchmark

# Run with ablation studies
npm run benchmark -- --ablation

# Use custom dataset
npm run benchmark -- --dataset=./custom-data.json
```

## Dataset Format

Benchmark datasets are JSON files with this structure:

```json
[
  {
    "id": "unique-id",
    "prompt": "What is the capital of France?",
    "response": "The capital of France is Paris...",
    "groundTruth": {
      "isCorrect": true,
      "confidence": 1.0,
      "category": "factual-qa",
      "claims": [
        "The capital of France is Paris"
      ]
    },
    "metadata": {
      "domain": "geography",
      "difficulty": "easy"
    }
  }
]
```

### Fields

- **id**: Unique identifier for the item
- **prompt**: Input question/prompt
- **response**: AI model response to evaluate
- **groundTruth**: Human-labeled ground truth
  - **isCorrect**: Is the response correct? (boolean)
  - **confidence**: Human confidence (0-1)
  - **category**: Question category
  - **claims**: Atomic claims extracted from response
- **metadata**: Optional metadata (domain, difficulty, etc.)

## Included Datasets

### factual-qa.json

- **Size**: 10 items
- **Categories**: Factual QA, calculations, logic, coding
- **Purpose**: Basic validation of scoring pipeline

Create additional datasets by following the format above.

## Metrics Explained

### Accuracy

Percentage of correct predictions.

```
Accuracy = (TP + TN) / (TP + TN + FP + FN)
```

### Precision

Of items predicted as correct, what % were actually correct?

```
Precision = TP / (TP + FP)
```

### Recall

Of actually correct items, what % did we predict as correct?

```
Recall = TP / (TP + FN)
```

### F1 Score

Harmonic mean of precision and recall.

```
F1 = 2 * (Precision * Recall) / (Precision + Recall)
```

### Calibration Error

Expected Calibration Error (ECE) measures how well predicted probabilities match actual frequencies.

```
ECE = Σ (|confidence - accuracy|) * (n_bin / n_total)
```

**Lower is better**. Perfect calibration = 0.

## Calibration Layer

The calibration layer adjusts raw scores into calibrated probabilities.

### Features

- **Isotonic Regression**: Non-parametric calibration
- **Automatic Updates**: Recalibrates every 100 samples
- **Persistent**: Saves calibration model to disk
- **Graceful Degradation**: Falls back to raw scores when insufficient data

### Usage

```typescript
import CalibrationLayer from './src/benchmark/calibration';

const calibration = new CalibrationLayer('./calibration-model.json');
await calibration.load();

// Calibrate a raw score
const rawScore = 0.75;
const calibratedScore = calibration.calibrate(rawScore);

// Record observation for future calibration
calibration.recordObservation(rawScore, predicted, actual);

// Save updated model
await calibration.save();
```

### Statistics

```bash
npm run calibration:stats
```

Output:
```
📊 Calibration Statistics

Samples:                1000
Expected Calib. Error:  0.0234
Max Calibration Error:  0.0512

Calibration Bins:
  Range      Count  Accuracy  Calibrated
  0.00-0.10     45    8.9%      9.2%
  0.10-0.20     63   18.7%     17.8%
  ...
```

## Ablation Studies

Test impact of individual features by removing them.

### Features Tested

1. **Citations**: Impact of citation evidence
2. **Consensus**: Impact of multi-model agreement
3. **Source Checks**: Impact of external source verification

### Example Output

```
Ablation Study Results:
  baseline:
    Accuracy:  85.2%
    Precision: 87.4%
    Recall:    82.9%
  withoutCitations:
    Accuracy:  78.3%  (-6.9%)
    Precision: 80.1%  (-7.3%)
    Recall:    76.2%  (-6.7%)
  withoutConsensus:
    Accuracy:  81.7%  (-3.5%)
    Precision: 83.5%  (-3.9%)
    Recall:    79.8%  (-3.1%)
```

## Continuous Benchmarking

Set up automatic benchmarking on every deploy:

```bash
# In CI/CD pipeline
npm run benchmark -- --output=./results/$(date +%Y%m%d).json

# Compare with previous results
npm run benchmark:compare -- \
  --baseline=./results/20260101.json \
  --current=./results/20260110.json
```

## Best Practices

### Dataset Size

- **Minimum**: 100 items for meaningful metrics
- **Recommended**: 500-1000 items per category
- **Gold Standard**: 5000+ items with expert labels

### Labeling Quality

- Use multiple labelers and measure agreement
- Track labeler confidence
- Review disagreements
- Update labels as ground truth changes

### Regular Testing

- Run benchmarks before each release
- Track metrics over time
- Set minimum thresholds (e.g., >80% accuracy)
- Alert on regressions

### Category Balance

Ensure datasets are balanced across:
- Difficulty levels (easy/medium/hard)
- Question types (factual/logical/calculation)
- Domains (science/history/geography/etc.)

## Troubleshooting

### Low Accuracy

1. Check if scoring pipeline is configured correctly
2. Verify LLM provider API keys are valid
3. Review failed predictions manually
4. Check for category-specific issues

### High Calibration Error

1. Increase dataset size (need 100+ samples)
2. Ensure diverse confidence scores in dataset
3. Check for systematic biases
4. Consider retraining calibration model

### Ablation Shows No Impact

1. Feature may not be implemented correctly
2. Dataset may not require that feature
3. Other features may be compensating
4. Check if feature is actually being used in scoring

## API

### BenchmarkHarness

```typescript
import BenchmarkHarness from './src/benchmark/harness';

const harness = new BenchmarkHarness(
  './datasets/factual-qa.json',
  scoringPipeline
);

await harness.loadDataset();
const result = await harness.run({ ablation: true });
harness.printResults(result);
await harness.saveResults(result, './results/latest.json');
```

### CalibrationLayer

```typescript
import CalibrationLayer from './src/benchmark/calibration';

const calibration = new CalibrationLayer('./model.json');
await calibration.load();

const calibratedScore = calibration.calibrate(0.75);

calibration.recordObservation(0.75, true, true);
await calibration.save();

calibration.printStatistics();
```

## Future Enhancements

- [ ] Multi-class calibration (not just binary)
- [ ] Platt scaling as alternative to isotonic regression
- [ ] Temperature scaling for neural network outputs
- [ ] Cross-validation for calibration
- [ ] Automated dataset generation
- [ ] Active learning for hard cases
- [ ] Confidence interval estimation
- [ ] Statistical significance testing

---

**Last Updated**: 2026-01-10
