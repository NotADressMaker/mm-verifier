import fs from 'fs';
import path from 'path';
import {
  buildClaimGraphAnalysis,
  detectContradictions,
  alignClaimClusters,
  extractClaimsFromText,
} from '../../shared/claim_graph';

describe('claim graph analysis', () => {
  const fixturePath = path.join(__dirname, 'fixtures', 'claim-graph-fixture.json');
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as {
    responses: Array<{ model_id: string; text: string }>;
  };

  it('aligns claims deterministically', () => {
    const claims = fixture.responses.flatMap((response) =>
      extractClaimsFromText({ text: response.text, model_id: response.model_id }).claims
    );
    const clustersA = alignClaimClusters(claims);
    const clustersB = alignClaimClusters(claims);
    expect(clustersA).toEqual(clustersB);
  });

  it('detects negation and numeric mismatches', () => {
    const claims = fixture.responses.flatMap((response) =>
      extractClaimsFromText({ text: response.text, model_id: response.model_id }).claims
    );
    const clusters = alignClaimClusters(claims);
    const contradictions = detectContradictions(claims, clusters);
    const severities = contradictions.map((edge) => edge.severity);
    expect(severities).toContain('HIGH');
    expect(severities).toContain('MED');
  });

  it('scores claim coverage and citations within expected ranges', () => {
    const analysis = buildClaimGraphAnalysis({ responses: fixture.responses });
    expect(analysis.score_components.coverage_bps).toBeGreaterThan(0);
    expect(analysis.score_components.coverage_bps).toBeLessThanOrEqual(10000);
    expect(analysis.score_components.citation_quality_bps).toBeGreaterThanOrEqual(0);
    expect(analysis.score_components.final_score_bps).toBeLessThanOrEqual(10000);
  });
});
