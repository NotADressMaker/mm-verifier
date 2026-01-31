import { normalizeUnixSeconds, resolveCommitDeadline, resolveRevealDeadline } from '../src/utils/time';

describe('time utilities', () => {
  it('normalizes millisecond timestamps to seconds', () => {
    const ms = 1_700_000_000_000;
    expect(normalizeUnixSeconds(ms, 'deadline')).toBe(1_700_000_000);
  });

  it('resolves deadline durations and defaults', () => {
    const now = 1_700_000_000;
    const commitDeadline = resolveCommitDeadline({ nowSeconds: now, commitDeadlineSeconds: 600 });
    const revealDeadline = resolveRevealDeadline({ commitDeadline, revealDeadlineSeconds: 900 });

    expect(commitDeadline).toBe(now + 600);
    expect(revealDeadline).toBe(now + 1500);
  });
});
