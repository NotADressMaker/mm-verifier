// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IBundleRegistry
 * @notice Interface for bundle metadata storage and branch commitments
 * @dev Stores Merkle roots and commitments for evidence bundles and branches
 */
interface IBundleRegistry {
    /**
     * @notice Get bundle owner (verifier who submitted)
     * @param bundleId Bundle identifier
     * @return owner Address of bundle submitter
     */
    function getBundleOwner(bytes32 bundleId) external view returns (address owner);

    /**
     * @notice Get bundle metadata
     * @param bundleId Bundle identifier
     * @return branchCount Number of branches in bundle
     * @return branchesRoot Merkle root of branch objects
     * @return submittedAt Timestamp of submission
     */
    function getBundleMeta(bytes32 bundleId) external view returns (
        uint16 branchCount,
        bytes32 branchesRoot,
        uint64 submittedAt
    );

    /**
     * @notice Get branch metadata
     * @param bundleId Bundle identifier
     * @param branchId Branch index (1-based)
     * @return confidenceBps Confidence in basis points (0-10000)
     * @return requiresSupport Whether branch requires evidence support
     */
    function getBranchMeta(bytes32 bundleId, uint32 branchId) external view returns (
        uint16 confidenceBps,
        bool requiresSupport
    );

    /**
     * @notice Get support commitment for a branch
     * @param bundleId Bundle identifier
     * @param branchId Branch index
     * @return supportRoot Merkle root of support evidence
     */
    function getSupportCommitment(bytes32 bundleId, uint32 branchId) external view returns (
        bytes32 supportRoot
    );

    /**
     * @notice Get declared budget for bundle
     * @param bundleId Bundle identifier
     * @return budget Declared number of branches
     */
    function getDeclaredBudget(bytes32 bundleId) external view returns (uint16 budget);
}

/**
 * @title IStakeManager
 * @notice Interface for auditor staking, slashing, and rewards
 * @dev Manages auditor pool and economic accountability
 */
interface IStakeManager {
    /**
     * @notice Check if address is active auditor
     * @param who Address to check
     * @return active True if auditor is active
     */
    function isActiveAuditor(address who) external view returns (bool active);

    /**
     * @notice Get count of active auditors
     * @return count Number of active auditors
     */
    function activeAuditorCount() external view returns (uint256 count);

    /**
     * @notice Get auditor at index
     * @param idx Index in active auditor list
     * @return auditor Address of auditor
     */
    function activeAuditorAt(uint256 idx) external view returns (address auditor);

    /**
     * @notice Lock auditor stake for dispute
     * @param who Auditor address
     * @param amount Amount to lock (wei)
     * @param until Lock expiration timestamp
     */
    function lockStake(address who, uint256 amount, uint64 until) external;

    /**
     * @notice Slash auditor stake
     * @param who Auditor address
     * @param amount Amount to slash (wei)
     */
    function slash(address who, uint256 amount) external;

    /**
     * @notice Reward auditor
     * @param who Auditor address
     * @param amount Reward amount (wei)
     */
    function reward(address who, uint256 amount) external payable;

    /**
     * @notice Get auditor reputation
     * @param who Auditor address
     * @return reputationBps Reputation in basis points (0-10000)
     */
    function auditorReputationBps(address who) external view returns (uint16 reputationBps);
}
