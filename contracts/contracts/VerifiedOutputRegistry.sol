// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IVerifiedOutputRegistry.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/**
 * @title VerifiedOutputRegistry
 * @notice On-chain registry for verified AI outputs - the "blockchain contribution" primitive
 * @dev Records finalized verifications for queryability, provenance, and optional rewards
 *
 * This contract stores verified output records that represent trustworthy AI artifacts.
 * Each record links to an off-chain evidence bundle containing full provenance.
 *
 * Key features:
 * - EIP-712 signed submissions from authorized verifiers
 * - Efficient indexing by task, program, and builder
 * - Optional ETH-based builder rewards (MVP, behind flag)
 * - Integration with existing BundleRegistry for dispute support
 */
contract VerifiedOutputRegistry is IVerifiedOutputRegistry, Ownable, ReentrancyGuard, EIP712 {
    using ECDSA for bytes32;

    // ========================================================================
    // Constants
    // ========================================================================

    /// @notice EIP-712 type hash for verified output
    bytes32 public constant VERIFIED_OUTPUT_TYPEHASH = keccak256(
        "VerifiedOutput(bytes32 taskId,bytes32 programId,bytes32 inputHash,bytes32 outputHash,uint16 scoreBps,bool verdict,bytes32 bundleHash,uint64 finalizedAt)"
    );

    /// @notice Quality threshold for bonus rewards (80%)
    uint16 public constant QUALITY_THRESHOLD_BPS = 8000;

    /// @notice Maximum records per batch submission
    uint256 public constant MAX_BATCH_SIZE = 50;

    // ========================================================================
    // State
    // ========================================================================

    /// @notice All verified output records by ID
    mapping(bytes32 => VerifiedOutput) private _outputs;

    /// @notice Check if record exists
    mapping(bytes32 => bool) private _recordExists;

    /// @notice Records by task ID
    mapping(bytes32 => bytes32[]) private _taskRecords;

    /// @notice Records by program ID (for pagination, stores record IDs)
    mapping(bytes32 => bytes32[]) private _programRecords;

    /// @notice Records by builder address
    mapping(address => bytes32[]) private _builderRecords;

    /// @notice Program statistics
    mapping(bytes32 => ProgramStats) private _programStats;

    /// @notice Builder statistics
    mapping(address => BuilderStats) private _builderStats;

    /// @notice Authorized verifiers (signers)
    mapping(address => bool) private _verifiers;

    /// @notice Total record count
    uint256 private _totalRecords;

    /// @notice Record nonce for unique ID generation
    uint256 private _recordNonce;

    // ========================================================================
    // Rewards State (MVP)
    // ========================================================================

    /// @notice Rewards configuration
    bool public rewardsEnabled;
    uint256 public baseReward;
    uint256 public qualityMultiplierBps; // 10000 = 1x, 15000 = 1.5x
    uint256 public minScoreBps;

    /// @notice Pending rewards per builder
    mapping(address => uint256) private _pendingRewards;

    /// @notice Total reward pool balance
    uint256 public rewardPoolBalance;

    // ========================================================================
    // Constructor
    // ========================================================================

    constructor()
        Ownable(msg.sender)
        EIP712("VerifiedOutputRegistry", "1")
    {
        // Default rewards config (disabled)
        rewardsEnabled = false;
        baseReward = 0.0001 ether; // 0.0001 ETH base reward
        qualityMultiplierBps = 15000; // 1.5x for quality
        minScoreBps = 5000; // 50% minimum score
    }

    // ========================================================================
    // Core Functions
    // ========================================================================

    /**
     * @inheritdoc IVerifiedOutputRegistry
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
    ) external nonReentrant returns (bytes32 recordId) {
        // Validate inputs
        require(taskId != bytes32(0), "Invalid taskId");
        require(programId != bytes32(0), "Invalid programId");
        require(inputHash != bytes32(0), "Invalid inputHash");
        require(outputHash != bytes32(0), "Invalid outputHash");
        require(bundleHash != bytes32(0), "Invalid bundleHash");
        require(scoreBps <= 10000, "Score exceeds 100%");
        require(bytes(bundleUri).length > 0, "Empty bundleUri");

        // Verify signature from authorized verifier
        uint64 finalizedAt = uint64(block.timestamp);
        address signer = _verifySignature(
            taskId, programId, inputHash, outputHash,
            scoreBps, verdict, bundleHash, finalizedAt, signature
        );
        require(_verifiers[signer], "Invalid verifier signature");

        // Generate unique record ID
        recordId = _generateRecordId(taskId, programId, bundleHash);
        require(!_recordExists[recordId], "Record already exists");

        // Store record
        _outputs[recordId] = VerifiedOutput({
            taskId: taskId,
            programId: programId,
            inputHash: inputHash,
            outputHash: outputHash,
            bundleHash: bundleHash,
            bundleUri: bundleUri,
            scoreBps: scoreBps,
            verdict: verdict,
            submitter: msg.sender,
            finalizedAt: finalizedAt,
            registeredAt: uint64(block.timestamp)
        });

        _recordExists[recordId] = true;
        _totalRecords++;

        // Update indexes
        _taskRecords[taskId].push(recordId);
        _programRecords[programId].push(recordId);
        _builderRecords[msg.sender].push(recordId);

        // Update program stats
        _updateProgramStats(programId, scoreBps, verdict);

        // Update builder stats and calculate rewards
        _updateBuilderStatsAndRewards(msg.sender, recordId, scoreBps);

        emit OutputRecorded(
            recordId,
            taskId,
            programId,
            msg.sender,
            scoreBps,
            verdict,
            bundleHash,
            bundleUri
        );
    }

    /**
     * @inheritdoc IVerifiedOutputRegistry
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
    ) external nonReentrant returns (bytes32[] memory recordIds) {
        uint256 len = taskIds.length;
        require(len > 0 && len <= MAX_BATCH_SIZE, "Invalid batch size");
        require(
            len == programIds.length &&
            len == inputHashes.length &&
            len == outputHashes.length &&
            len == scoresBps.length &&
            len == verdicts.length &&
            len == bundleHashes.length &&
            len == bundleUris.length &&
            len == signatures.length,
            "Array length mismatch"
        );

        recordIds = new bytes32[](len);

        for (uint256 i = 0; i < len; i++) {
            // Inline version of registerOutput for gas efficiency
            bytes32 taskId = taskIds[i];
            bytes32 programId = programIds[i];
            bytes32 inputHash = inputHashes[i];
            bytes32 outputHash = outputHashes[i];
            uint16 scoreBps = scoresBps[i];
            bool verdict = verdicts[i];
            bytes32 bundleHash = bundleHashes[i];

            require(taskId != bytes32(0), "Invalid taskId");
            require(scoreBps <= 10000, "Score exceeds 100%");

            // Verify signature
            uint64 finalizedAt = uint64(block.timestamp);
            address signer = _verifySignature(
                taskId, programId, inputHash, outputHash,
                scoreBps, verdict, bundleHash, finalizedAt, signatures[i]
            );
            require(_verifiers[signer], "Invalid verifier signature");

            // Generate and check record ID
            bytes32 recordId = _generateRecordId(taskId, programId, bundleHash);
            require(!_recordExists[recordId], "Record already exists");

            // Store record
            _outputs[recordId] = VerifiedOutput({
                taskId: taskId,
                programId: programId,
                inputHash: inputHash,
                outputHash: outputHash,
                bundleHash: bundleHash,
                bundleUri: bundleUris[i],
                scoreBps: scoreBps,
                verdict: verdict,
                submitter: msg.sender,
                finalizedAt: finalizedAt,
                registeredAt: uint64(block.timestamp)
            });

            _recordExists[recordId] = true;
            _totalRecords++;

            // Update indexes
            _taskRecords[taskId].push(recordId);
            _programRecords[programId].push(recordId);
            _builderRecords[msg.sender].push(recordId);

            // Update stats
            _updateProgramStats(programId, scoreBps, verdict);
            _updateBuilderStatsAndRewards(msg.sender, recordId, scoreBps);

            recordIds[i] = recordId;

            emit OutputRecorded(
                recordId, taskId, programId, msg.sender,
                scoreBps, verdict, bundleHash, bundleUris[i]
            );
        }
    }

    // ========================================================================
    // Query Functions
    // ========================================================================

    /**
     * @inheritdoc IVerifiedOutputRegistry
     */
    function getOutput(bytes32 recordId) external view returns (VerifiedOutput memory output) {
        require(_recordExists[recordId], "Record not found");
        return _outputs[recordId];
    }

    /**
     * @inheritdoc IVerifiedOutputRegistry
     */
    function recordExists(bytes32 recordId) external view returns (bool exists) {
        return _recordExists[recordId];
    }

    /**
     * @inheritdoc IVerifiedOutputRegistry
     */
    function getProgramStats(bytes32 programId) external view returns (ProgramStats memory stats) {
        return _programStats[programId];
    }

    /**
     * @inheritdoc IVerifiedOutputRegistry
     */
    function getBuilderStats(address builder) external view returns (BuilderStats memory stats) {
        return _builderStats[builder];
    }

    /**
     * @inheritdoc IVerifiedOutputRegistry
     */
    function totalRecords() external view returns (uint256 count) {
        return _totalRecords;
    }

    /**
     * @inheritdoc IVerifiedOutputRegistry
     */
    function getRecordsByTask(bytes32 taskId) external view returns (bytes32[] memory recordIds) {
        return _taskRecords[taskId];
    }

    /**
     * @inheritdoc IVerifiedOutputRegistry
     */
    function getRecordsByProgram(
        bytes32 programId,
        uint256 offset,
        uint256 limit
    ) external view returns (bytes32[] memory recordIds, uint256 total) {
        bytes32[] storage allRecords = _programRecords[programId];
        total = allRecords.length;

        if (offset >= total) {
            return (new bytes32[](0), total);
        }

        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }

        uint256 resultLen = end - offset;
        recordIds = new bytes32[](resultLen);
        for (uint256 i = 0; i < resultLen; i++) {
            recordIds[i] = allRecords[offset + i];
        }
    }

    /**
     * @notice Get records by builder address (paginated)
     */
    function getRecordsByBuilder(
        address builder,
        uint256 offset,
        uint256 limit
    ) external view returns (bytes32[] memory recordIds, uint256 total) {
        bytes32[] storage allRecords = _builderRecords[builder];
        total = allRecords.length;

        if (offset >= total) {
            return (new bytes32[](0), total);
        }

        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }

        uint256 resultLen = end - offset;
        recordIds = new bytes32[](resultLen);
        for (uint256 i = 0; i < resultLen; i++) {
            recordIds[i] = allRecords[offset + i];
        }
    }

    // ========================================================================
    // Rewards Functions
    // ========================================================================

    /**
     * @inheritdoc IVerifiedOutputRegistry
     */
    function getRewardConfig() external view returns (
        uint256 _baseReward,
        uint256 _qualityMultiplierBps,
        uint256 _minScoreBps
    ) {
        return (baseReward, qualityMultiplierBps, minScoreBps);
    }

    /**
     * @inheritdoc IVerifiedOutputRegistry
     */
    function calculateReward(bytes32 recordId) external view returns (
        uint256 reward,
        bool qualityBonus
    ) {
        if (!rewardsEnabled || !_recordExists[recordId]) {
            return (0, false);
        }

        VerifiedOutput storage output = _outputs[recordId];
        return _calculateRewardInternal(output.scoreBps);
    }

    /**
     * @inheritdoc IVerifiedOutputRegistry
     */
    function pendingRewards(address builder) external view returns (uint256 amount) {
        return _pendingRewards[builder];
    }

    /**
     * @inheritdoc IVerifiedOutputRegistry
     */
    function claimRewards() external nonReentrant returns (uint256 amount) {
        amount = _pendingRewards[msg.sender];
        require(amount > 0, "No pending rewards");
        require(rewardPoolBalance >= amount, "Insufficient reward pool");

        _pendingRewards[msg.sender] = 0;
        rewardPoolBalance -= amount;

        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "ETH transfer failed");

        return amount;
    }

    // ========================================================================
    // Admin Functions
    // ========================================================================

    /**
     * @inheritdoc IVerifiedOutputRegistry
     */
    function addVerifier(address verifier) external onlyOwner {
        require(verifier != address(0), "Invalid verifier");
        _verifiers[verifier] = true;
    }

    /**
     * @inheritdoc IVerifiedOutputRegistry
     */
    function removeVerifier(address verifier) external onlyOwner {
        _verifiers[verifier] = false;
    }

    /**
     * @inheritdoc IVerifiedOutputRegistry
     */
    function isVerifier(address verifier) external view returns (bool authorized) {
        return _verifiers[verifier];
    }

    /**
     * @inheritdoc IVerifiedOutputRegistry
     */
    function configureRewards(
        bool _enabled,
        uint256 _baseReward,
        uint256 _qualityMultiplierBps,
        uint256 _minScoreBps
    ) external onlyOwner {
        require(_qualityMultiplierBps >= 10000, "Multiplier must be >= 1x");
        require(_minScoreBps <= 10000, "Min score exceeds 100%");

        rewardsEnabled = _enabled;
        baseReward = _baseReward;
        qualityMultiplierBps = _qualityMultiplierBps;
        minScoreBps = _minScoreBps;

        emit RewardsConfigured(_enabled, _baseReward, _qualityMultiplierBps, _minScoreBps);
    }

    /**
     * @inheritdoc IVerifiedOutputRegistry
     */
    function depositRewardPool() external payable {
        require(msg.value > 0, "Must deposit > 0");
        rewardPoolBalance += msg.value;
    }

    /**
     * @inheritdoc IVerifiedOutputRegistry
     */
    function withdrawRewardPool(uint256 amount) external onlyOwner nonReentrant {
        require(amount <= rewardPoolBalance, "Insufficient balance");
        rewardPoolBalance -= amount;

        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "ETH transfer failed");
    }

    // ========================================================================
    // Internal Functions
    // ========================================================================

    /**
     * @dev Generate unique record ID
     */
    function _generateRecordId(
        bytes32 taskId,
        bytes32 programId,
        bytes32 bundleHash
    ) internal returns (bytes32) {
        return keccak256(abi.encodePacked(
            taskId,
            programId,
            bundleHash,
            block.timestamp,
            _recordNonce++
        ));
    }

    /**
     * @dev Verify EIP-712 signature
     */
    function _verifySignature(
        bytes32 taskId,
        bytes32 programId,
        bytes32 inputHash,
        bytes32 outputHash,
        uint16 scoreBps,
        bool verdict,
        bytes32 bundleHash,
        uint64 finalizedAt,
        bytes calldata signature
    ) internal view returns (address) {
        bytes32 structHash = keccak256(abi.encode(
            VERIFIED_OUTPUT_TYPEHASH,
            taskId,
            programId,
            inputHash,
            outputHash,
            scoreBps,
            verdict,
            bundleHash,
            finalizedAt
        ));

        bytes32 digest = _hashTypedDataV4(structHash);
        return ECDSA.recover(digest, signature);
    }

    /**
     * @dev Update program statistics
     */
    function _updateProgramStats(
        bytes32 programId,
        uint16 scoreBps,
        bool verdict
    ) internal {
        ProgramStats storage stats = _programStats[programId];
        stats.totalRecords++;
        if (verdict) {
            stats.passedRecords++;
        }
        stats.cumulativeScore += scoreBps;
        stats.lastRecordAt = uint64(block.timestamp);
    }

    /**
     * @dev Update builder statistics and calculate rewards
     */
    function _updateBuilderStatsAndRewards(
        address builder,
        bytes32 recordId,
        uint16 scoreBps
    ) internal {
        BuilderStats storage stats = _builderStats[builder];
        stats.totalSubmissions++;
        stats.lastSubmissionAt = uint64(block.timestamp);

        bool qualityBonus = scoreBps >= QUALITY_THRESHOLD_BPS;
        if (qualityBonus) {
            stats.qualitySubmissions++;
        }

        // Calculate and accrue rewards if enabled
        if (rewardsEnabled && scoreBps >= minScoreBps) {
            (uint256 reward, ) = _calculateRewardInternal(scoreBps);

            if (reward > 0 && rewardPoolBalance >= reward) {
                _pendingRewards[builder] += reward;
                stats.totalRewardsEarned += reward;

                emit BuilderRewarded(builder, recordId, reward, qualityBonus);
            }
        }
    }

    /**
     * @dev Calculate reward for a given score
     */
    function _calculateRewardInternal(uint16 scoreBps) internal view returns (
        uint256 reward,
        bool qualityBonus
    ) {
        if (!rewardsEnabled || scoreBps < minScoreBps) {
            return (0, false);
        }

        qualityBonus = scoreBps >= QUALITY_THRESHOLD_BPS;

        if (qualityBonus) {
            reward = (baseReward * qualityMultiplierBps) / 10000;
        } else {
            reward = baseReward;
        }
    }

    // ========================================================================
    // Receive ETH
    // ========================================================================

    receive() external payable {
        rewardPoolBalance += msg.value;
    }
}
