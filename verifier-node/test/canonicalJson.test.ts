import { canonicalize as sharedCanonicalize, hashCanonical as sharedHashCanonical } from '../../shared/canonicalJson';
import { canonicalize as apiCanonicalize, hashCanonical as apiHashCanonical } from '../../api/src/services/mamvHasher';
import { hashEvidenceBundle } from '../src/evidence/evidenceBundlerV2';

const samplePayload = {
  z: 1,
  a: {
    d: 4,
    c: [3, undefined, { b: 2, a: 1 }],
  },
};

describe('canonical JSON hashing', () => {
  it('matches api mamvHasher canonicalization output', () => {
    const shared = sharedCanonicalize(samplePayload);
    const api = apiCanonicalize(samplePayload);
    expect(shared).toEqual(api);
  });

  it('produces matching keccak hashes across modules', () => {
    const sharedHash = sharedHashCanonical(samplePayload);
    const apiHash = apiHashCanonical(samplePayload);
    expect(sharedHash).toEqual(apiHash);
    expect(sharedHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('uses the same hash for evidence bundle content', () => {
    const bundle = {
      version: '1.0.0',
      task_id: '0x' + '11'.repeat(32),
      bundle_version: '0.1',
      created_at: '2024-10-12T09:43:22Z',
      evaluator: {
        node_id: 'node:test',
        eth_address: '0x0000000000000000000000000000000000000001',
        software: {
          name: 'verifier-node',
          ver: '0.1',
          commit: 'abc1234',
        },
      },
      prompt_hash: '0x' + '22'.repeat(32),
      rubric_hash: '0x' + '33'.repeat(32),
      model_runs: [],
      claims: [],
      metrics: {
        consensus: { agreement: 0, clusters: 0 },
        factuality: { supported_claim_ratio: 0 },
        citation_quality: { authority_score: 0 },
        bias: { sensitive_variance: 0 },
        stability: { reask_delta: 0 },
      },
      final_score_bps: 0,
      explanation: 'test',
    };

    const bundleHash = hashEvidenceBundle(bundle);
    const canonicalHash = sharedHashCanonical(bundle);

    expect(bundleHash).toEqual(canonicalHash);
    expect(bundleHash).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
