/**
 * Benchmark Harness Tests
 *
 * Tests the benchmarking system including:
 * - Metric calculations (accuracy, precision, recall, F1)
 * - Calibration error tracking
 * - Category-specific performance
 * - Ablation studies
 * - Historical comparison
 */

import { expect } from 'chai';
import { BenchmarkHarness, BenchmarkDataset, BenchmarkResult } from '../src/benchmark/harness';

describe('BenchmarkHarness', () => {
  let harness: BenchmarkHarness;
  let sampleDataset: BenchmarkDataset;

  beforeEach(() => {
    // Create sample dataset
    sampleDataset = {
      name: 'test-dataset',
      version: '1.0',
      items: [
        {
          id: 'fact-001',
          prompt: 'What is the capital of France?',
          response: 'The capital of France is Paris.',
          groundTruth: {
            isCorrect: true,
            confidence: 1.0,
            category: 'factual-qa',
            claims: ['Paris is the capital of France'],
          },
        },
        {
          id: 'fact-002',
          prompt: 'What is 2 + 2?',
          response: 'The answer is 5.',
          groundTruth: {
            isCorrect: false,
            confidence: 1.0,
            category: 'calculation',
            claims: ['2 + 2 = 5'],
          },
        },
        {
          id: 'fact-003',
          prompt: 'Is the Earth flat?',
          response: 'No, the Earth is an oblate spheroid.',
          groundTruth: {
            isCorrect: true,
            confidence: 1.0,
            category: 'factual-qa',
            claims: ['The Earth is not flat', 'The Earth is an oblate spheroid'],
          },
        },
        {
          id: 'calc-001',
          prompt: 'Calculate 15 * 7',
          response: '105',
          groundTruth: {
            isCorrect: true,
            confidence: 1.0,
            category: 'calculation',
            claims: ['15 * 7 = 105'],
          },
        },
        {
          id: 'logic-001',
          prompt: 'If all cats are animals, and Fluffy is a cat, what can we conclude?',
          response: 'We can conclude that Fluffy is an animal.',
          groundTruth: {
            isCorrect: true,
            confidence: 1.0,
            category: 'logical',
            claims: ['Fluffy is an animal'],
          },
        },
      ],
    };

    harness = new BenchmarkHarness(sampleDataset, mockPredict);
  });

  // ============================================================================
  // METRIC CALCULATION TESTS
  // ============================================================================

  describe('Metric Calculations', () => {
    it('Should calculate accuracy correctly', async () => {
      const result = await harness.run({ ablation: false, verbose: false });

      // 4 correct out of 5 = 80% accuracy
      expect(result.accuracy).to.be.closeTo(0.8, 0.01);
    });

    it('Should calculate precision correctly', async () => {
      const result = await harness.run({ ablation: false, verbose: false });

      // Precision = TP / (TP + FP)
      // If model predicts 4 as correct and all 4 are actually correct: 100%
      expect(result.precision).to.be.greaterThan(0);
      expect(result.precision).to.be.lessThanOrEqual(1);
    });

    it('Should calculate recall correctly', async () => {
      const result = await harness.run({ ablation: false, verbose: false });

      // Recall = TP / (TP + FN)
      expect(result.recall).to.be.greaterThan(0);
      expect(result.recall).to.be.lessThanOrEqual(1);
    });

    it('Should calculate F1 score correctly', async () => {
      const result = await harness.run({ ablation: false, verbose: false });

      // F1 = 2 * (precision * recall) / (precision + recall)
      const expectedF1 = (2 * result.precision * result.recall) / (result.precision + result.recall);

      expect(result.f1Score).to.be.closeTo(expectedF1, 0.01);
    });

    it('Should calculate calibration error', async () => {
      const result = await harness.run({ ablation: false, verbose: false });

      // Calibration error should be >= 0
      expect(result.calibrationError).to.be.greaterThanOrEqual(0);

      // Well-calibrated model should have low ECE (< 0.1)
      expect(result.calibrationError).to.be.lessThan(0.5);
    });
  });

  // ============================================================================
  // CATEGORY-SPECIFIC TESTS
  // ============================================================================

  describe('Category-Specific Performance', () => {
    it('Should track performance by category', async () => {
      const result = await harness.run({ ablation: false, verbose: false });

      expect(result.byCategory).to.have.property('factual-qa');
      expect(result.byCategory).to.have.property('calculation');
      expect(result.byCategory).to.have.property('logical');
    });

    it('Should calculate metrics for each category', async () => {
      const result = await harness.run({ ablation: false, verbose: false });

      for (const category of Object.values(result.byCategory)) {
        expect(category).to.have.property('accuracy');
        expect(category).to.have.property('precision');
        expect(category).to.have.property('recall');
        expect(category).to.have.property('f1Score');
        expect(category).to.have.property('count');
      }
    });

    it('Should show different performance across categories', async () => {
      const result = await harness.run({ ablation: false, verbose: false });

      // Calculation category has 1 wrong and 1 right
      const calcAccuracy = result.byCategory['calculation'].accuracy;

      // Factual-qa has 2 correct
      const factualAccuracy = result.byCategory['factual-qa'].accuracy;

      // Different categories may have different accuracies
      expect(calcAccuracy).to.not.equal(factualAccuracy);
    });
  });

  // ============================================================================
  // ABLATION STUDY TESTS
  // ============================================================================

  describe('Ablation Studies', () => {
    it('Should run ablation studies when requested', async () => {
      const result = await harness.run({ ablation: true, verbose: false });

      expect(result.ablationResults).to.exist;
      expect(result.ablationResults).to.have.property('withoutCitations');
      expect(result.ablationResults).to.have.property('withoutConsensus');
      expect(result.ablationResults).to.have.property('withoutSourceChecks');
    });

    it('Should show performance degradation without features', async () => {
      const result = await harness.run({ ablation: true, verbose: false });

      // Baseline (with all features)
      const baseline = {
        accuracy: result.accuracy,
        f1Score: result.f1Score,
      };

      // Without citations should perform worse
      const withoutCitations = result.ablationResults!.withoutCitations;

      // At least one ablation should show degradation
      const anyDegradation =
        withoutCitations.accuracy < baseline.accuracy ||
        result.ablationResults!.withoutConsensus.accuracy < baseline.accuracy ||
        result.ablationResults!.withoutSourceChecks.accuracy < baseline.accuracy;

      expect(anyDegradation).to.be.true;
    });

    it('Should calculate feature importance', async () => {
      const result = await harness.run({ ablation: true, verbose: false });

      // Feature importance = baseline - ablation
      const citationImportance = result.accuracy - result.ablationResults!.withoutCitations.accuracy;

      expect(citationImportance).to.be.greaterThanOrEqual(0);
    });
  });

  // ============================================================================
  // HISTORICAL TRACKING TESTS
  // ============================================================================

  describe('Historical Tracking', () => {
    it('Should save results to history', async () => {
      await harness.run({ ablation: false, verbose: false });

      const history = harness.getHistory();
      expect(history.length).to.equal(1);
    });

    it('Should track multiple runs', async () => {
      await harness.run({ ablation: false, verbose: false });
      await harness.run({ ablation: false, verbose: false });
      await harness.run({ ablation: false, verbose: false });

      const history = harness.getHistory();
      expect(history.length).to.equal(3);
    });

    it('Should include timestamp in history', async () => {
      const before = Date.now();
      await harness.run({ ablation: false, verbose: false });
      const after = Date.now();

      const history = harness.getHistory();
      const timestamp = history[0].timestamp;

      expect(timestamp).to.be.greaterThanOrEqual(before);
      expect(timestamp).to.be.lessThanOrEqual(after);
    });

    it('Should allow comparing runs', async () => {
      const run1 = await harness.run({ ablation: false, verbose: false });
      const run2 = await harness.run({ ablation: false, verbose: false });

      expect(run1.accuracy).to.equal(run2.accuracy); // Same dataset, same predictor
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe('Edge Cases', () => {
    it('Should handle empty dataset', async () => {
      const emptyDataset: BenchmarkDataset = {
        name: 'empty',
        version: '1.0',
        items: [],
      };

      const emptyHarness = new BenchmarkHarness(emptyDataset, mockPredict);

      await expect(emptyHarness.run({})).to.be.rejectedWith('Dataset is empty');
    });

    it('Should handle all correct predictions', async () => {
      const perfectDataset: BenchmarkDataset = {
        name: 'perfect',
        version: '1.0',
        items: [
          {
            id: '1',
            prompt: 'Test',
            response: 'Test',
            groundTruth: { isCorrect: true, confidence: 1.0, category: 'test', claims: [] },
          },
        ],
      };

      const perfectHarness = new BenchmarkHarness(perfectDataset, mockPerfectPredict);
      const result = await perfectHarness.run({});

      expect(result.accuracy).to.equal(1.0);
      expect(result.precision).to.equal(1.0);
      expect(result.recall).to.equal(1.0);
      expect(result.f1Score).to.equal(1.0);
    });

    it('Should handle all incorrect predictions', async () => {
      const wrongDataset: BenchmarkDataset = {
        name: 'wrong',
        version: '1.0',
        items: [
          {
            id: '1',
            prompt: 'Test',
            response: 'Test',
            groundTruth: { isCorrect: true, confidence: 1.0, category: 'test', claims: [] },
          },
        ],
      };

      const wrongHarness = new BenchmarkHarness(wrongDataset, mockWrongPredict);
      const result = await wrongHarness.run({});

      expect(result.accuracy).to.equal(0.0);
    });

    it('Should handle perfect calibration', async () => {
      // Model that predicts exactly its accuracy as confidence
      const calibratedDataset: BenchmarkDataset = {
        name: 'calibrated',
        version: '1.0',
        items: Array.from({ length: 10 }, (_, i) => ({
          id: `cal-${i}`,
          prompt: `Test ${i}`,
          response: `Response ${i}`,
          groundTruth: {
            isCorrect: i < 8, // 80% correct
            confidence: 0.8,
            category: 'test',
            claims: [],
          },
        })),
      };

      const calibratedHarness = new BenchmarkHarness(calibratedDataset, mockCalibratedPredict);
      const result = await calibratedHarness.run({});

      // Perfect calibration: ECE should be very low
      expect(result.calibrationError).to.be.lessThan(0.05);
    });

    it('Should handle single-category dataset', async () => {
      const singleCatDataset: BenchmarkDataset = {
        name: 'single-cat',
        version: '1.0',
        items: [
          {
            id: '1',
            prompt: 'Q1',
            response: 'A1',
            groundTruth: { isCorrect: true, confidence: 1.0, category: 'only-cat', claims: [] },
          },
          {
            id: '2',
            prompt: 'Q2',
            response: 'A2',
            groundTruth: { isCorrect: false, confidence: 1.0, category: 'only-cat', claims: [] },
          },
        ],
      };

      const singleCatHarness = new BenchmarkHarness(singleCatDataset, mockPredict);
      const result = await singleCatHarness.run({});

      expect(Object.keys(result.byCategory)).to.have.lengthOf(1);
      expect(result.byCategory).to.have.property('only-cat');
    });
  });

  // ============================================================================
  // PERFORMANCE TESTS
  // ============================================================================

  describe('Performance', () => {
    it('Should complete benchmarking in reasonable time', async function () {
      this.timeout(5000); // 5 second timeout

      const start = Date.now();
      await harness.run({ ablation: false, verbose: false });
      const duration = Date.now() - start;

      // Should complete in < 2 seconds for small dataset
      expect(duration).to.be.lessThan(2000);
    });

    it('Should handle large datasets efficiently', async function () {
      this.timeout(10000); // 10 second timeout

      const largeDataset: BenchmarkDataset = {
        name: 'large',
        version: '1.0',
        items: Array.from({ length: 100 }, (_, i) => ({
          id: `large-${i}`,
          prompt: `Prompt ${i}`,
          response: `Response ${i}`,
          groundTruth: {
            isCorrect: i % 2 === 0,
            confidence: 0.9,
            category: `cat-${i % 5}`,
            claims: [`Claim ${i}`],
          },
        })),
      };

      const largeHarness = new BenchmarkHarness(largeDataset, mockFastPredict);

      const start = Date.now();
      await largeHarness.run({ ablation: false, verbose: false });
      const duration = Date.now() - start;

      // Should process 100 items in < 5 seconds
      expect(duration).to.be.lessThan(5000);
    });
  });
});

// ============================================================================
// MOCK PREDICTION FUNCTIONS
// ============================================================================

async function mockPredict(item: any, options: any): Promise<any> {
  // Simple heuristic: if response contains "5" when asking about 2+2, mark wrong
  const isWrong = item.prompt.includes('2 + 2') && item.response.includes('5');

  return {
    predicted: !isWrong,
    confidence: isWrong ? 0.95 : 0.9,
    score: isWrong ? 0.1 : 0.9,
  };
}

async function mockPerfectPredict(item: any, options: any): Promise<any> {
  return {
    predicted: item.groundTruth.isCorrect,
    confidence: 1.0,
    score: item.groundTruth.isCorrect ? 1.0 : 0.0,
  };
}

async function mockWrongPredict(item: any, options: any): Promise<any> {
  return {
    predicted: !item.groundTruth.isCorrect,
    confidence: 0.9,
    score: item.groundTruth.isCorrect ? 0.1 : 0.9,
  };
}

async function mockCalibratedPredict(item: any, options: any): Promise<any> {
  return {
    predicted: item.groundTruth.isCorrect,
    confidence: 0.8, // Matches 80% accuracy
    score: item.groundTruth.isCorrect ? 0.9 : 0.1,
  };
}

async function mockFastPredict(item: any, options: any): Promise<any> {
  // Ultra-fast for performance testing
  return {
    predicted: true,
    confidence: 0.9,
    score: 0.9,
  };
}
