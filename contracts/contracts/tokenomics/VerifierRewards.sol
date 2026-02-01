// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./MMVCoin.sol";

interface IVerifierMarketplaceRewards {
    function getTaskMeta(uint256 taskId)
        external
        view
        returns (
            uint8 state,
            address requester,
            bytes32 promptHash,
            bytes32 rubricHash,
            uint40 commitDeadline,
            uint40 revealDeadline,
            uint40 disputeDeadline,
            uint8 minEvals,
            uint8 maxEvals,
            uint256 feePool,
            uint16 finalScoreBps,
            uint256 evalCount
        );

    function getTaskFinalOutcome(uint256 taskId)
        external
        view
        returns (
            uint16 finalScoreBps,
            bytes32 finalBundleHash,
            string memory finalBundleURI
        );

    function getEvaluators(uint256 taskId) external view returns (address[] memory);

    function getEvaluation(uint256 taskId, address evaluator)
        external
        view
        returns (
            bool committed,
            bool revealed,
            uint16 scoreBps,
            bytes32 bundleHash,
            string memory bundleURI
        );
}

/**
 * @title VerifierRewards
 * @notice Rewards verifiers with MMV Coin for correct final outcomes.
 */
contract VerifierRewards is Ownable {
    uint8 private constant RESOLVED_STATE = 4;

    MMVCoin public immutable rewardToken;
    IVerifierMarketplaceRewards public marketplace;

    uint256 public baseRewardPerTask;
    uint16 public toleranceBps;

    mapping(uint256 => bool) public rewardsPaid;

    event RewardsConfigured(uint256 baseRewardPerTask, uint16 toleranceBps);
    event RewardsPaid(uint256 indexed taskId, uint256 totalMinted, uint256 winnersCount);
    event RewardPaid(uint256 indexed taskId, address indexed verifier, uint256 amount);
    event MarketplaceSet(address indexed marketplace);

    constructor(
        MMVCoin _rewardToken,
        IVerifierMarketplaceRewards _marketplace,
        uint256 _baseRewardPerTask,
        uint16 _toleranceBps
    ) Ownable(msg.sender) {
        require(address(_rewardToken) != address(0), "token=0");
        require(address(_marketplace) != address(0), "marketplace=0");
        rewardToken = _rewardToken;
        marketplace = _marketplace;
        baseRewardPerTask = _baseRewardPerTask;
        toleranceBps = _toleranceBps;

        emit RewardsConfigured(_baseRewardPerTask, _toleranceBps);
        emit MarketplaceSet(address(_marketplace));
    }

    function setMarketplace(IVerifierMarketplaceRewards _marketplace) external onlyOwner {
        require(address(_marketplace) != address(0), "marketplace=0");
        marketplace = _marketplace;
        emit MarketplaceSet(address(_marketplace));
    }

    function configureRewards(uint256 _baseRewardPerTask, uint16 _toleranceBps) external onlyOwner {
        baseRewardPerTask = _baseRewardPerTask;
        toleranceBps = _toleranceBps;
        emit RewardsConfigured(_baseRewardPerTask, _toleranceBps);
    }

    function onTaskFinalized(uint256 taskId) external {
        require(msg.sender == address(marketplace), "only marketplace");
        require(!rewardsPaid[taskId], "rewards already paid");

        (uint8 state,,,,,,,,,,) = marketplace.getTaskMeta(taskId);
        require(state == RESOLVED_STATE, "task not final");

        (uint16 finalScore,,) = marketplace.getTaskFinalOutcome(taskId);

        address[] memory evaluators = marketplace.getEvaluators(taskId);
        uint256 evaluatorsCount = evaluators.length;
        uint256 winnersCount = 0;

        bool[] memory isWinner = new bool[](evaluatorsCount);

        for (uint256 i = 0; i < evaluatorsCount; i++) {
            address evaluator = evaluators[i];
            (
                bool committed,
                bool revealed,
                uint16 scoreBps,
                bytes32 bundleHash,
                string memory bundleURI
            ) = marketplace.getEvaluation(taskId, evaluator);

            if (!committed || !revealed) continue;
            if (bundleHash == bytes32(0)) continue;
            if (bytes(bundleURI).length == 0) continue;

            uint256 diff = scoreBps > finalScore
                ? (scoreBps - finalScore)
                : (finalScore - scoreBps);

            if (diff <= toleranceBps) {
                isWinner[i] = true;
                winnersCount++;
            }
        }

        rewardsPaid[taskId] = true;

        if (winnersCount == 0) {
            emit RewardsPaid(taskId, 0, 0);
            return;
        }

        uint256 rewardPerWinner = baseRewardPerTask / winnersCount;
        require(rewardPerWinner * winnersCount == baseRewardPerTask, "uneven split");

        for (uint256 i = 0; i < evaluatorsCount; i++) {
            if (!isWinner[i]) continue;
            address evaluator = evaluators[i];
            rewardToken.mint(evaluator, rewardPerWinner);
            emit RewardPaid(taskId, evaluator, rewardPerWinner);
        }

        emit RewardsPaid(taskId, baseRewardPerTask, winnersCount);
    }
}
