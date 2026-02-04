(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TrustLensRisk = factory();
  }
})(this, function () {
  const DEFAULT_CONFIG = {
    newValidatorThresholdDays: 7,
    lowSignalMinValidations: 5,
    scoreShiftWindow: 5,
    scoreShiftDelta: 30,
    staleThresholdHours: 24,
  };

  function hoursSince(timestamp) {
    const then = new Date(timestamp).getTime();
    const now = Date.now();
    return (now - then) / (1000 * 60 * 60);
  }

  function daysSince(timestamp) {
    return hoursSince(timestamp) / 24;
  }

  function computeRiskFlags({ receipt, history, validatorSummary, config }) {
    const cfg = { ...DEFAULT_CONFIG, ...(config || {}) };
    const flags = [];

    if (!receipt) {
      flags.push('UNVERIFIED');
      return flags;
    }

    if (validatorSummary) {
      if (daysSince(validatorSummary.firstSeenAt) < cfg.newValidatorThresholdDays) {
        flags.push('NEW_VALIDATOR');
      }

      if (validatorSummary.totalValidations < cfg.lowSignalMinValidations) {
        flags.push('LOW_SIGNAL');
      }
    }

    if (history && history.length > 1) {
      const recent = history.slice(-cfg.scoreShiftWindow - 1, -1);
      if (recent.length > 0) {
        const avg = recent.reduce((sum, item) => sum + item.score, 0) / recent.length;
        const delta = Math.abs(receipt.score - avg);
        if (delta >= cfg.scoreShiftDelta) {
          flags.push('SCORE_SHIFT');
        }
      }
    }

    if (hoursSince(receipt.timestamp) > cfg.staleThresholdHours) {
      flags.push('STALE');
    }

    return flags;
  }

  return {
    computeRiskFlags,
  };
});
