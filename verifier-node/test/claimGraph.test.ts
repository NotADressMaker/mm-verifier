import { buildClaimGraph } from '../../shared/claim_graph';

describe('claim graph extraction', () => {
  it('is deterministic for the same input', () => {
    const text = 'Paris is the capital of France. See https://example.com/source.';
    const graphA = buildClaimGraph(text);
    const graphB = buildClaimGraph(text);
    expect(graphA).toEqual(graphB);
    expect(graphA.nodes.some((node) => node.type === 'citation')).toBe(true);
  });
});
