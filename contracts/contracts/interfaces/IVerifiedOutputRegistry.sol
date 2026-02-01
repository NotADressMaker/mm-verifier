// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IVerifiedOutputRegistry
 * @notice Interface for the on-chain registry of verified AI outputs
 * @dev Stores verified output records for queryability and incentive distribution
 *
 * This registry is the on-chain representation of "trustworthy AI outputs"
 * that have been verified through the MMV system. Each record represents
 * a single verification with full provenance linking.
 */
interface IVerifiedOutputRegistry {
    // ========================================================================
    // Structs
    // ========================================================================

    /**
     * @notice On-chain representation of a verified output
     * @dev Compact structure for gas efficiency - full details in bundle off-chain
     */
    struct VerifiedOutput {
        bytes32 taskId;           // Task identifier
        bytes32 programId;        // Hash of program identifier
        bytes32 inputHash;        // keccak256 of input content
        bytes32 outputHash;       // keccak256 of output content
        bytes32 bundleHash;       // keccak256 of evidence bundle
        string bundleUri;         // IPFS/Arweave URI for full bundle
        uint16 scoreBps;          // Score in basis points (0-10000)
        bool verdict;             // true = passed, false = failed
        address submitter;        // Who submitted the record
        uint64 finalizedAt;       // When verification was finalized
        uint64 registeredAt;      // When record was registered on-chain
    }

    /**
     * @notice Statistics for a program
     */
    struct ProgramStats {
        uint256 totalRecords;     // Total verified outputs for program
        uint256 passedRecords;    // Records with verdict = true
        uint256 cumulativeScore;  // Sum of all scores (for average calculation)
        uint64 lastRecordAt;      // Timestamp of most recent record
    }

    /**
     * @notice Builder statistics for rewards tracking
     */
    struct BuilderStats {
        uint256 totalSubmissions; // Total records submitted
        uint256 qualitySubmissions; // Records with score >= 8000 bps
        uint256 totalRewardsEarned; // Cumulative rewards (wei or points)
        uint64 lastSubmissionAt;  // Timestamp of most recent submission
    }

    // ========================================================================
    // Events
    // ========================================================================

    /**
     * @notice Emitted when a new verified output is registered
     */
    event OutputRecorded(
        bytes32 indexed recordId,
        bytes32 indexed taskId,
        bytes32 indexed programId,
        address submitter,
        uint16 scoreBps,
        bool verdict,
        bytes32 bundleHash,
        string bundleUri
    );

    /**
     * @notice Emitted when builder rewards are distributed
     */
    event BuilderRewarded(
        address indexed builder,
        bytes32 indexed recordId,
        uint256 rewardAmount,
        bool qualityBonus
    );

    /**
     * @notice Emitted when rewards are configured
     */
    event RewardsConfigured(
        bool enabled,
        uint256 baseReward,
        uint256 qualityMultiplierBps,
        uint256 minScoreBps
    );

    // ========================================================================
    // Core Functions
    // ========================================================================

    /**
     * @notice Register a new verified output record
     * @param taskId Task identifier (bytes32)
     * @param programId Hash of program identifier
     * @param inputHash keccak256 of input content
     * @param outputHash keccak256 of output content
     * @param scoreBps Score in basis points (0-10000)
     * @param verdict Verification verdict (true = passed)
     * @param bundleHash keccak256 of evidence bundle
     * @param bundleUri URI to evidence bundle
     * @param signature EIP-712 signature from authorized verifier
     * @return recordId The generated record identifier
     */
    function registerOutput(
        bytes32 taskId,
        bytes32 programId,
        bytes32 inputHash,
        bytes32 outputHash,
        uint16 scoreBps,
        bool verdict,
        bytes32 bundleHash,
        string calldata bundleUri,
        bytes calldata signature
    ) external returns (bytes32 recordId);

    /**
     * @notice Batch register multiple verified outputs
     * @dev Gas-efficient for bulk submissions
     */
    function registerOutputBatch(
        bytes32[] calldata taskIds,
        bytes32[] calldata programIds,
        bytes32[] calldata inputHashes,
        bytes32[] calldata outputHashes,
        uint16[] calldata scoresBps,
        bool[] calldata verdicts,
        bytes32[] calldata bundleHashes,
        string[] calldata bundleUris,
        bytes[] calldata signatures
    ) external returns (bytes32[] memory recordIds);

