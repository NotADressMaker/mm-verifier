// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title VerifierRegistry
 * @notice Lifecycle registry for verifiers with staking, reputation, and slashing hooks.
 */
contract VerifierRegistry is Ownable, ReentrancyGuard {
    enum Status {
        UNREGISTERED,
        ACTIVE,
        EXITING,
        SLASHED
    }

    struct Verifier {
        uint256 stake;
        Status status;
        uint64 reputationScore;
        uint32 jobsCompleted;
        uint32 disputesWon;
        uint32 disputesLost;
        uint64 lastActiveAt;
        uint64 exitRequestedAt;
        address operator;
        string metadataURI;
    }

    uint256 public minStake;
    uint64 public withdrawDelay;
    uint64 public minReceiptInterval;
    uint64 public reputationReward;
    uint64 public reputationPenalty;
    uint64 public disputeWinReward;
    uint64 public disputeLossPenalty;

    mapping(address => Verifier) private verifiers;
    mapping(address => bool) public authorizedCallers;

    event VerifierRegistered(address indexed verifier, address indexed operator, uint256 stake, string metadataURI);
    event StakeDeposited(address indexed verifier, uint256 amount, uint256 newStake);
    event ExitRequested(address indexed verifier, uint64 availableAt);
    event StakeWithdrawn(address indexed verifier, uint256 amount, uint256 remainingStake);
    event ActiveStatusChanged(address indexed verifier, Status status);
    event VerifierSlashed(address indexed verifier, uint256 amount, uint256 newStake, bytes32 reason);
    event ReputationUpdated(address indexed verifier, uint64 newScore, uint32 jobsCompleted, uint32 disputesWon, uint32 disputesLost);
    event AuthorizedCallerSet(address indexed caller, bool allowed);
    event MinStakeSet(uint256 minStake);
    event WithdrawDelaySet(uint64 withdrawDelay);
    event MinReceiptIntervalSet(uint64 minReceiptInterval);
    event ReputationConfigSet(uint64 reward, uint64 penalty, uint64 disputeWinReward, uint64 disputeLossPenalty);

    constructor(
        uint256 _minStake,
        uint64 _withdrawDelay,
        uint64 _minReceiptInterval,
        uint64 _reputationReward,
        uint64 _reputationPenalty,
        uint64 _disputeWinReward,
        uint64 _disputeLossPenalty
    ) Ownable(msg.sender) {
        minStake = _minStake;
        withdrawDelay = _withdrawDelay;
        minReceiptInterval = _minReceiptInterval;
        reputationReward = _reputationReward;
        reputationPenalty = _reputationPenalty;
        disputeWinReward = _disputeWinReward;
        disputeLossPenalty = _disputeLossPenalty;
    }

    modifier onlyAuthorized() {
        require(authorizedCallers[msg.sender], "not authorized");
        _;
    }

    function registerVerifier(string calldata metadataURI, address operator) external payable {
        Verifier storage verifier = verifiers[msg.sender];
        require(verifier.status == Status.UNREGISTERED, "already registered");
        require(msg.value >= minStake, "insufficient stake");

        verifier.stake = msg.value;
        verifier.status = Status.ACTIVE;
        verifier.operator = operator == address(0) ? msg.sender : operator;
        verifier.metadataURI = metadataURI;
        if (minReceiptInterval > block.timestamp) {
            verifier.lastActiveAt = 0;
        } else {
            verifier.lastActiveAt = uint64(block.timestamp - minReceiptInterval);
        }

        emit VerifierRegistered(msg.sender, verifier.operator, msg.value, metadataURI);
    }

    function depositStake() external payable {
        Verifier storage verifier = verifiers[msg.sender];
        require(verifier.status != Status.UNREGISTERED, "not registered");
        require(msg.value > 0, "zero deposit");
        verifier.stake += msg.value;
        if (verifier.stake >= minStake && verifier.status == Status.EXITING) {
            verifier.status = Status.ACTIVE;
            verifier.exitRequestedAt = 0;
            emit ActiveStatusChanged(msg.sender, Status.ACTIVE);
        }
        emit StakeDeposited(msg.sender, msg.value, verifier.stake);
    }

    function requestExit() external {
        Verifier storage verifier = verifiers[msg.sender];
        require(verifier.status == Status.ACTIVE, "not active");
        verifier.status = Status.EXITING;
        verifier.exitRequestedAt = uint64(block.timestamp);
        emit ExitRequested(msg.sender, verifier.exitRequestedAt + withdrawDelay);
        emit ActiveStatusChanged(msg.sender, Status.EXITING);
    }

    function withdrawStake(uint256 amount) external nonReentrant {
        Verifier storage verifier = verifiers[msg.sender];
        require(verifier.status == Status.EXITING, "not exiting");
        require(block.timestamp >= verifier.exitRequestedAt + withdrawDelay, "cooldown");
        require(amount > 0 && amount <= verifier.stake, "invalid amount");

        verifier.stake -= amount;
        if (verifier.stake == 0) {
            verifier.status = Status.UNREGISTERED;
        }

        (bool success, ) = msg.sender.call{ value: amount }("");
        require(success, "withdraw failed");

        emit StakeWithdrawn(msg.sender, amount, verifier.stake);
        emit ActiveStatusChanged(msg.sender, verifier.status);
    }

    function setActive(bool active) external {
        Verifier storage verifier = verifiers[msg.sender];
        require(verifier.status != Status.UNREGISTERED, "not registered");
        if (active) {
            require(verifier.stake >= minStake, "stake too low");
            verifier.status = Status.ACTIVE;
            verifier.exitRequestedAt = 0;
        } else {
            verifier.status = Status.EXITING;
            verifier.exitRequestedAt = uint64(block.timestamp);
        }
        emit ActiveStatusChanged(msg.sender, verifier.status);
    }

    function setAuthorizedCaller(address caller, bool allowed) external onlyOwner {
        authorizedCallers[caller] = allowed;
        emit AuthorizedCallerSet(caller, allowed);
    }

    function setMinStake(uint256 _minStake) external onlyOwner {
        minStake = _minStake;
        emit MinStakeSet(_minStake);
    }

    function setWithdrawDelay(uint64 _withdrawDelay) external onlyOwner {
        withdrawDelay = _withdrawDelay;
        emit WithdrawDelaySet(_withdrawDelay);
    }

    function setMinReceiptInterval(uint64 _minReceiptInterval) external onlyOwner {
        minReceiptInterval = _minReceiptInterval;
        emit MinReceiptIntervalSet(_minReceiptInterval);
    }

    function setReputationConfig(
        uint64 _reputationReward,
        uint64 _reputationPenalty,
        uint64 _disputeWinReward,
        uint64 _disputeLossPenalty
    ) external onlyOwner {
        reputationReward = _reputationReward;
        reputationPenalty = _reputationPenalty;
        disputeWinReward = _disputeWinReward;
        disputeLossPenalty = _disputeLossPenalty;
        emit ReputationConfigSet(_reputationReward, _reputationPenalty, _disputeWinReward, _disputeLossPenalty);
    }

    function canSubmitReceipt(address verifier) external view returns (bool) {
        Verifier storage info = verifiers[verifier];
        if (info.status != Status.ACTIVE) {
            return false;
        }
        return block.timestamp >= info.lastActiveAt + minReceiptInterval;
    }

    function recordActivity(address verifier) external onlyAuthorized {
        Verifier storage info = verifiers[verifier];
        require(info.status == Status.ACTIVE, "inactive verifier");
        info.lastActiveAt = uint64(block.timestamp);
    }

    function recordReceiptResult(address verifier, bool accurate) external onlyAuthorized {
        Verifier storage info = verifiers[verifier];
        info.jobsCompleted += 1;
        if (accurate) {
            info.reputationScore += reputationReward;
        } else if (info.reputationScore > reputationPenalty) {
            info.reputationScore -= reputationPenalty;
        } else {
            info.reputationScore = 0;
        }
        emit ReputationUpdated(verifier, info.reputationScore, info.jobsCompleted, info.disputesWon, info.disputesLost);
    }

    function recordDisputeResult(address verifier, bool verifierWon) external onlyAuthorized {
        Verifier storage info = verifiers[verifier];
        if (verifierWon) {
            info.disputesWon += 1;
            info.reputationScore += disputeWinReward;
        } else {
            info.disputesLost += 1;
            if (info.reputationScore > disputeLossPenalty) {
                info.reputationScore -= disputeLossPenalty;
            } else {
                info.reputationScore = 0;
            }
        }
        emit ReputationUpdated(verifier, info.reputationScore, info.jobsCompleted, info.disputesWon, info.disputesLost);
    }

    function slashVerifier(address verifier, uint16 bps, address recipient, bytes32 reason)
        external
        onlyAuthorized
        nonReentrant
        returns (uint256 slashedAmount)
    {
        require(bps <= 10_000, "bps too high");
        Verifier storage info = verifiers[verifier];
        slashedAmount = (info.stake * bps) / 10_000;
        info.stake -= slashedAmount;

        if (info.stake < minStake) {
            info.status = Status.SLASHED;
            emit ActiveStatusChanged(verifier, Status.SLASHED);
        }

        if (slashedAmount > 0) {
            (bool success, ) = recipient.call{ value: slashedAmount }("");
            require(success, "slash transfer failed");
        }

        emit VerifierSlashed(verifier, slashedAmount, info.stake, reason);
    }

    function getVerifier(address verifier)
        external
        view
        returns (
            uint256 stake,
            Status status,
            uint64 reputationScore,
            uint32 jobsCompleted,
            uint32 disputesWon,
            uint32 disputesLost,
            uint64 lastActiveAt,
            uint64 exitRequestedAt,
            address operator,
            string memory metadataURI
        )
    {
        Verifier storage info = verifiers[verifier];
        return (
            info.stake,
            info.status,
            info.reputationScore,
            info.jobsCompleted,
            info.disputesWon,
            info.disputesLost,
            info.lastActiveAt,
            info.exitRequestedAt,
            info.operator,
            info.metadataURI
        );
    }

    function selectionWeight(address verifier) external view returns (uint256) {
        Verifier storage info = verifiers[verifier];
        if (info.status != Status.ACTIVE) {
            return 0;
        }
        return info.stake + uint256(info.reputationScore) * 1e14;
    }

    function statusOf(address verifier) external view returns (Status) {
        return verifiers[verifier].status;
    }

    function stakeOf(address verifier) external view returns (uint256) {
        return verifiers[verifier].stake;
    }
}
