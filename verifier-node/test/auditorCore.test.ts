import path from 'path';
import {
  computeEvidenceHash,
  loadEvidenceBundle,
  verifyEvidenceHash,
  buildProgramContext,
} from '../src/cli/auditorCore';

describe('auditorCore', () => {
  const fixturePath = path.join(__dirname, 'fixtures', 'evidence-bundle.json');

  it('computes evidence hash and validates', async () => {
    const bundle = await loadEvidenceBundle(fixturePath, { allowRemote: false });
    const hash = computeEvidenceHash(bundle);
    expect(typeof hash).toBe('string');
    verifyEvidenceHash({ computed: hash, expected: hash });
  });

  it('builds program context from bundle', async () => {
    const bundle = await loadEvidenceBundle(fixturePath, { allowRemote: false });
    const context = buildProgramContext(bundle, {
      programHash: 'abc123',
      contractAddress: '0x0000000000000000000000000000000000000001',
      bundleUri: 'ipfs://bundle',
    });
    expect(context.bundle_uri).toBe('ipfs://bundle');
    expect(context.program_hash).toBe('abc123');
  });
});
