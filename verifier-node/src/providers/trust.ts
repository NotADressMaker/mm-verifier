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

// Penalty record stores the value at last update + timestamp so we can apply
// time-based exponential decay without a polling loop.
interface PenaltyRecord {
  value: number;
  lastUpdatedAt: number;
}

const penaltyRecords = new Map<string, PenaltyRecord>();

// Providers whose cumulative penalty exceeded SLASH_THRESHOLD are excluded from
// consensus until SLASH_RECOVERY_MS has elapsed without another failure.
const SLASH_THRESHOLD = 0.8;
const SLASH_RECOVERY_MS = parseInt(process.env.SLASH_RECOVERY_MS || '1800000'); // 30 min

interface SlashRecord {
  slashedAt: number;
  recoveryAt: number;
}
const slashRecords = new Map<string, SlashRecord>();

// Penalty half-life: 6 hours of clean operation halves accumulated penalty.
// Mirrors the "inactivity leak" recovery dynamic in Ethereum PoS where
// validators naturally recover weight over time after going offline.
const PENALTY_HALF_LIFE_MS = 6 * 60 * 60 * 1000;

// Correlated failure window: if multiple providers fail within this window, each
// gets a quadratic amplification (√N multiplier) on their penalty.  This mirrors
// Ethereum's quadratic slashing rule for coordinated misbehaviour.
const CORRELATION_WINDOW_MS = 60_000; // 60 s

// Rolling log of recent failures for correlation detection — entries older than
// CORRELATION_WINDOW_MS are pruned lazily on every error.
const recentFailureLog: Array<{ key: string; at: number }> = [];

function keyFor(providerId: string, model: string) {
  return `${providerId}:${model}`;
}

/**
 * Return the current penalty value for `key` after applying exponential time
 * decay from the stored lastUpdatedAt timestamp.
 */
function getCurrentPenalty(key: string): number {
  const record = penaltyRecords.get(key);
  if (!record) return 0;
  const ageMs = Date.now() - record.lastUpdatedAt;
  return record.value * Math.pow(0.5, ageMs / PENALTY_HALF_LIFE_MS);
}

function setPenalty(key: string, value: number): void {
  penaltyRecords.set(key, { value: Math.min(1.0, Math.max(0, value)), lastUpdatedAt: Date.now() });
}

function isSlashed(key: string): boolean {
  const record = slashRecords.get(key);
  if (!record) return false;
  if (Date.now() >= record.recoveryAt) {
    // Probationary re-entry: clear slash, reset penalty to just below threshold
    slashRecords.delete(key);
    setPenalty(key, SLASH_THRESHOLD - 0.1);
    return false;
  }
  return true;
}

/**
 * Count distinct provider:model keys (excluding `selfKey`) that failed within
 * the last CORRELATION_WINDOW_MS.  Prunes stale entries as a side-effect.
 */
function countCorrelatedFailures(selfKey: string, now: number): number {
  // Prune entries outside the window
  while (recentFailureLog.length > 0 && recentFailureLog[0].at < now - CORRELATION_WINDOW_MS) {
    recentFailureLog.shift();
  }
  const unique = new Set(recentFailureLog.filter((e) => e.key !== selfKey).map((e) => e.key));
  return unique.size;
}

export function recordProviderError(providerId: string, model: string, severity: 'soft' | 'hard') {
  const key = keyFor(providerId, model);
  const now = Date.now();

  if (isSlashed(key)) {
    // Extend recovery window on additional failures while slashed
    const record = slashRecords.get(key);
    if (record) {
      record.recoveryAt = now + SLASH_RECOVERY_MS;
    }
    return;
  }

  // Correlated failure amplification: √(N+1) where N = other providers that also
  // failed in the last 60 s.  A solo failure gets 1× (√1); two providers failing
  // together each get ~1.41× (√2); five correlated failures → ~2.45×.
  const correlated = countCorrelatedFailures(key, now);
  const correlationMultiplier = Math.sqrt(correlated + 1);

  const baseDelta = severity === 'hard' ? 0.2 : 0.1;
  const delta = Math.min(0.5, baseDelta * correlationMultiplier);

  const current = getCurrentPenalty(key);
  const next = Math.min(1.0, current + delta);
  setPenalty(key, next);

  // Log this failure for future correlation checks
  recentFailureLog.push({ key, at: now });

  if (next >= SLASH_THRESHOLD && !slashRecords.has(key)) {
    slashRecords.set(key, {
      slashedAt: now,
      recoveryAt: now + SLASH_RECOVERY_MS,
    });
  }
}

export function recordProviderSuccess(providerId: string, model: string) {
  const key = keyFor(providerId, model);
  if (isSlashed(key)) return; // cannot earn recovery credit while slashed
  // Time decay already handles most of the recovery; a successful call gives a
  // small additional nudge to encourage fast recovery after transient errors.
  const current = getCurrentPenalty(key);
  setPenalty(key, Math.max(0, current - 0.05));
}

export function getEffectiveWeight(providerId: string, model: string): number {
  const key = keyFor(providerId, model);
  if (isSlashed(key)) return 0;
  const base = baseWeights[key] ?? baseWeights[providerId] ?? 1;
  const penalty = getCurrentPenalty(key);
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
