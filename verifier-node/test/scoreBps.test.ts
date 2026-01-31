import { toScoreBps } from '../src/utils/score';

describe('score bps normalization', () => {
  it('converts 0-100 scores to basis points', () => {
    expect(toScoreBps(0)).toBe(0);
    expect(toScoreBps(80)).toBe(8000);
    expect(toScoreBps(100)).toBe(10000);
  });

  it('converts 0-1 scores to basis points', () => {
    expect(toScoreBps(0.5)).toBe(5000);
    expect(toScoreBps(1)).toBe(10000);
  });
});
