type ProviderWeights = Record<string, number>;

const baseWeights: ProviderWeights = (() => {
  try {
    const raw = process.env.PROVIDER_WEIGHTS;
    if (!raw) return {};
    return JSON.parse(raw) as ProviderWeights;
  } catch {
    return {};
  }
})();

const penalties = new Map<string, number>();

// Providers whose cumulative penalty exceeded SLASH_THRESHOLD are excluded from
// consensus until SLASH_RECOVERY_MS has elapsed without another failure.
const SLASH_THRESHOLD = 0.8;
const SLASH_RECOVERY_MS = parseInt(process.env.SLASH_RECOVERY_MS || '1800000'); // 30 min

interface SlashRecord {
  slashedAt: number;
  recoveryAt: number;
}
const slashRecords = new Map<string, SlashRecord>();

function keyFor(providerId: string, model: string) {
  return `${providerId}:${model}`;
}

function isSlashed(key: string): boolean {
  const record = slashRecords.get(key);
  if (!record) return false;
  if (Date.now() >= record.recoveryAt) {
    // Probationary re-entry: clear slash, reset penalty to just below threshold
    slashRecords.delete(key);
    penalties.set(key, SLASH_THRESHOLD - 0.1);
    return false;
  }
  return true;
}

export function recordProviderError(providerId: string, model: string, severity: 'soft' | 'hard') {
  const key = keyFor(providerId, model);
  if (isSlashed(key)) {
    // Extend recovery window on additional failures while slashed
    const record = slashRecords.get(key);
    if (record) {
      record.recoveryAt = Date.now() + SLASH_RECOVERY_MS;
    }
    return;
  }

  const current = penalties.get(key) ?? 0;
  const delta = severity === 'hard' ? 0.2 : 0.1;
  const next = Math.min(1.0, current + delta);
  penalties.set(key, next);

  if (next >= SLASH_THRESHOLD && !slashRecords.has(key)) {
    slashRecords.set(key, {
      slashedAt: Date.now(),
      recoveryAt: Date.now() + SLASH_RECOVERY_MS,
    });
  }
}

export function recordProviderSuccess(providerId: string, model: string) {
  const key = keyFor(providerId, model);
  if (isSlashed(key)) return; // cannot earn recovery credit while slashed
  const current = penalties.get(key) ?? 0;
  penalties.set(key, Math.max(0, current - 0.05));
}

export function getEffectiveWeight(providerId: string, model: string): number {
  const key = keyFor(providerId, model);
  if (isSlashed(key)) return 0;
  const base = baseWeights[key] ?? baseWeights[providerId] ?? 1;
  const penalty = penalties.get(key) ?? 0;
  return Math.max(0.1, base * (1 - penalty));
}

/** Returns the set of currently-slashed provider:model keys. */
export function getSlashedProviders(): Set<string> {
  const active = new Set<string>();
  for (const [key] of slashRecords) {
    if (isSlashed(key)) active.add(key);
  }
  return active;
}

export function getBaseWeights(): ProviderWeights {
  return { ...baseWeights };
}
