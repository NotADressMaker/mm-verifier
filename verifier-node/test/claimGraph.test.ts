import { buildClaimGraphAnalysis, extractClaimsFromText } from '../../shared/claim_graph';

describe('claim graph extraction', () => {
  it('is deterministic for the same input', () => {
    const text = 'Paris is the capital of France. See https://example.com/source.';
    const graphA = extractClaimsFromText({ text, model_id: 'openai:gpt-4' });
    const graphB = extractClaimsFromText({ text, model_id: 'openai:gpt-4' });
    expect(graphA).toEqual(graphB);
    expect(graphA.citations.length).toBeGreaterThan(0);
  });

  it('builds a deterministic claim graph analysis', () => {
    const analysis = buildClaimGraphAnalysis({
      responses: [
        { model_id: 'openai:gpt-4', text: 'Paris is the capital of France.' },
        { model_id: 'anthropic:claude-3', text: 'Paris is the capital of France.' },
      ],
    });
    expect(analysis.total_claims).toBeGreaterThan(0);
    expect(analysis.claim_summary.length).toBeGreaterThan(0);
  });
});
