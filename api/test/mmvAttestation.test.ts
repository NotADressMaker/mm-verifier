import { Wallet } from 'ethers';
import { hashCanonical, hashUtf8 } from '../src/services/mmvHasher';
import { signMMVAttestation, verifyMMVAttestationSignature } from '../src/services/mmvAttestation';

describe('MMV attestation', () => {
  it('hashes canonical payloads deterministically', () => {
    const first = hashCanonical({ b: 2, a: 1 });
    const second = hashCanonical({ a: 1, b: 2 });

    expect(first).toEqual(second);
  });

  it('signs and verifies MMV attestations', async () => {
    const wallet = new Wallet(
      '0x59c6995e998f97a5a0044986f3d5d7f2d9d2f5a7a4f8c99e8c7c7f9f29c9f7f7'
    );
    const chainId = 42161;
    const verifyingContract = '0x0000000000000000000000000000000000000001';

    const attestation = {
      taskId: hashUtf8('task-123'),
      inputHash: hashUtf8('input'),
      selectedOutputHash: hashUtf8('output'),
      verifierVersionHash: hashUtf8('mmv-verifier@1.0.0'),
      configHash: hashUtf8('config'),
      timestamp: 1700000000,
      expiresAt: 1700003600,
      score: 90,
      passed: true,
    };

    const signature = await signMMVAttestation(
      wallet.privateKey,
      chainId,
      verifyingContract,
      attestation
    );
    const recovered = verifyMMVAttestationSignature(
      chainId,
      verifyingContract,
      attestation,
      signature
    );

    expect(recovered).toEqual(wallet.address);
  });
});
