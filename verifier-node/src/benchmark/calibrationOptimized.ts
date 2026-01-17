/**
 * Optimized Calibration Layer with Batch Processing
 *
 * Performance Improvements:
 * - Batch processing for observations
 * - Async model updates without blocking
 * - Lazy loading and saving
 * - Optimized bin computation
 * - Background model persistence
 */

import fs from 'fs/promises';
import { EventEmitter } from 'events';

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

export class OptimizedCalibrationLayer extends EventEmitter {
  private model: CalibrationModel;
  private history: CalibrationPoint[] = [];
  private pendingObservations: CalibrationPoint[] = [];
  private readonly historyLimit = 10000;
  private readonly minSamplesForCalibration = 100;
  private readonly batchSize = 50; // Process in batches of 50
  private updateInProgress = false;
  private saveScheduled = false;

  constructor(private modelPath?: string) {
    super();

    // Initialize with uniform calibration (identity function)
    this.model = {
      type: 'isotonic',
      bins: this.createUniformBins(10),
      lastUpdated: Date.now(),
      sampleCount: 0,
    };

    // Schedule periodic batch processing
    this.startBatchProcessor();
  }

  /**
   * Load calibration model from disk (async, non-blocking)
   */
  async load(): Promise<void> {
    if (!this.modelPath) return;

    try {
      const data = await fs.readFile(this.modelPath, 'utf-8');
      const saved = JSON.parse(data);
      this.model = saved.model;
      this.history = saved.history || [];
      console.log(`✓ Loaded calibration model (${this.model.sampleCount} samples)`);
      this.emit('loaded', this.model.sampleCount);
    } catch (error) {
      console.log('ℹ No existing calibration model found, using default');
    }
  }

  /**
   * Save calibration model to disk (async, non-blocking)
   */
  async save(): Promise<void> {
    if (!this.modelPath) return;

    try {
      await fs.writeFile(
        this.modelPath,
        JSON.stringify(
          {
            model: this.model,
            history: this.history.slice(-this.historyLimit),
          },
          null,
          2
        ),
        'utf-8'
      );

      console.log(`✓ Saved calibration model (${this.model.sampleCount} samples)`);
      this.emit('saved', this.model.sampleCount);
    } catch (error) {
      console.error('Failed to save calibration model:', error);
    }
  }

  /**
   * Calibrate a raw score to a probability (fast path)
   */
  calibrate(rawScore: number): number {
    // Clamp to [0, 1]
    rawScore = Math.max(0, Math.min(1, rawScore));

    if (this.model.sampleCount < this.minSamplesForCalibration) {
      return rawScore;
    }

    const bin = this.findBinOptimized(rawScore);

    if (!bin || bin.count < 5) {
      return rawScore;
    }

    return bin.calibratedProbability;
  }

  /**
   * Record observation (batched, non-blocking)
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

    this.pendingObservations.push(point);

    // Trigger batch processing if batch size reached
    if (this.pendingObservations.length >= this.batchSize) {
      this.processBatch();
    }
  }

  /**
   * Record multiple observations at once (batch insert)
   */
  recordObservationsBatch(
    observations: Array<{
      rawScore: number;
      predicted: boolean;
      actual: boolean;
    }>
  ): void {
    const now = Date.now();
    const points = observations.map((obs) => ({
      ...obs,
      timestamp: now,
    }));

    this.pendingObservations.push(...points);

    // Trigger batch processing
    this.processBatch();
  }

  /**
   * Process pending observations in batch
   */
  private processBatch(): void {
    if (this.pendingObservations.length === 0) return;

    // Move pending observations to history
    const batch = this.pendingObservations.splice(0, this.batchSize);
    this.history.push(...batch);

    // Limit history size
    if (this.history.length > this.historyLimit) {
      this.history = this.history.slice(-this.historyLimit);
    }

    // Update model asynchronously if we have enough new samples
    const newSampleCount = this.history.length - this.model.sampleCount;
    if (newSampleCount >= this.batchSize && !this.updateInProgress) {
      this.updateModelAsync();
    }
  }

  /**
   * Start background batch processor
   */
  private startBatchProcessor(): void {
    // Process pending observations every 5 seconds
    setInterval(() => {
      if (this.pendingObservations.length > 0) {
        this.processBatch();
      }
    }, 5000);

    // Save model every minute if there are updates
    setInterval(() => {
      if (this.saveScheduled && !this.updateInProgress) {
        this.save();
        this.saveScheduled = false;
      }
    }, 60000);
  }

