import { ModelResponse } from '../src/llm-providers/modelRouter';
import { calculateSimilarityBonus, scoreVerification } from '../src/scoring/scorer';

describe('similarity bonus', () => {
  it('awards progressively more extra points for highly similar multi-model answers', () => {
    expect(calculateSimilarityBonus(69, 3)).toBe(0);
    expect(calculateSimilarityBonus(70, 3)).toBe(0);
    expect(calculateSimilarityBonus(85, 3)).toBe(5);
    expect(calculateSimilarityBonus(100, 3)).toBe(10);
  });

  it('does not award a consensus bonus when only one AI answered', () => {
    expect(calculateSimilarityBonus(100, 1)).toBe(0);
  });

  it('caps the bonus at ten points', () => {
    expect(calculateSimilarityBonus(150, 4)).toBe(10);
  });

  it('includes the bonus in the score breakdown and explanation', async () => {
    const responses: ModelResponse[] = ['openai', 'anthropic'].map((provider, index) => ({
      response: 'Paris is the capital of France.',
      model: `model-${index}`,
      provider,
      timestamp: Date.now(),
      metadata: {},
    }));

    const result = await scoreVerification('What is the capital of France?', responses, 'general');

    expect(result.breakdown.similarityBonus).toBe(10);
    expect(result.reasoning).toContain('10-point consensus bonus');
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
