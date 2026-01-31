import { computeCommitHash } from '../../shared/commitHash';
import { generateCommitHash } from '../src/services/blockchain';

describe('commit hash derivation', () => {
  it('matches the contract preimage (abi.encodePacked)', () => {
    const taskId = (2n ** 200n) + 12345n;
    const verifier = '0x5B38Da6a701c568545dCfcB03FcB875f56beddC4';
    const scoreBps = 8234;
    const bundleHash = '0x' + 'aa'.repeat(32);
    const salt = '0x' + 'bb'.repeat(32);

    const expected = '0x26ef8304d369635e74a76547b4d5dee596d0886da2f2c8c11b17d46313524a61';

    const sharedHash = computeCommitHash({
      taskId,
      verifier,
      scoreBps,
      bundleHash,
      salt,
    });

    const verifierHash = generateCommitHash(taskId, verifier, scoreBps, bundleHash, salt);

    expect(sharedHash).toEqual(expected);
    expect(verifierHash).toEqual(expected);
  });
});
