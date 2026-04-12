import { compareClaims, extractClaims } from '../src/scoring/claimExtractor';

describe('claimExtractor', () => {
  it('excludes questions and strips trailing punctuation from extracted claims', () => {
    const text =
      'The Earth revolves around the Sun. Is the sky always blue? Please verify this quickly.';

    expect(extractClaims(text)).toEqual(['The Earth revolves around the Sun']);
  });

  it('treats punctuation variants as similar claims', () => {
    const score = compareClaims(
      ['Paris is the capital of France.'],
      ['Paris is the capital of France']
    );

    expect(score).toBe(1);
  });
});
