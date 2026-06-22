import { keccak256, toUtf8Bytes, solidityPacked } from 'ethers';

export interface ModelVote {
  model_id: string;   // "provider:model"
  response_hash: string; // keccak256 of raw response text
  score_bps: number;  // 0-10000
}

/**
 * Hash a single model vote leaf: keccak256(abi.encodePacked(model_id, response_hash, score_bps))
 * Matches on-chain leaf encoding so any vote can be proven against the root.
 */
export function hashVoteLeaf(vote: ModelVote): string {
  return keccak256(
    solidityPacked(
      ['string', 'bytes32', 'uint16'],
      [vote.model_id, vote.response_hash, vote.score_bps]
    )
  );
}

/**
 * Hash a response string the same way the on-chain verifier would.
 */
export function hashResponse(text: string): string {
  return keccak256(toUtf8Bytes(text));
}

/**
 * Build a Merkle tree from vote leaves and return the root plus the full proof
 * for each leaf. Uses sorted-pair hashing (standard OpenZeppelin MerkleProof
 * compatible) so proofs can be verified on-chain without any extra library.
 *
 * Leaves are sorted before building the tree so the root is deterministic
 * regardless of the order models respond.
 */
export function buildMerkleVoteTree(votes: ModelVote[]): {
  root: string;
  leaves: string[];
  proofs: Record<string, string[]>; // model_id → proof path
} {
  if (votes.length === 0) {
    const empty = keccak256(toUtf8Bytes(''));
    return { root: empty, leaves: [], proofs: {} };
  }

  const rawLeaves = votes.map((v) => ({ model_id: v.model_id, leaf: hashVoteLeaf(v) }));
  // Stable sort by leaf hash — deterministic across runs
  rawLeaves.sort((a, b) => (a.leaf < b.leaf ? -1 : 1));

  const leaves = rawLeaves.map((l) => l.leaf);

  // Build tree layer by layer
  const tree: string[][] = [leaves];
  let current = leaves;
  while (current.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i];
      const right = current[i + 1] ?? left; // duplicate last node for odd length
      next.push(sortedPairHash(left, right));
    }
    tree.push(next);
    current = next;
  }

  const root = current[0];

  // Build proofs for each leaf
  const proofs: Record<string, string[]> = {};
  for (let li = 0; li < rawLeaves.length; li++) {
    const proof: string[] = [];
    let idx = li;
    for (let level = 0; level < tree.length - 1; level++) {
      const sibling =
        idx % 2 === 0
          ? tree[level][idx + 1] ?? tree[level][idx]
          : tree[level][idx - 1];
      proof.push(sibling);
      idx = Math.floor(idx / 2);
    }
    proofs[rawLeaves[li].model_id] = proof;
  }

  return { root, leaves, proofs };
}

/**
 * Verify a single leaf is in the tree. Mirrors the OZ MerkleProof.verify logic.
 */
export function verifyMerkleProof(leaf: string, proof: string[], root: string): boolean {
  let computed = leaf;
  for (const sibling of proof) {
    computed = sortedPairHash(computed, sibling);
  }
  return computed === root;
}

function sortedPairHash(a: string, b: string): string {
  const [left, right] = a <= b ? [a, b] : [b, a];
  return keccak256(solidityPacked(['bytes32', 'bytes32'], [left, right]));
}
