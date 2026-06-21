// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./VerifierTypes.sol";

/**
 * @title VerifierHash
 * @notice Canonical hashing library for MAMV system
 * @dev Provides deterministic, contract-enforced hashing rules for commit-reveal protocol
 *
 * This library ensures that all parties compute commit hashes identically,
 * preventing ambiguity and enabling secure commit-reveal verification.
 *
 * Key Design Principles:
 * 1. Deterministic: Same inputs always produce same output
 * 2. Collision-resistant: Uses keccak256 with proper encoding
 * 3. Tamper-proof: Includes all critical fields in hash
 * 4. Gas-efficient: Minimizes redundant hashing operations
 */
library VerifierHash {
    using VerifierTypes for *;

    // ========================================================================
    // Branch Hashing
    // ========================================================================

    /**
     * @notice Hash a single branch
     * @dev Uses abi.encode for proper struct hashing with type safety
     * @param b Branch to hash
     * @return Hash of the branch
     */
    function hashBranch(VerifierTypes.Branch memory b) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            b.conditionHash,
            b.answerHash,
            b.evidenceRoot,
            b.confidenceBps,
            b.branchScoreBps
        ));
    }

    /**
     * @notice Hash an array of branches
     * @dev Hashes each branch individually, then hashes the concatenated results
     *      This prevents length-extension attacks and ensures order matters
     * @param branches Array of branches to hash
     * @return Hash of all branches
     */
    function hashBranches(VerifierTypes.Branch[] memory branches) internal pure returns (bytes32) {
        bytes32[] memory hs = new bytes32[](branches.length);
        for (uint256 i = 0; i < branches.length; i++) {
            hs[i] = hashBranch(branches[i]);
        }
        return keccak256(abi.encodePacked(hs));
    }

    // ========================================================================
    // Commit-Reveal Hashing
    // ========================================================================

    /**
     * @notice Compute canonical commit hash for a verifier's submission
     * @dev This is the core commit-reveal primitive used by VerifierMarketplace
     *
     * The commit hash binds:
     * - taskId: Prevents replay across different tasks
     * - verifier: Prevents impersonation
     * - modelId: Records which model was used
     * - hashBranches(branches): Commits to the decision tree structure
     * - overallScoreBps: Commits to the overall quality score
     * - salt: Provides unpredictability (prevents grinding attacks)
     *
     * @param taskId Task identifier
     * @param verifier Address of the verifier
     * @param modelId Identifier for the model used
     * @param overallScoreBps Overall quality score (0-10000)
     * @param branches Array of decision branches
     * @param salt Random salt (must be secret until reveal)
     * @return Canonical commit hash
     */
    function commitHash(
        bytes32 taskId,
        address verifier,
        bytes32 modelId,
        uint16 overallScoreBps,
        VerifierTypes.Branch[] memory branches,
        bytes32 salt
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            taskId,
            verifier,
            modelId,
            hashBranches(branches),
            overallScoreBps,
            salt
        ));
    }

    /**
     * @notice Compute canonical commit hash from a RevealBundle
     * @dev Convenience wrapper around commitHash() for RevealBundle structs
     * @param taskId Task identifier
     * @param verifier Address of the verifier
     * @param bundle Reveal bundle containing all commitment data
     * @return Canonical commit hash
     */
    function commitHashFromBundle(
        bytes32 taskId,
        address verifier,
        VerifierTypes.RevealBundle memory bundle
    ) internal pure returns (bytes32) {
        return commitHash(
            taskId,
            verifier,
            bundle.modelId,
            bundle.overallScoreBps,
            bundle.branches,
            bundle.salt
        );
    }

    // ========================================================================
    // Auditor Commit-Reveal Hashing
    // ========================================================================

    /**
     * @notice Compute canonical commit hash for an auditor's vote
     * @dev Used in DisputeLadder for commit-reveal voting by jury
     *
     * The auditor commit hash binds:
     * - disputeId: Prevents replay across different disputes
     * - auditor: Prevents impersonation
     * - challengerWins: The actual vote
     * - branchLegitimacyBps: BLS score justification
     * - justificationRoot: Merkle root of reasoning
     * - salt: Provides unpredictability
     *
     * @param disputeId Dispute identifier
     * @param auditor Address of the auditor
     * @param reveal Auditor's reveal data
     * @return Canonical auditor commit hash
     */
    function auditorCommitHash(
        uint256 disputeId,
        address auditor,
        VerifierTypes.AuditorReveal memory reveal
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            disputeId,
            auditor,
            reveal.challengerWins,
            reveal.branchLegitimacyBps,
            reveal.justificationRoot,
            reveal.salt
        ));
    }

    // ========================================================================
    // Evidence and Defense Hashing
    // ========================================================================

    /**
     * @notice Hash dispute evidence bundle
     * @dev Used to commit to challenger's evidence in disputes
     * @param claimHash Hash of the claim being made
     * @param evidenceRoot Merkle root of supporting evidence
     * @param submitter Address submitting the evidence
     * @return Hash of evidence bundle
     */
    function hashEvidence(
        bytes32 claimHash,
        bytes32 evidenceRoot,
        address submitter
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            claimHash,
            evidenceRoot,
            submitter
        ));
    }

    /**
     * @notice Hash dispute defense bundle
     * @dev Used to commit to defender's response in disputes
     * @param defenseHash Hash of the defense statement
     * @param defenseRoot Merkle root of counter-evidence
     * @param defender Address submitting the defense
     * @return Hash of defense bundle
     */
    function hashDefense(
        bytes32 defenseHash,
        bytes32 defenseRoot,
        address defender
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            defenseHash,
            defenseRoot,
            defender
        ));
    }

    // ========================================================================
    // Task ID Generation
    // ========================================================================

    /**
     * @notice Generate deterministic task ID
     * @dev Creates unique, reproducible task identifiers
     *
     * Task ID binds:
     * - creator: Who created the task
     * - promptHash: What is being evaluated
     * - policyHash: Evaluation criteria
     * - chainId: Prevents cross-chain replay
     * - nonce: Uniqueness within creator's tasks
     *
     * @param creator Address creating the task
     * @param promptHash Hash of evaluation prompt
     * @param policyHash Hash of evaluation policy
     * @param chainId Current chain ID
     * @param nonce Unique nonce for this creator
     * @return Deterministic task ID
     */
    function generateTaskId(
        address creator,
        bytes32 promptHash,
        bytes32 policyHash,
        uint256 chainId,
        uint256 nonce
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            creator,
            promptHash,
            policyHash,
            chainId,
            nonce
        ));
    }

    // ========================================================================
    // Bundle Registry Hashing
    // ========================================================================

    /**
     * @notice Hash complete evidence bundle for BundleRegistry
     * @dev Used to commit to off-chain evidence bundles
     * @param branchCount Number of branches in bundle
     * @param declaredBudget Declared branch budget
     * @param branchesRoot Merkle root of branch objects
     * @param bundleURI IPFS/Arweave URI
     * @return Hash of bundle metadata
     */
    function hashBundleMetadata(
        uint16 branchCount,
        uint16 declaredBudget,
        bytes32 branchesRoot,
        string memory bundleURI
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            branchCount,
            declaredBudget,
            branchesRoot,
            keccak256(bytes(bundleURI))
        ));
    }
}
