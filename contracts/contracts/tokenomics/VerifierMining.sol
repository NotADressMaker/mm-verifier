// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title VerifierMining
 * @notice Liquidity mining program for verifiers
 * @dev Rewards verifiers with VERIFY tokens based on accuracy and participation
 *
 * Reward Formula:
 * - Base reward: 1 point per evaluation
 * - Accuracy bonus: +1 point if evaluation is accurate vs final outcome
 * - Total reward share: (userPoints / totalPoints) * epochRewards
 *
 * Epochs:
 * - Each epoch = 1 week (50,400 blocks)
 * - Rewards distributed at end of each epoch
 * - Unclaimed rewards carry over to next epoch
 *
 * Example:
 * - Alice: 100 evals, 100 accurate → 200 points
 * - Bob: 50 evals, 0 accurate → 50 points
 * - Total: 250 points
 * - Epoch rewards: 1000 VERIFY
 * - Alice gets: 800 VERIFY (80%)
 * - Bob gets: 200 VERIFY (20%)
 */
contract VerifierMining is Ownable, ReentrancyGuard {
    IERC20 public immutable verifyToken;

    // Epoch configuration
    uint256 public constant EPOCH_DURATION = 50400; // ~1 week in blocks
    uint256 public epochRewards = 1000e18; // 1000 VERIFY per epoch
    uint256 public currentEpoch;
    uint256 public epochStartBlock;

    // Authorized marketplace to record evaluations
    address public marketplace;

    // Verifier points per epoch
    mapping(uint256 => mapping(address => uint256)) public verifierPoints; // epoch => verifier => points
    mapping(uint256 => uint256) public epochTotalPoints; // epoch => total points

    // Claimed status
    mapping(uint256 => mapping(address => bool)) public hasClaimed; // epoch => verifier => claimed

    // Events
    event EvaluationRecorded(
        uint256 indexed epoch,
        address indexed verifier,
        uint256 points,
        bool accurate
    );
    event RewardsClaimed(
        uint256 indexed epoch,
        address indexed verifier,
        uint256 amount
    );
    event EpochAdvanced(
        uint256 indexed newEpoch,
        uint256 startBlock,
        uint256 previousEpochPoints
    );
    event EpochRewardsUpdated(uint256 newRewards);
    event MarketplaceSet(address indexed marketplace);

    constructor(
        IERC20 _verifyToken,
        address _marketplace
    ) Ownable(msg.sender) {
        require(address(_verifyToken) != address(0), "Invalid token");
        require(_marketplace != address(0), "Invalid marketplace");

        verifyToken = _verifyToken;
        marketplace = _marketplace;
        epochStartBlock = block.number;
        currentEpoch = 1;
    }

    /**
     * @notice Set marketplace address (only owner)
     * @param _marketplace New marketplace address
     */
    function setMarketplace(address _marketplace) external onlyOwner {
        require(_marketplace != address(0), "Invalid marketplace");
        marketplace = _marketplace;
        emit MarketplaceSet(_marketplace);
    }

    /**
     * @notice Set epoch rewards (only owner/governance)
     * @param _epochRewards New reward amount per epoch
     */
    function setEpochRewards(uint256 _epochRewards) external onlyOwner {
        epochRewards = _epochRewards;
        emit EpochRewardsUpdated(_epochRewards);
    }

    /**
     * @notice Record evaluation completion (called by marketplace)
     * @param verifier Address of verifier
     * @param accurate Whether evaluation was accurate versus final outcome
     */
    function recordEvaluation(address verifier, bool accurate) external {
        require(msg.sender == marketplace, "Only marketplace");

        // Advance epoch if needed
        if (block.number >= epochStartBlock + EPOCH_DURATION) {
            _advanceEpoch();
        }

        // Calculate points
        uint256 points = 1; // Base point
        if (accurate) {
            points += 1; // Bonus for accurate evaluations
        }

        // Update points
        verifierPoints[currentEpoch][verifier] += points;
        epochTotalPoints[currentEpoch] += points;

        emit EvaluationRecorded(currentEpoch, verifier, points, accurate);
    }

    /**
     * @notice Claim rewards for completed epochs
     * @param epochs Array of epoch IDs to claim
     */
    function claimRewards(uint256[] calldata epochs) external nonReentrant {
        uint256 totalReward = 0;

        for (uint256 i = 0; i < epochs.length; i++) {
            uint256 epoch = epochs[i];

            // Can only claim completed epochs
            require(epoch < currentEpoch, "Epoch not completed");
            require(!hasClaimed[epoch][msg.sender], "Already claimed");

            uint256 userPoints = verifierPoints[epoch][msg.sender];
            if (userPoints == 0) continue;

            uint256 totalPoints = epochTotalPoints[epoch];
            if (totalPoints == 0) continue;

            // Calculate reward share
            uint256 reward = (epochRewards * userPoints) / totalPoints;
            totalReward += reward;

            // Mark as claimed
            hasClaimed[epoch][msg.sender] = true;

            emit RewardsClaimed(epoch, msg.sender, reward);
        }

        if (totalReward > 0) {
            verifyToken.transfer(msg.sender, totalReward);
        }
    }

    /**
     * @notice Get pending rewards for verifier across all epochs
     * @param verifier Address to check
     * @return totalPending Total pending rewards
     * @return claimableEpochs Array of epoch IDs that can be claimed
     */
    function getPendingRewards(address verifier) external view returns (
        uint256 totalPending,
        uint256[] memory claimableEpochs
    ) {
        // Count claimable epochs
        uint256 claimableCount = 0;
        for (uint256 epoch = 1; epoch < currentEpoch; epoch++) {
            if (!hasClaimed[epoch][verifier] && verifierPoints[epoch][verifier] > 0) {
                claimableCount++;
            }
        }

        // Build claimable epochs array
        claimableEpochs = new uint256[](claimableCount);
        uint256 idx = 0;

        for (uint256 epoch = 1; epoch < currentEpoch; epoch++) {
            if (!hasClaimed[epoch][verifier] && verifierPoints[epoch][verifier] > 0) {
                uint256 userPoints = verifierPoints[epoch][verifier];
                uint256 totalPoints = epochTotalPoints[epoch];

                if (totalPoints > 0) {
                    uint256 reward = (epochRewards * userPoints) / totalPoints;
                    totalPending += reward;
                    claimableEpochs[idx] = epoch;
                    idx++;
                }
            }
        }
    }

    /**
     * @notice Advance to next epoch
     */
    function _advanceEpoch() internal {
        uint256 previousEpochPoints = epochTotalPoints[currentEpoch];

        currentEpoch++;
        epochStartBlock = block.number;

        emit EpochAdvanced(currentEpoch, epochStartBlock, previousEpochPoints);
    }

    /**
     * @notice Manually advance epoch (callable by anyone after duration)
     */
    function advanceEpoch() external {
        require(block.number >= epochStartBlock + EPOCH_DURATION, "Epoch not finished");
        _advanceEpoch();
    }

    /**
     * @notice Get current epoch info
     * @return epoch Current epoch number
     * @return startBlock Epoch start block
     * @return endBlock Epoch end block
     * @return blocksRemaining Blocks until epoch ends
     * @return totalPoints Points accumulated this epoch
     */
    function getCurrentEpochInfo() external view returns (
        uint256 epoch,
        uint256 startBlock,
        uint256 endBlock,
        uint256 blocksRemaining,
        uint256 totalPoints
    ) {
        epoch = currentEpoch;
        startBlock = epochStartBlock;
        endBlock = epochStartBlock + EPOCH_DURATION;
        blocksRemaining = block.number < endBlock ? endBlock - block.number : 0;
        totalPoints = epochTotalPoints[currentEpoch];
    }
}
