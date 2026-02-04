const { computeRiskFlags } = require('../src/risk');

describe('risk logic', () => {
  it('flags new validator and stale receipts', () => {
    const receipt = {
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 30).toISOString(),
      score: 80,
    };
    const summary = {
      firstSeenAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
      totalValidations: 1,
    };
    const flags = computeRiskFlags({
      receipt,
      history: [receipt],
      validatorSummary: summary,
      config: { staleThresholdHours: 24 },
    });
    expect(flags).toContain('NEW_VALIDATOR');
    expect(flags).toContain('LOW_SIGNAL');
    expect(flags).toContain('STALE');
  });

  it('flags score shift when recent scores differ', () => {
    const receipt = {
      timestamp: new Date().toISOString(),
      score: 20,
    };
    const history = [
      { score: 90, timestamp: new Date().toISOString() },
      { score: 85, timestamp: new Date().toISOString() },
      { score: 88, timestamp: new Date().toISOString() },
      receipt,
    ];
    const flags = computeRiskFlags({
      receipt,
      history,
      validatorSummary: {
        firstSeenAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
        totalValidations: 10,
      },
    });
    expect(flags).toContain('SCORE_SHIFT');
  });
});
