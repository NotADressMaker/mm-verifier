import { solidityPackedKeccak256 } from 'ethers';

export function computeCommitHash(params: {
  taskId: bigint | string;
  verifier: string;
  scoreBps: number;
  bundleHash: string;
  salt: string;
}): string {
  const taskId = typeof params.taskId === 'string' ? BigInt(params.taskId) : params.taskId;

  return solidityPackedKeccak256(
    ['uint256', 'address', 'uint16', 'bytes32', 'bytes32'],
    [taskId, params.verifier, params.scoreBps, params.bundleHash, params.salt]
  );
}
