import { scoreVerification } from '../src/scoring/scorer';
import { ModelResponse } from '../src/llm-providers/modelRouter';

describe('claim graph scoring', () => {
  it('computes agreement and contradictions from claim graphs', async () => {
    const responses: ModelResponse[] = [
      {
        response: 'Paris is the capital of France. https://example.com',
        model: 'gpt-4',
        provider: 'openai',
        timestamp: Date.now(),
        metadata: {},
      },
      {
        response: 'Paris is the capital of France.',
        model: 'claude-3',
        provider: 'anthropic',
        timestamp: Date.now(),
        metadata: {},
      },
      {
        response: 'Paris is not the capital of France.',
        model: 'gemini-pro',
        provider: 'google',
        timestamp: Date.now(),
        metadata: {},
      },
    ];

    const result = await scoreVerification('prompt', responses, 'factual-qa');
    expect(result.claim_graph.agreement_ratio).toBeGreaterThan(0);
    expect(result.claim_graph.contradiction_count).toBeGreaterThan(0);
    expect(result.claim_graph.citation_coverage).toBeGreaterThan(0);
  });
});
