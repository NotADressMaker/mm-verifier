import { computeAgreementMetrics, computeErrorCorrelation } from '../src/benchmark/agreement';

describe('agreement metrics', () => {
  it('computes agreement for clustered outputs', () => {
    const metrics = computeAgreementMetrics(['Yes', 'Yes', 'No']);
    expect(metrics.agreement_rate).toBeCloseTo(2 / 3, 5);
    expect(metrics.pairwise_agreement).toBeCloseTo(1 / 3, 5);
    expect(metrics.clusters.length).toBe(2);
  });

  it('computes error correlations between models', () => {
    const correlations = computeErrorCorrelation({
      modelA: [true, false, true],
      modelB: [true, false, false],
    });

    expect(correlations.length).toBe(1);
    expect(correlations[0].model_a).toBe('modelA');
  });
});
