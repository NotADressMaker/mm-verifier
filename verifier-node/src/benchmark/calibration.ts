/**
 * Calibration Layer for MM Verifier
 *
 * Converts raw scoring signals into calibrated probabilities of correctness.
 * Tracks calibration error and adjusts confidence scores over time.
 *
 * Key concepts:
 * - Isotonic regression for calibration
 * - Platt scaling as fallback
 * - Temperature scaling for neural outputs
 * - Historical calibration tracking
 */

import fs from 'fs/promises';
import path from 'path';

interface CalibrationPoint {
  rawScore: number;
  predicted: boolean;
  actual: boolean;
  timestamp: number;
}

interface CalibrationModel {
  type: 'isotonic' | 'platt' | 'temperature';
  bins: CalibrationBin[];
  temperature?: number;
  lastUpdated: number;
  sampleCount: number;
}

interface CalibrationBin {
  minScore: number;
  maxScore: number;
  count: number;
  correctCount: number;
  calibratedProbability: number;
}

export class CalibrationLayer {
  private model: CalibrationModel;
  private history: CalibrationPoint[] = [];
  private readonly historyLimit = 10000;
  private readonly minSamplesForCalibration = 100;

  constructor(private modelPath?: string) {
    // Initialize with uniform calibration (identity function)
    this.model = {
      type: 'isotonic',
      bins: this.createUniformBins(10),
      lastUpdated: Date.now(),
      sampleCount: 0,
    };
  }

  /**
   * Load calibration model from disk
   */
  async load(): Promise<void> {
    if (!this.modelPath) return;

    try {
      const data = await fs.readFile(this.modelPath, 'utf-8');
      const saved = JSON.parse(data);
      this.model = saved.model;
      this.history = saved.history || [];
      console.log(`✓ Loaded calibration model (${this.model.sampleCount} samples)`);
    } catch (error) {
      console.log('ℹ No existing calibration model found, using default');
    }
  }

  /**
   * Save calibration model to disk
   */
  async save(): Promise<void> {
    if (!this.modelPath) return;

    await fs.writeFile(
      this.modelPath,
      JSON.stringify({
        model: this.model,
        history: this.history.slice(-this.historyLimit),
      }, null, 2),
      'utf-8'
    );

    console.log(`✓ Saved calibration model (${this.model.sampleCount} samples)`);
  }

  /**
   * Calibrate a raw score to a probability
   */
  calibrate(rawScore: number): number {
    // Clamp to [0, 1]
    rawScore = Math.max(0, Math.min(1, rawScore));

    if (this.model.sampleCount < this.minSamplesForCalibration) {
      // Not enough data, return raw score
      return rawScore;
    }

    // Find appropriate bin
    const bin = this.findBin(rawScore);

    if (!bin || bin.count < 5) {
      // Bin has too few samples, use raw score
      return rawScore;
    }

    // Return calibrated probability
    return bin.calibratedProbability;
  }

  /**
   * Record observation for calibration
   */
  recordObservation(
    rawScore: number,
    predicted: boolean,
    actual: boolean
  ): void {
    const point: CalibrationPoint = {
      rawScore,
      predicted,
      actual,
      timestamp: Date.now(),
    };

    this.history.push(point);

    // Limit history size
    if (this.history.length > this.historyLimit) {
      this.history = this.history.slice(-this.historyLimit);
    }

    // Update model if needed
    if (this.history.length % 100 === 0) {
      this.updateModel();
    }
  }

  /**
   * Update calibration model from history
   */
  private updateModel(): void {
    if (this.history.length < this.minSamplesForCalibration) {
      return;
    }

    console.log(`🔄 Updating calibration model with ${this.history.length} samples...`);

    // Use isotonic regression
    this.model = {
      type: 'isotonic',
      bins: this.computeIsotonicBins(),
      lastUpdated: Date.now(),
      sampleCount: this.history.length,
    };

    console.log(`✓ Model updated (ECE: ${this.getExpectedCalibrationError().toFixed(4)})`);
  }

  /**
   * Compute isotonic regression bins
   */
  private computeIsotonicBins(numBins: number = 10): CalibrationBin[] {
    const bins: CalibrationBin[] = this.createUniformBins(numBins);

    // Assign observations to bins
    for (const point of this.history) {
      const binIndex = Math.min(
        Math.floor(point.rawScore * numBins),
        numBins - 1
      );

      bins[binIndex].count++;
      if (point.actual) {
        bins[binIndex].correctCount++;
      }
    }

    // Calculate calibrated probabilities
    for (const bin of bins) {
      if (bin.count > 0) {
        bin.calibratedProbability = bin.correctCount / bin.count;
      }
    }

    // Ensure monotonicity (isotonic regression)
    this.enforceMonotonicity(bins);

    return bins;
  }