    // ========================================================================
    // Query Functions
    // ========================================================================

    /**
     * @notice Get a verified output by record ID
     * @param recordId The record identifier
     * @return output The verified output record
     */
    function getOutput(bytes32 recordId) external view returns (VerifiedOutput memory output);

    /**
     * @notice Check if a record exists
     * @param recordId The record identifier
     * @return exists True if record exists
     */
    function recordExists(bytes32 recordId) external view returns (bool exists);

    /**
     * @notice Get statistics for a program
     * @param programId Hash of program identifier
     * @return stats Program statistics
     */
    function getProgramStats(bytes32 programId) external view returns (ProgramStats memory stats);

    /**
     * @notice Get builder statistics
     * @param builder Builder address
     * @return stats Builder statistics
     */
    function getBuilderStats(address builder) external view returns (BuilderStats memory stats);

    /**
     * @notice Get total number of records in registry
     * @return count Total record count
     */
    function totalRecords() external view returns (uint256 count);

    /**
     * @notice Get records by task ID
     * @param taskId The task identifier
     * @return recordIds Array of record IDs for the task
     */
    function getRecordsByTask(bytes32 taskId) external view returns (bytes32[] memory recordIds);

    /**
     * @notice Get records by program ID (paginated)
     * @param programId Hash of program identifier
     * @param offset Start index
     * @param limit Max records to return
     * @return recordIds Array of record IDs
     * @return total Total records for program
     */
    function getRecordsByProgram(
        bytes32 programId,
        uint256 offset,
        uint256 limit
    ) external view returns (bytes32[] memory recordIds, uint256 total);

    // ========================================================================
    // Rewards Functions (MVP - ETH-based or points)
    // ========================================================================

    /**
     * @notice Check if rewards are enabled
     * @return enabled True if rewards are active
     */
    function rewardsEnabled() external view returns (bool enabled);

    /**
     * @notice Get current reward configuration
     * @return baseReward Base reward per output
     * @return qualityMultiplierBps Quality bonus multiplier in bps (10000 = 1x)
     * @return minScoreBps Minimum score to receive rewards
     */
    function getRewardConfig() external view returns (
        uint256 baseReward,
        uint256 qualityMultiplierBps,
        uint256 minScoreBps
    );

    /**
     * @notice Calculate reward for a record (view function)
     * @param recordId The record identifier
     * @return reward Reward amount
     * @return qualityBonus Whether quality bonus applies
     */
    function calculateReward(bytes32 recordId) external view returns (
        uint256 reward,
        bool qualityBonus
    );

    /**
     * @notice Claim pending rewards for a builder
     * @dev Only callable by the builder themselves
     * @return amount Amount of rewards claimed
     */
    function claimRewards() external returns (uint256 amount);

    /**
     * @notice Get pending rewards for a builder
     * @param builder Builder address
     * @return amount Pending reward amount
     */
    function pendingRewards(address builder) external view returns (uint256 amount);

    // ========================================================================
    // Admin Functions
    // ========================================================================

    /**
     * @notice Add an authorized verifier (signer)
     * @param verifier Address to authorize
     */
    function addVerifier(address verifier) external;

    /**
     * @notice Remove an authorized verifier
     * @param verifier Address to remove
     */
    function removeVerifier(address verifier) external;

    /**
     * @notice Check if address is authorized verifier
     * @param verifier Address to check
     * @return authorized True if verifier is authorized
     */
    function isVerifier(address verifier) external view returns (bool authorized);

    /**
     * @notice Configure reward settings
     * @param enabled Enable/disable rewards
     * @param baseReward Base reward per output
     * @param qualityMultiplierBps Quality bonus multiplier (10000 = 1x, 15000 = 1.5x)
     * @param minScoreBps Minimum score to receive rewards
     */
    function configureRewards(
        bool enabled,
        uint256 baseReward,
        uint256 qualityMultiplierBps,
        uint256 minScoreBps
    ) external;

    /**
     * @notice Deposit funds into reward pool
     */
    function depositRewardPool() external payable;

    /**
     * @notice Withdraw from reward pool (owner only, for emergency)
     * @param amount Amount to withdraw
     */
    function withdrawRewardPool(uint256 amount) external;
}
