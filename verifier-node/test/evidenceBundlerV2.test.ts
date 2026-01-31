import { Wallet, ethers } from 'ethers';
import {
  createEvidenceBundle,
  createModelRun,
  createClaim,
  createMetrics,
  signEvidenceBundle,
  verifyBundleSignature,
  normalizeTaskIdBytes32,
} from '../src/evidence/evidenceBundlerV2';

describe('Evidence bundler v2 helpers', () => {
  it('normalizes task ids to bytes32 without lossy parsing', () => {
    const decimalTaskId = '123';
    const bigDecimalTaskId = '1234567890123456789012345678901234567890';
    const hexTaskId = '0x' + '11'.repeat(32);

    expect(normalizeTaskIdBytes32(decimalTaskId)).toEqual(
      ethers.zeroPadValue(ethers.toBeHex(BigInt(decimalTaskId)), 32)
    );
    expect(normalizeTaskIdBytes32(bigDecimalTaskId)).toEqual(
      ethers.zeroPadValue(ethers.toBeHex(BigInt(bigDecimalTaskId)), 32)
    );
    expect(normalizeTaskIdBytes32(hexTaskId)).toEqual(ethers.zeroPadValue(hexTaskId, 32));
  });

  it('signs and verifies with the provided chain id', async () => {
    const wallet = new Wallet(
      '0x8b3a350cf5c34c9194ca3a545d1dfe54c4b7275a59b65e94a4cb6c1316a9f0f3'
    );
    const marketplaceAddress = '0x0000000000000000000000000000000000000002';
    const chainId = 421614;

    const bundle = createEvidenceBundle(
      '0x' + '22'.repeat(32),
      'node:test',
      wallet.address,
      '0x' + '33'.repeat(32),
      '0x' + '44'.repeat(32),
      [createModelRun('openai', 'gpt-4', 0, 'Example output')],
      [createClaim('c1', 'Paris is the capital of France.', 'factual', [], [])],
      createMetrics(
        { agreement: 1, clusters: 1 },
        { supportedClaimRatio: 1 },
        { authorityScore: 1 },
        { sensitiveVariance: 0 },
        { reaskDelta: 0 }
      ),
      9200,
      'Verified.'
    );

    const signed = await signEvidenceBundle(bundle, wallet, marketplaceAddress, chainId);
    const verified = verifyBundleSignature(signed, marketplaceAddress, chainId);
    const wrongChain = verifyBundleSignature(signed, marketplaceAddress, 42161);

    expect(verified.valid).toBe(true);
    expect(verified.recoveredAddress).toBe(wallet.address);
    expect(wrongChain.valid).toBe(false);
  });
});
