import { independentSupportCount } from '../src/scoring/independenceChecker';
import { verdictFromEvidence } from '../../shared/verdicts';

describe('independence checking', () => {
  it('does not let correlated sources produce Supported', () => {
    const count = independentSupportCount([
      { id: 'a', model_family: 'family-x', provider_org: 'org-a', retrieval_context_fingerprints: ['ctx'] },
      { id: 'b', model_family: 'family-x', provider_org: 'org-b', retrieval_context_fingerprints: ['ctx'] },
    ]);
    expect(count).toBe(1);
    expect(verdictFromEvidence({ evidenceCoverage: 1, supportedClaimRatio: 1, contradictedClaimRatio: 0, independentSupportCount: count, hasMaterialContradiction: false })).not.toBe('Supported');
  });
  it('does not count undeclared lineage as independent', () => expect(independentSupportCount([{ id: 'unknown' }])).toBe(0));
});
