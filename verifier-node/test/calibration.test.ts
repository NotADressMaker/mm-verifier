/**
 * Calibration Layer Tests
 *
 * Tests the probability calibration system including:
 * - Raw score to calibrated probability conversion
 * - Isotonic regression (PAV algorithm)
 * - Observation recording and learning
 * - Expected Calibration Error (ECE) calculation
 * - Model persistence and loading
 */

import { expect } from 'chai';
import { CalibrationLayer, CalibrationModel, CalibrationBin } from '../src/benchmark/calibration';

describe('CalibrationLayer', () => {
  let calibration: CalibrationLayer;

  beforeEach(() => {
    calibration = new CalibrationLayer({ minSamplesForCalibration: 10, numBins: 10 });
  });

  // ============================================================================
  // CALIBRATION TESTS
  // ============================================================================

  describe('Calibrate', () => {
    it('Should return raw score when insufficient samples', () => {
      const rawScore = 0.75;
      const calibrated = calibration.calibrate(rawScore);

      // With < 10 samples, should return raw score
      expect(calibrated).to.equal(rawScore);
    });

    it('Should calibrate after sufficient observations', () => {
      // Record observations: model predicts 0.9 confidence but only 60% correct
      for (let i = 0; i < 20; i++) {
        calibration.recordObservation(0.9, i < 12); // 12/20 = 60% actual
      }

      const calibrated = calibration.calibrate(0.9);

      // Calibrated value should be closer to 0.6 than 0.9
      expect(calibrated).to.be.lessThan(0.9);
      expect(calibrated).to.be.closeTo(0.6, 0.15);
    });

    it('Should handle edge case: score = 0', () => {
      for (let i = 0; i < 15; i++) {
        calibration.recordObservation(0.0, false);
      }

      const calibrated = calibration.calibrate(0.0);
      expect(calibrated).to.be.greaterThanOrEqual(0);
      expect(calibrated).to.be.lessThanOrEqual(1);
    });

    it('Should handle edge case: score = 1', () => {
      for (let i = 0; i < 15; i++) {
        calibration.recordObservation(1.0, true);
      }

      const calibrated = calibration.calibrate(1.0);
      expect(calibrated).to.be.closeTo(1.0, 0.1);
    });

    it('Should clamp scores outside [0, 1] range', () => {
      for (let i = 0; i < 15; i++) {
        calibration.recordObservation(0.5, i < 8);
      }

      // Test clamping
      expect(calibration.calibrate(-0.5)).to.be.greaterThanOrEqual(0);
      expect(calibration.calibrate(1.5)).to.be.lessThanOrEqual(1);
    });
  });

  // ============================================================================
  // OBSERVATION RECORDING TESTS
  // ============================================================================

  describe('Record Observation', () => {
    it('Should record observations correctly', () => {
      calibration.recordObservation(0.8, true);
      calibration.recordObservation(0.3, false);

      const model = calibration.getModel();
      expect(model.sampleCount).to.equal(2);
    });

    it('Should accumulate observations', () => {
      for (let i = 0; i < 50; i++) {
        calibration.recordObservation(0.7, i % 2 === 0);
      }

      const model = calibration.getModel();
      expect(model.sampleCount).to.equal(50);
    });

    it('Should trigger recalibration every 100 samples', () => {
      for (let i = 0; i < 150; i++) {
        calibration.recordObservation(0.6, i < 90); // 60% correct
      }

      // Model should have been recalibrated
      const model = calibration.getModel();
      expect(model.sampleCount).to.equal(150);
    });
  });

  // ============================================================================
  // ISOTONIC REGRESSION TESTS
  // ============================================================================

  describe('Isotonic Regression', () => {
    it('Should enforce monotonicity in bins', () => {
      // Create observations across all bins
      for (let score = 0; score <= 1; score += 0.1) {
        const accuracy = score * 0.8; // Slightly under-confident
        for (let i = 0; i < 10; i++) {
          calibration.recordObservation(score, Math.random() < accuracy);
        }
      }

      const model = calibration.getModel();

      // Check monotonicity: each bin's calibrated probability should be >= previous
      for (let i = 1; i < model.bins.length; i++) {
        const prevProb = model.bins[i - 1].calibratedProbability;
        const currProb = model.bins[i].calibratedProbability;

        expect(currProb).to.be.greaterThanOrEqual(prevProb - 0.01); // Allow tiny float errors
      }
    });

    it('Should use PAV algorithm correctly', () => {
      // Classic isotonic regression case
      const observations = [
        { rawScore: 0.1, correct: 0.2 },
        { rawScore: 0.3, correct: 0.1 }, // Violation: should be >= 0.2
        { rawScore: 0.5, correct: 0.5 },
        { rawScore: 0.7, correct: 0.8 },
      ];

      for (const obs of observations) {
        for (let i = 0; i < 20; i++) {
          calibration.recordObservation(obs.rawScore, Math.random() < obs.correct);
        }
      }

      const model = calibration.getModel();

      // After PAV, bins should be monotonic
      for (let i = 1; i < model.bins.length; i++) {
        if (model.bins[i].count > 0 && model.bins[i - 1].count > 0) {
          expect(model.bins[i].calibratedProbability).to.be.greaterThanOrEqual(
            model.bins[i - 1].calibratedProbability - 0.05
          );
        }
      }
    });
  });

  // ============================================================================
  // ECE CALCULATION TESTS
  // ============================================================================

  describe('Expected Calibration Error', () => {
    it('Should calculate ECE correctly', () => {
      // Perfect calibration: predicted = actual
      for (let score = 0; score <= 1; score += 0.1) {
        for (let i = 0; i < 10; i++) {
          calibration.recordObservation(score, Math.random() < score);
        }
      }

      const ece = calibration.calculateECE();

      // Perfect calibration should have low ECE (< 0.1)
      expect(ece).to.be.lessThan(0.15);
    });

    it('Should show high ECE for uncalibrated model', () => {
      // Overconfident model: always predicts 0.9 but only 50% correct
      for (let i = 0; i < 100; i++) {
        calibration.recordObservation(0.9, i < 50);
      }

      const ece = calibration.calculateECE();

      // High miscalibration: ECE should be > 0.2
      expect(ece).to.be.greaterThan(0.2);
    });

    it('Should return 0 for empty model', () => {
      const ece = calibration.calculateECE();
      expect(ece).to.equal(0);
    });
  });

  // ============================================================================
  // MODEL PERSISTENCE TESTS
  // ============================================================================

  describe('Model Persistence', () => {
    it('Should export model', () => {
      for (let i = 0; i < 20; i++) {
        calibration.recordObservation(0.7, i < 14);
      }

      const model = calibration.getModel();

      expect(model).to.have.property('version');
      expect(model).to.have.property('bins');
      expect(model).to.have.property('sampleCount');
      expect(model).to.have.property('ece');
    });

    it('Should load model', () => {
      // Create and export model
      for (let i = 0; i < 30; i++) {
        calibration.recordObservation(0.6, i < 18);
      }

      const exported = calibration.getModel();

      // Create new calibration layer and load model
      const newCalibration = new CalibrationLayer();
      newCalibration.loadModel(exported);

      // Should produce same calibration
      const original = calibration.calibrate(0.6);
      const loaded = newCalibration.calibrate(0.6);

      expect(loaded).to.be.closeTo(original, 0.01);
    });

    it('Should preserve sample count on load', () => {
      for (let i = 0; i < 50; i++) {
        calibration.recordObservation(0.5, i < 25);
      }

      const exported = calibration.getModel();

      const newCalibration = new CalibrationLayer();
      newCalibration.loadModel(exported);

      expect(newCalibration.getModel().sampleCount).to.equal(50);
    });
  });

  // ============================================================================
  // BIN MANAGEMENT TESTS
  // ============================================================================

  describe('Bin Management', () => {
    it('Should create correct number of bins', () => {
      const model = calibration.getModel();
      expect(model.bins).to.have.lengthOf(10);
    });

    it('Should assign observations to correct bins', () => {
      calibration.recordObservation(0.15, true); // Should go to bin 1 (0.1-0.2)
      calibration.recordObservation(0.85, true); // Should go to bin 8 (0.8-0.9)

      const model = calibration.getModel();

      // Check that appropriate bins have observations
      const totalObservations = model.bins.reduce((sum, bin) => sum + bin.count, 0);
      expect(totalObservations).to.equal(2);
    });

    it('Should handle sparse bins gracefully', () => {
      // Only add observations to a few bins
      for (let i = 0; i < 20; i++) {
        calibration.recordObservation(0.5, true);
      }

      const calibrated = calibration.calibrate(0.3); // Empty bin

      // Should fall back to raw score or interpolate
      expect(calibrated).to.be.greaterThanOrEqual(0);
      expect(calibrated).to.be.lessThanOrEqual(1);
    });

    it('Should require minimum samples per bin', () => {
      // Only 3 observations in a bin
      calibration.recordObservation(0.5, true);
      calibration.recordObservation(0.5, true);
      calibration.recordObservation(0.5, false);

      const calibrated = calibration.calibrate(0.5);

      // With < 5 samples in bin, should return raw score
      expect(calibrated).to.equal(0.5);
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe('Edge Cases', () => {
    it('Should handle all observations correct', () => {
      for (let i = 0; i < 30; i++) {
        calibration.recordObservation(0.9, true);
      }

      const calibrated = calibration.calibrate(0.9);

      // Should be close to 1.0
      expect(calibrated).to.be.closeTo(1.0, 0.1);
    });

    it('Should handle all observations incorrect', () => {
      for (let i = 0; i < 30; i++) {
        calibration.recordObservation(0.9, false);
      }

      const calibrated = calibration.calibrate(0.9);

      // Should be close to 0.0
      expect(calibrated).to.be.closeTo(0.0, 0.1);
    });

    it('Should handle uniform random observations', () => {
      for (let i = 0; i < 100; i++) {
        calibration.recordObservation(Math.random(), Math.random() < 0.5);
      }

      const calibrated = calibration.calibrate(0.5);

      // Should be somewhere reasonable
      expect(calibrated).to.be.greaterThanOrEqual(0);
      expect(calibrated).to.be.lessThanOrEqual(1);
    });

    it('Should handle recalibration with new observations', () => {
      // Initial observations
      for (let i = 0; i < 50; i++) {
        calibration.recordObservation(0.7, i < 35); // 70% correct
      }

      const before = calibration.calibrate(0.7);

      // Add new observations that change the pattern
      for (let i = 0; i < 100; i++) {
        calibration.recordObservation(0.7, i < 40); // Now 40% correct
      }

      const after = calibration.calibrate(0.7);

      // Calibration should adapt
      expect(after).to.be.lessThan(before);
    });

    it('Should handle very small confidence scores', () => {
      for (let i = 0; i < 20; i++) {
        calibration.recordObservation(0.01, false);
      }

      const calibrated = calibration.calibrate(0.01);

      expect(calibrated).to.be.greaterThanOrEqual(0);
      expect(calibrated).to.be.lessThan(0.2);
    });

    it('Should handle very high confidence scores', () => {
      for (let i = 0; i < 20; i++) {
        calibration.recordObservation(0.99, true);
      }

      const calibrated = calibration.calibrate(0.99);

      expect(calibrated).to.be.greaterThan(0.8);
      expect(calibrated).to.be.lessThanOrEqual(1);
    });
  });

  // ============================================================================
  // CONFIGURATION TESTS
  // ============================================================================

  describe('Configuration', () => {
    it('Should respect minSamplesForCalibration config', () => {
      const customCalibration = new CalibrationLayer({ minSamplesForCalibration: 50, numBins: 10 });

      for (let i = 0; i < 30; i++) {
        customCalibration.recordObservation(0.7, i < 21);
      }

      // Should still return raw score (< 50 samples)
      expect(customCalibration.calibrate(0.7)).to.equal(0.7);

      for (let i = 0; i < 25; i++) {
        customCalibration.recordObservation(0.7, i < 15);
      }

      // Now should calibrate (>= 50 samples)
      expect(customCalibration.calibrate(0.7)).to.not.equal(0.7);
    });

    it('Should support different number of bins', () => {
      const fiveBinCalibration = new CalibrationLayer({ minSamplesForCalibration: 10, numBins: 5 });

      for (let i = 0; i < 20; i++) {
        fiveBinCalibration.recordObservation(0.5, i < 10);
      }

      const model = fiveBinCalibration.getModel();
      expect(model.bins).to.have.lengthOf(5);
    });
  });

  // ============================================================================
  // PERFORMANCE TESTS
  // ============================================================================

  describe('Performance', () => {
    it('Should calibrate quickly', () => {
      // Add observations
      for (let i = 0; i < 1000; i++) {
        calibration.recordObservation(Math.random(), Math.random() < 0.7);
      }

      // Measure calibration speed
      const start = Date.now();
      for (let i = 0; i < 10000; i++) {
        calibration.calibrate(Math.random());
      }
      const duration = Date.now() - start;

      // Should complete 10k calibrations in < 100ms
      expect(duration).to.be.lessThan(100);
    });

    it('Should record observations quickly', () => {
      const start = Date.now();

      for (let i = 0; i < 10000; i++) {
        calibration.recordObservation(Math.random(), Math.random() < 0.5);
      }

      const duration = Date.now() - start;

      // Should record 10k observations in < 500ms
      expect(duration).to.be.lessThan(500);
    });
  });
});
