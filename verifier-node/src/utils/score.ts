import { CONSTANTS } from '../../../shared/types';

export function toScoreBps(score: number): number {
  if (!Number.isFinite(score)) {
    throw new Error('Score must be a finite number');
  }

  const normalized = score <= 1 ? score * 10000 : score * 100;
  const rounded = Math.round(normalized);

  if (rounded < 0 || rounded > CONSTANTS.MAX_SCORE_BPS) {
    throw new Error(`Score bps out of range: ${rounded}`);
  }

  return rounded;
}
