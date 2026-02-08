import { citationChecker } from '../src/checkers/citationChecker';
import { arithmeticChecker } from '../src/checkers/arithmeticChecker';
import { codeExecutionChecker } from '../src/checkers/codeExecutionChecker';
import { runDeterministicCheckers } from '../src/checkers';

describe('deterministic checkers', () => {
  it('flags missing citations', () => {
    const result = citationChecker({
      claims: [
        { text: 'Claim with citation', citations: ['https://example.com'] },
        { text: 'Claim without citation', citations: [] },
      ],
    });

    expect(result.status).toBe('fail');
    expect(result.findings.missing_citations).toHaveLength(1);
  });

  it('detects arithmetic mismatches', () => {
    const result = arithmeticChecker({ text: '2 + 2 = 5' });
    expect(result.status).toBe('fail');
    expect(result.findings.mismatches.length).toBeGreaterThan(0);
  });

  it('executes safe python snippets', async () => {
    const result = await codeExecutionChecker({ code: 'print(1 + 1)' });
    expect(result.status).toBe('pass');
    expect(result.output_hash).toMatch(/^0x[0-9a-f]{64}$/i);
  });

  it('aggregates checker results into receipt explain shape', async () => {
    const aggregated = await runDeterministicCheckers({
      responseText: '2 + 2 = 4',
      claims: [{ text: 'Claim', citations: ['https://example.com'] }],
      codeSnippets: ['print(2 + 2)'],
    });

    expect(aggregated.score_components.length).toBe(4);
    expect(aggregated.checks.citation_checker).toBeDefined();
    expect(aggregated.checks.arithmetic_checker).toBeDefined();
  });
});
