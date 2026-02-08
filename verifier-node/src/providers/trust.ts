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

function keyFor(providerId: string, model: string) {
  return `${providerId}:${model}`;
}

export function recordProviderError(providerId: string, model: string, severity: 'soft' | 'hard') {
  const key = keyFor(providerId, model);
  const current = penalties.get(key) ?? 0;
  const delta = severity === 'hard' ? 0.2 : 0.1;
  penalties.set(key, Math.min(0.9, current + delta));
}

export function recordProviderSuccess(providerId: string, model: string) {
  const key = keyFor(providerId, model);
  const current = penalties.get(key) ?? 0;
  penalties.set(key, Math.max(0, current - 0.05));
}

export function getEffectiveWeight(providerId: string, model: string): number {
  const key = keyFor(providerId, model);
  const base = baseWeights[key] ?? baseWeights[providerId] ?? 1;
  const penalty = penalties.get(key) ?? 0;
  return Math.max(0.1, base * (1 - penalty));
}

export function getBaseWeights(): ProviderWeights {
  return { ...baseWeights };
}
