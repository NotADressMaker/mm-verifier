import { ethers } from 'ethers';
import fs from 'fs/promises';
import path from 'path';

/**
 * Benchmark Harness for MAMV Scoring System
 *
 * Evaluates scoring pipeline on labeled datasets to measure:
 * - Precision/Recall
 * - Calibration error
 * - Agreement by category
 * - Feature ablation (with/without citations, consensus, etc.)
 *
 * Usage:
 * npm run benchmark -- --dataset=factual-qa --models=gpt-4,claude-3
 */

interface BenchmarkItem {
  id: string;
  prompt: string;
  response: string;
  groundTruth: {
    isCorrect: boolean;
    confidence: number; // 0-1
    category: string;   // factual-qa, reasoning, coding, etc.
    claims?: string[];
  };
  metadata?: {
    domain?: string;
    difficulty?: string;
    sources?: string[];
  };
}

interface BenchmarkResult {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  calibrationError: number;
  byCategory: Record<string, CategoryMetrics>;
  ablationResults?: AblationResults;
}

interface CategoryMetrics {
  count: number;
  accuracy: number;
  avgConfidence: number;
  calibrationError: number;
}

interface AblationResults {
  baseline: ModelMetrics;
  withoutCitations: ModelMetrics;
  withoutConsensus: ModelMetrics;
  withoutSourceChecks: ModelMetrics;
}

interface ModelMetrics {
  accuracy: number;
  precision: number;
  recall: number;
}

interface PredictionResult {
  predicted: boolean;
  confidence: number;
  category: string;
  features: {
    hasCitations: boolean;
    hasConsensus: boolean;
    hasSourceChecks: boolean;
  };
}

export class BenchmarkHarness {
  private dataset: BenchmarkItem[] = [];
  private results: PredictionResult[] = [];

  constructor(
    private datasetPath: string,
    private scoringPipeline: any // Your scoring pipeline
  ) {}

  /**
   * Load benchmark dataset from JSON file
   */
  async loadDataset(): Promise<void> {
    const data = await fs.readFile(this.datasetPath, 'utf-8');
    this.dataset = JSON.parse(data);
    console.log(`✓ Loaded ${this.dataset.length} benchmark items`);
  }

  /**
   * Run benchmark evaluation
   */
  async run(options: {
    ablation?: boolean;
    verbose?: boolean;
  } = {}): Promise<BenchmarkResult> {
    console.log('\n🔬 Running benchmark evaluation...\n');

    // Run predictions
    for (const item of this.dataset) {
      const prediction = await this.predict(item, {
        useCitations: true,
        useConsensus: true,
        useSourceChecks: true,
      });

      this.results.push(prediction);

      if (options.verbose) {
        console.log(`✓ ${item.id}: ${prediction.predicted} (confidence: ${prediction.confidence.toFixed(2)})`);
      }
    }

    // Calculate metrics
    const result = this.calculateMetrics();

    // Run ablation studies if requested
    if (options.ablation) {
      result.ablationResults = await this.runAblationStudies();
    }

    return result;
  }

  /**
   * Predict correctness for a single item
   */
  private async predict(
    item: BenchmarkItem,
    features: {
      useCitations: boolean;
      useConsensus: boolean;
      useSourceChecks: boolean;
    }
  ): Promise<PredictionResult> {
    // Run through scoring pipeline
    const score = await this.scoringPipeline.evaluate({
      prompt: item.prompt,
      response: item.response,
      features,
    });

    return {
      predicted: score.isCorrect,
      confidence: score.confidence,
      category: item.groundTruth.category,
      features: {
        hasCitations: features.useCitations,
        hasConsensus: features.useConsensus,
        hasSourceChecks: features.useSourceChecks,
      },
    };
  }

  /**
   * Calculate precision, recall, F1, calibration
   */
  private calculateMetrics(): BenchmarkResult {
    let truePositives = 0;
    let falsePositives = 0;
    let trueNegatives = 0;
    let falseNegatives = 0;

    const byCategory: Record<string, {
      correct: number;
      total: number;
      confidenceSum: number;
      calibrationErrorSum: number;
    }> = {};

    let totalCalibrationError = 0;

    for (let i = 0; i < this.dataset.length; i++) {
      const item = this.dataset[i];
      const prediction = this.results[i];

      const actual = item.groundTruth.isCorrect;
      const predicted = prediction.predicted;

      // Confusion matrix
      if (predicted && actual) truePositives++;
      else if (predicted && !actual) falsePositives++;
      else if (!predicted && !actual) trueNegatives++;
      else if (!predicted && actual) falseNegatives++;

      // Calibration error: |confidence - correctness|
      const calibrationError = Math.abs(
        prediction.confidence - (actual ? 1 : 0)
      );
      totalCalibrationError += calibrationError;

      // By category
      const category = item.groundTruth.category;
      if (!byCategory[category]) {
        byCategory[category] = {
          correct: 0,
          total: 0,
          confidenceSum: 0,
          calibrationErrorSum: 0,
        };
      }

      byCategory[category].total++;
      byCategory[category].confidenceSum += prediction.confidence;
      byCategory[category].calibrationErrorSum += calibrationError;

      if (predicted === actual) {
        byCategory[category].correct++;
      }
    }

    // Calculate metrics
    const accuracy = (truePositives + trueNegatives) / this.dataset.length;
    const precision = truePositives / (truePositives + falsePositives) || 0;
    const recall = truePositives / (truePositives + falseNegatives) || 0;
    const f1Score = (2 * precision * recall) / (precision + recall) || 0;
    const calibrationError = totalCalibrationError / this.dataset.length;

    // Format category metrics
    const categoryMetrics: Record<string, CategoryMetrics> = {};
    for (const [category, stats] of Object.entries(byCategory)) {
      categoryMetrics[category] = {
        count: stats.total,
        accuracy: stats.correct / stats.total,
        avgConfidence: stats.confidenceSum / stats.total,
        calibrationError: stats.calibrationErrorSum / stats.total,
      };
    }

    return {
      accuracy,
      precision,
      recall,
      f1Score,
      calibrationError,
      byCategory: categoryMetrics,
    };
  }

