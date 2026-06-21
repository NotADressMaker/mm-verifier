import { Wallet } from 'ethers';
import { hashCanonical, hashUtf8 } from '../src/services/mamvHasher';
import { signMAMVAttestation, verifyMAMVAttestationSignature } from '../src/services/mamvAttestation';

describe('MAMV attestation', () => {
  it('hashes canonical payloads deterministically', () => {
    const first = hashCanonical({ b: 2, a: 1 });
    const second = hashCanonical({ a: 1, b: 2 });

    expect(first).toEqual(second);
  });

  it('signs and verifies MAMV attestations', async () => {
    const wallet = new Wallet(
      '0x59c6995e998f97a5a0044986f3d5d7f2d9d2f5a7a4f8c99e8c7c7f9f29c9f7f7'
    );
    const chainId = 421614;
    const verifyingContract = '0x0000000000000000000000000000000000000001';

    const attestation = {
      taskId: hashUtf8('task-123'),
      inputHash: hashUtf8('input'),
      selectedOutputHash: hashUtf8('output'),
      verifierVersionHash: hashUtf8('mamv-verifier@1.0.0'),
      configHash: hashUtf8('config'),
      timestamp: 1700000000,
      expiresAt: 1700003600,
      score: 90,
      passed: true,
    };

    const signature = await signMAMVAttestation(
      wallet.privateKey,
      chainId,
      verifyingContract,
      attestation
    );
    const recovered = verifyMAMVAttestationSignature(
      chainId,
      verifyingContract,
      attestation,
      signature
    );

    expect(recovered).toEqual(wallet.address);
  });

  it('fails verification with a mismatched chain id', async () => {
    const wallet = new Wallet(
      '0x59c6995e998f97a5a0044986f3d5d7f2d9d2f5a7a4f8c99e8c7c7f9f29c9f7f7'
    );
    const verifyingContract = '0x0000000000000000000000000000000000000001';

    const attestation = {
      taskId: hashUtf8('task-456'),
      inputHash: hashUtf8('input'),
      selectedOutputHash: hashUtf8('output'),
      verifierVersionHash: hashUtf8('mamv-verifier@1.0.0'),
      configHash: hashUtf8('config'),
      timestamp: 1700000000,
      expiresAt: 1700003600,
      score: 90,
      passed: true,
    };

    const signature = await signMAMVAttestation(
      wallet.privateKey,
      421614,
      verifyingContract,
      attestation
    );

    const recovered = verifyMAMVAttestationSignature(
      42161,
      verifyingContract,
      attestation,
      signature
    );

    expect(recovered).not.toEqual(wallet.address);
  });
});
