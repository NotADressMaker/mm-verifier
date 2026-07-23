import { Checker } from '../../src/ovp/checkers/base';
import { VerificationPipeline } from '../../src/ovp/core/pipeline';
import { CheckerRegistry } from '../../src/ovp/core/registry';
import { ClaimType } from '../../src/ovp/core/models';
import { extractClaims } from '../../src/ovp/extractors/claims';

describe('OVP pipeline', () => {
  it('preserves source spans while extracting classified atomic claims', () => {
    const text = 'The Halting Problem is undecidable. Decidability implies countable domain.';
    const claims = extractClaims(text);
    expect(claims).toHaveLength(2);
    expect(text.slice(claims[0].source_span.start, claims[0].source_span.end)).toBe('The Halting Problem is undecidable.');
    expect(claims[1].claim_type).toBe('logical');
  });
  it('flags the seeded encoding qualification', async () => {
    const run = await new VerificationPipeline().verify({ text: 'Decidability implies countable domain.' });
    expect(run.findings).toEqual(expect.arrayContaining([expect.objectContaining({ status: 'needs_qualification', severity: 'high' })]));
    expect(run.provenance.input_hash).toMatch(/^sha256:/);
  });
  it('isolates a checker failure without terminating the run', async () => {
    const registry = new CheckerRegistry();
    const crashing: Checker = { name: 'crashing', version: '0.1.0', supportedClaimTypes: new Set<ClaimType>(['unknown']), check: async () => { throw new Error('boom'); } };
    registry.register(crashing);
    const run = await new VerificationPipeline(registry).verify({ text: 'A statement.' });
    expect(run.findings[0].status).toBe('error');
    expect(run.provenance.checker_failures).toEqual([{ checker: 'crashing', message: 'boom' }]);
  });
  it('records offline mode and does not assert missing evidence is false', async () => {
    const run = await new VerificationPipeline().verify({ text: 'Water boils at sea level.', networkEnabled: false, llmEnabled: false });
    expect(run.provenance.network_used).toBe(false);
    expect(run.findings).toEqual(expect.arrayContaining([expect.objectContaining({ status: 'unsupported', verification_method: 'human_required' })]));
  });
});