  /**
   * Enforce monotonicity in bin probabilities
   */
  private enforceMonotonicity(bins: CalibrationBin[]): void {
    // Simple PAV algorithm (Pool Adjacent Violators)
    for (let i = 1; i < bins.length; i++) {
      if (bins[i].calibratedProbability < bins[i - 1].calibratedProbability) {
        // Merge bins
        const totalCount = bins[i].count + bins[i - 1].count;
        const totalCorrect = bins[i].correctCount + bins[i - 1].correctCount;

        bins[i - 1].count = totalCount;
        bins[i - 1].correctCount = totalCorrect;
        bins[i - 1].calibratedProbability = totalCorrect / totalCount;

        bins[i].count = totalCount;
        bins[i].correctCount = totalCorrect;
        bins[i].calibratedProbability = totalCorrect / totalCount;
      }
    }
  }

  /**
   * Find bin for a given score
   */
  private findBin(score: number): CalibrationBin | null {
    for (const bin of this.model.bins) {
      if (score >= bin.minScore && score < bin.maxScore) {
        return bin;
      }
    }

    // Edge case: score === 1.0
    if (score === 1.0) {
      return this.model.bins[this.model.bins.length - 1];
    }

    return null;
  }

  /**
   * Create uniform bins
   */
  private createUniformBins(numBins: number): CalibrationBin[] {
    const bins: CalibrationBin[] = [];
    const binSize = 1.0 / numBins;

    for (let i = 0; i < numBins; i++) {
      bins.push({
        minScore: i * binSize,
        maxScore: (i + 1) * binSize,
        count: 0,
        correctCount: 0,
        calibratedProbability: (i + 0.5) * binSize, // Default to bin center
      });
    }

    return bins;
  }

  /**
   * Calculate Expected Calibration Error (ECE)
   */
  getExpectedCalibrationError(): number {
    let totalError = 0;
    let totalCount = 0;

    for (const bin of this.model.bins) {
      if (bin.count === 0) continue;

      const avgConfidence = (bin.minScore + bin.maxScore) / 2;
      const accuracy = bin.correctCount / bin.count;
      const error = Math.abs(avgConfidence - accuracy);

      totalError += error * bin.count;
      totalCount += bin.count;
    }

    return totalCount > 0 ? totalError / totalCount : 0;
  }

  /**
   * Get calibration statistics
   */
  getStatistics(): {
    sampleCount: number;
    expectedCalibrationError: number;
    maxCalibrationError: number;
    bins: Array<{
      range: string;
      count: number;
      accuracy: number;
      calibratedProb: number;
    }>;
  } {
    const bins = this.model.bins.map(bin => ({
      range: `${bin.minScore.toFixed(2)}-${bin.maxScore.toFixed(2)}`,
      count: bin.count,
      accuracy: bin.count > 0 ? bin.correctCount / bin.count : 0,
      calibratedProb: bin.calibratedProbability,
    }));

    const ece = this.getExpectedCalibrationError();
    const mce = Math.max(
      ...this.model.bins
        .filter(b => b.count > 0)
        .map(b => {
          const avgConf = (b.minScore + b.maxScore) / 2;
          const acc = b.correctCount / b.count;
          return Math.abs(avgConf - acc);
        })
    );

    return {
      sampleCount: this.model.sampleCount,
      expectedCalibrationError: ece,
      maxCalibrationError: mce,
      bins,
    };
  }

  /**
   * Print calibration statistics
   */
  printStatistics(): void {
    const stats = this.getStatistics();

    console.log('\n📊 Calibration Statistics\n');
    console.log(`Samples:                ${stats.sampleCount}`);
    console.log(`Expected Calib. Error:  ${stats.expectedCalibrationError.toFixed(4)}`);
    console.log(`Max Calibration Error:  ${stats.maxCalibrationError.toFixed(4)}`);
    console.log('\nCalibration Bins:');
    console.log('  Range      Count  Accuracy  Calibrated');
    console.log('  ' + '-'.repeat(48));

    for (const bin of stats.bins) {
      if (bin.count === 0) continue;

      console.log(
        `  ${bin.range.padEnd(10)} ` +
        `${bin.count.toString().padStart(5)}  ` +
        `${(bin.accuracy * 100).toFixed(1).padStart(6)}%  ` +
        `${(bin.calibratedProb * 100).toFixed(1).padStart(6)}%`
      );
    }

    console.log('');
  }
}

// Example usage
if (require.main === module) {
  (async () => {
    const calibration = new CalibrationLayer('./calibration-model.json');
    await calibration.load();

    // Simulate some observations
    const testData = [
      { rawScore: 0.9, actual: true },
      { rawScore: 0.85, actual: true },
      { rawScore: 0.8, actual: false },
      { rawScore: 0.7, actual: true },
      { rawScore: 0.6, actual: false },
      { rawScore: 0.5, actual: false },
      { rawScore: 0.4, actual: false },
      { rawScore: 0.3, actual: false },
      { rawScore: 0.2, actual: false },
      { rawScore: 0.1, actual: false },
    ];

    for (const data of testData) {
      const predicted = data.rawScore > 0.5;
      calibration.recordObservation(data.rawScore, predicted, data.actual);
    }

    // Calibrate a new score
    const rawScore = 0.75;
    const calibrated = calibration.calibrate(rawScore);
    console.log(`Raw score: ${rawScore} → Calibrated: ${calibrated.toFixed(4)}`);

    calibration.printStatistics();
    await calibration.save();
  })();
}

export default CalibrationLayer;