  /**
   * Run ablation studies: test with/without features
   */
  private async runAblationStudies(): Promise<AblationResults> {
    console.log('\n🔬 Running ablation studies...\n');

    const configs = [
      { name: 'baseline', useCitations: true, useConsensus: true, useSourceChecks: true },
      { name: 'withoutCitations', useCitations: false, useConsensus: true, useSourceChecks: true },
      { name: 'withoutConsensus', useCitations: true, useConsensus: false, useSourceChecks: true },
      { name: 'withoutSourceChecks', useCitations: true, useConsensus: true, useSourceChecks: false },
    ];

    const results: any = {};

    for (const config of configs) {
      console.log(`  Testing: ${config.name}...`);

      let tp = 0, fp = 0, tn = 0, fn = 0;

      for (const item of this.dataset) {
        const prediction = await this.predict(item, {
          useCitations: config.useCitations,
          useConsensus: config.useConsensus,
          useSourceChecks: config.useSourceChecks,
        });

        const actual = item.groundTruth.isCorrect;
        const predicted = prediction.predicted;

        if (predicted && actual) tp++;
        else if (predicted && !actual) fp++;
        else if (!predicted && !actual) tn++;
        else if (!predicted && actual) fn++;
      }

      const accuracy = (tp + tn) / this.dataset.length;
      const precision = tp / (tp + fp) || 0;
      const recall = tp / (tp + fn) || 0;

      results[config.name] = { accuracy, precision, recall };

      console.log(`    Accuracy: ${(accuracy * 100).toFixed(1)}%`);
    }

    return results;
  }

  /**
   * Print formatted results
   */
  printResults(result: BenchmarkResult): void {
    console.log('\n' + '='.repeat(60));
    console.log('📊 BENCHMARK RESULTS');
    console.log('='.repeat(60) + '\n');

    console.log('Overall Metrics:');
    console.log(`  Accuracy:          ${(result.accuracy * 100).toFixed(2)}%`);
    console.log(`  Precision:         ${(result.precision * 100).toFixed(2)}%`);
    console.log(`  Recall:            ${(result.recall * 100).toFixed(2)}%`);
    console.log(`  F1 Score:          ${(result.f1Score * 100).toFixed(2)}%`);
    console.log(`  Calibration Error: ${result.calibrationError.toFixed(4)}\n`);

    console.log('By Category:');
    for (const [category, metrics] of Object.entries(result.byCategory)) {
      console.log(`  ${category} (n=${metrics.count}):`);
      console.log(`    Accuracy:          ${(metrics.accuracy * 100).toFixed(2)}%`);
      console.log(`    Avg Confidence:    ${(metrics.avgConfidence * 100).toFixed(2)}%`);
      console.log(`    Calibration Error: ${metrics.calibrationError.toFixed(4)}`);
    }

    if (result.ablationResults) {
      console.log('\nAblation Study Results:');
      for (const [name, metrics] of Object.entries(result.ablationResults)) {
        console.log(`  ${name}:`);
        console.log(`    Accuracy:  ${(metrics.accuracy * 100).toFixed(2)}%`);
        console.log(`    Precision: ${(metrics.precision * 100).toFixed(2)}%`);
        console.log(`    Recall:    ${(metrics.recall * 100).toFixed(2)}%`);
      }
    }

    console.log('\n' + '='.repeat(60) + '\n');
  }

  /**
   * Save results to JSON
   */
  async saveResults(result: BenchmarkResult, outputPath: string): Promise<void> {
    await fs.writeFile(
      outputPath,
      JSON.stringify(result, null, 2),
      'utf-8'
    );
    console.log(`✓ Results saved to ${outputPath}`);
  }

  /**
   * Generate calibration plot data
   */
  generateCalibrationPlot(): { predicted: number; actual: number }[] {
    const bins = 10;
    const binSize = 1 / bins;
    const calibrationData: { predicted: number; actual: number }[] = [];

    for (let i = 0; i < bins; i++) {
      const binStart = i * binSize;
      const binEnd = (i + 1) * binSize;

      const binItems = this.results.filter(
        r => r.confidence >= binStart && r.confidence < binEnd
      );

      if (binItems.length === 0) continue;

      const avgConfidence = binItems.reduce((sum, r) => sum + r.confidence, 0) / binItems.length;
      const actualCorrect = binItems.filter(
        (r, idx) => this.dataset[idx].groundTruth.isCorrect
      ).length / binItems.length;

      calibrationData.push({
        predicted: avgConfidence,
        actual: actualCorrect,
      });
    }

    return calibrationData;
  }
}

// Example usage
if (require.main === module) {
  (async () => {
    const harness = new BenchmarkHarness(
      './benchmarks/datasets/factual-qa.json',
      null // Your scoring pipeline here
    );

    await harness.loadDataset();
    const result = await harness.run({ ablation: true, verbose: false });
    harness.printResults(result);
    await harness.saveResults(result, './benchmarks/results/latest.json');

    // Generate calibration plot
    const calibrationData = harness.generateCalibrationPlot();
    await fs.writeFile(
      './benchmarks/results/calibration.json',
      JSON.stringify(calibrationData, null, 2)
    );
  })();
}

export default BenchmarkHarness;
