import {
  computeBrierScore,
  computeCalibrationBins,
  computeExpectedCalibrationError,
} from '../src/benchmark/metrics';

describe('calibration metrics', () => {
  it('computes brier score for simple points', () => {
    const score = computeBrierScore([
      { predicted: 0.9, actual: true },
      { predicted: 0.1, actual: false },
    ]);

    expect(score).toBeCloseTo(0.01, 4);
  });

  it('computes ECE for binned points', () => {
    const bins = computeCalibrationBins([
      { predicted: 0.8, actual: true },
      { predicted: 0.8, actual: false },
      { predicted: 0.2, actual: false },
    ]);

    const ece = computeExpectedCalibrationError(bins);
    expect(ece).toBeGreaterThan(0);
  });
});