  /**
   * Update calibration model asynchronously (non-blocking)
   */
  private async updateModelAsync(): Promise<void> {
    if (this.history.length < this.minSamplesForCalibration) {
      return;
    }

    this.updateInProgress = true;

    // Use setImmediate to allow event loop to process other tasks
    await new Promise((resolve) => setImmediate(resolve));

    console.log(`🔄 Updating calibration model with ${this.history.length} samples...`);

    const startTime = Date.now();

    // Compute new bins
    const newBins = this.computeIsotonicBinsOptimized();

    // Update model
    this.model = {
      type: 'isotonic',
      bins: newBins,
      lastUpdated: Date.now(),
      sampleCount: this.history.length,
    };

    const duration = Date.now() - startTime;

    console.log(
      `✓ Model updated in ${duration}ms (ECE: ${this.getExpectedCalibrationError().toFixed(4)})`
    );

    this.updateInProgress = false;
    this.saveScheduled = true;

    this.emit('updated', {
      sampleCount: this.model.sampleCount,
      ece: this.getExpectedCalibrationError(),
      duration,
    });
  }

  /**
   * Optimized isotonic bin computation with early exit
   */
  private computeIsotonicBinsOptimized(numBins: number = 10): CalibrationBin[] {
    const bins: CalibrationBin[] = this.createUniformBins(numBins);

    // Single pass through history
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

    // Enforce monotonicity (optimized PAV algorithm)
    this.enforceMonotonicityOptimized(bins);

    return bins;
  }

  /**
   * Optimized monotonicity enforcement
   */
  private enforceMonotonicityOptimized(bins: CalibrationBin[]): void {
    // Pool Adjacent Violators with single pass
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 1; i < bins.length; i++) {
        if (bins[i].calibratedProbability < bins[i - 1].calibratedProbability) {
          const totalCount = bins[i].count + bins[i - 1].count;
          const totalCorrect = bins[i].correctCount + bins[i - 1].correctCount;
          const mergedProb = totalCorrect / totalCount;

          bins[i - 1].count = totalCount;
          bins[i - 1].correctCount = totalCorrect;
          bins[i - 1].calibratedProbability = mergedProb;

          bins[i].count = totalCount;
          bins[i].correctCount = totalCorrect;
          bins[i].calibratedProbability = mergedProb;

          changed = true;
        }
      }
    }
  }

  /**
   * Optimized bin finder with binary search
   */
  private findBinOptimized(score: number): CalibrationBin | null {
    // Binary search for faster lookup
    const bins = this.model.bins;
    let left = 0;
    let right = bins.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const bin = bins[mid];

      if (score >= bin.minScore && score < bin.maxScore) {
        return bin;
      } else if (score < bin.minScore) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }

    // Edge case: score === 1.0
    if (score === 1.0) {
      return bins[bins.length - 1];
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
        calibratedProbability: (i + 0.5) * binSize,
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
    pendingCount: number;
    expectedCalibrationError: number;
    maxCalibrationError: number;
    updateInProgress: boolean;
    bins: Array<{
      range: string;
      count: number;
      accuracy: number;
      calibratedProb: number;
    }>;
  } {
    const bins = this.model.bins.map((bin) => ({
      range: `${bin.minScore.toFixed(2)}-${bin.maxScore.toFixed(2)}`,
      count: bin.count,
      accuracy: bin.count > 0 ? bin.correctCount / bin.count : 0,
      calibratedProb: bin.calibratedProbability,
    }));

    const ece = this.getExpectedCalibrationError();
    const mce = Math.max(
      ...this.model.bins
        .filter((b) => b.count > 0)
        .map((b) => {
          const avgConf = (b.minScore + b.maxScore) / 2;
          const acc = b.correctCount / b.count;
          return Math.abs(avgConf - acc);
        })
    );

    return {
      sampleCount: this.model.sampleCount,
      pendingCount: this.pendingObservations.length,
      expectedCalibrationError: ece,
      maxCalibrationError: mce,
      updateInProgress: this.updateInProgress,
      bins,
    };
  }

  /**
   * Force immediate batch processing and model update
   */
  async flush(): Promise<void> {
    // Process all pending observations
    while (this.pendingObservations.length > 0) {
      this.processBatch();
    }

    // Wait for any in-progress update
    while (this.updateInProgress) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Force model update if needed
    if (this.history.length !== this.model.sampleCount) {
      await this.updateModelAsync();
    }

    // Save immediately
    await this.save();
  }
}

export default OptimizedCalibrationLayer;
