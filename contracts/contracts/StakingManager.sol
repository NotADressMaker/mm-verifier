// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title StakingManager
 * @notice Manages verifier and auditor stakes with slashing capabilities
 * @dev Handles bonding, unbonding, and slashing for marketplace participants
 */
contract StakingManager is Ownable, ReentrancyGuard {
    // Minimum stake amounts
    uint256 public constant MIN_VERIFIER_STAKE = 0.1 ether;
    uint256 public constant MIN_AUDITOR_STAKE = 0.5 ether;
    uint256 public constant MIN_CHALLENGER_STAKE = 0.01 ether;

    // Unbonding period (7 days)
    uint256 public constant UNBONDING_PERIOD = 7 days;

    // Slashing percentage (50% of stake)
    uint256 public constant SLASH_PERCENTAGE = 50;

    enum StakeType {
        Verifier,
        Auditor,
        Challenger
    }

    struct Stake {
        uint256 amount;
        uint256 lockedAmount;
        uint256 unbondingAmount;
        uint256 unbondingTime;
        StakeType stakeType;
        bool active;
    }

    // Staker address => Stake info
    mapping(address => Stake) public stakes;

    // Total staked by type
    mapping(StakeType => uint256) public totalStaked;

    // Slashed funds pool
    uint256 public slashedPool;

    // Events
    event Staked(address indexed staker, StakeType stakeType, uint256 amount);
    event Unstaked(address indexed staker, uint256 amount);
    event UnbondingStarted(address indexed staker, uint256 amount, uint256 unlockTime);
    event Slashed(address indexed staker, uint256 amount, string reason);
    event StakeLocked(address indexed staker, uint256 amount, bytes32 jobId);
    event StakeUnlocked(address indexed staker, uint256 amount, bytes32 jobId);

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Stake ETH as a verifier
     */
    function stakeAsVerifier() external payable nonReentrant {
        require(msg.value >= MIN_VERIFIER_STAKE, "Insufficient stake amount");
        require(!stakes[msg.sender].active, "Already staked");

        stakes[msg.sender] = Stake({
            amount: msg.value,
            lockedAmount: 0,
            unbondingAmount: 0,
            unbondingTime: 0,
            stakeType: StakeType.Verifier,
            active: true
        });

        totalStaked[StakeType.Verifier] += msg.value;

        emit Staked(msg.sender, StakeType.Verifier, msg.value);
    }

    /**
     * @notice Stake ETH as an auditor
     */
    function stakeAsAuditor() external payable nonReentrant {
        require(msg.value >= MIN_AUDITOR_STAKE, "Insufficient stake amount");
        require(!stakes[msg.sender].active, "Already staked");

        stakes[msg.sender] = Stake({
            amount: msg.value,
            lockedAmount: 0,
            unbondingAmount: 0,
            unbondingTime: 0,
            stakeType: StakeType.Auditor,
            active: true
        });

        totalStaked[StakeType.Auditor] += msg.value;

        emit Staked(msg.sender, StakeType.Auditor, msg.value);
    }

    /**
     * @notice Add more stake to existing position
     */
    function addStake() external payable nonReentrant {
        require(stakes[msg.sender].active, "No active stake");
        require(msg.value > 0, "Amount must be greater than 0");

        stakes[msg.sender].amount += msg.value;
        totalStaked[stakes[msg.sender].stakeType] += msg.value;

        emit Staked(msg.sender, stakes[msg.sender].stakeType, msg.value);
    }

    /**
     * @notice Start unbonding process
     * @param amount Amount to unbond
     */
    function startUnbonding(uint256 amount) external nonReentrant {
        Stake storage stake = stakes[msg.sender];
        require(stake.active, "No active stake");
        require(amount > 0, "Amount must be greater than 0");
        require(stake.amount - stake.lockedAmount >= amount, "Insufficient unlocked stake");
        require(stake.unbondingAmount == 0, "Unbonding already in progress");

        stake.amount -= amount;
        stake.unbondingAmount = amount;
        stake.unbondingTime = block.timestamp + UNBONDING_PERIOD;

        totalStaked[stake.stakeType] -= amount;

        emit UnbondingStarted(msg.sender, amount, stake.unbondingTime);
    }

    /**
     * @notice Complete unbonding and withdraw
     */
    function completeUnbonding() external nonReentrant {
        Stake storage stake = stakes[msg.sender];
        require(stake.unbondingAmount > 0, "No unbonding in progress");
        require(block.timestamp >= stake.unbondingTime, "Unbonding period not completed");

        uint256 amount = stake.unbondingAmount;
        stake.unbondingAmount = 0;
        stake.unbondingTime = 0;

        if (stake.amount == 0 && stake.lockedAmount == 0) {
            stake.active = false;
        }

        payable(msg.sender).transfer(amount);

        emit Unstaked(msg.sender, amount);
    }

    /**
     * @notice Lock stake for a verification job
     * @param staker Address of the staker
     * @param amount Amount to lock
     * @param jobId Job identifier
     */
    function lockStake(address staker, uint256 amount, bytes32 jobId) external onlyOwner {
        Stake storage stake = stakes[staker];
        require(stake.active, "No active stake");
        require(stake.amount - stake.lockedAmount >= amount, "Insufficient unlocked stake");

        stake.lockedAmount += amount;

        emit StakeLocked(staker, amount, jobId);
    }

    /**
     * @notice Unlock stake after job completion
     * @param staker Address of the staker
     * @param amount Amount to unlock
     * @param jobId Job identifier
     */
    function unlockStake(address staker, uint256 amount, bytes32 jobId) external onlyOwner {
        Stake storage stake = stakes[staker];
        require(stake.lockedAmount >= amount, "Insufficient locked stake");

        stake.lockedAmount -= amount;

        emit StakeUnlocked(staker, amount, jobId);
    }

    /**
     * @notice Slash a staker's stake
     * @param staker Address to slash
     * @param reason Reason for slashing
     * @return slashedAmount Amount slashed
     */
    function slash(address staker, string calldata reason) external onlyOwner returns (uint256) {
        Stake storage stake = stakes[staker];
        require(stake.active, "No active stake");
        require(stake.lockedAmount > 0, "No locked stake to slash");

        uint256 slashedAmount = (stake.lockedAmount * SLASH_PERCENTAGE) / 100;

        stake.lockedAmount -= slashedAmount;
        stake.amount -= slashedAmount;
        slashedPool += slashedAmount;

        totalStaked[stake.stakeType] -= slashedAmount;

        emit Slashed(staker, slashedAmount, reason);

        return slashedAmount;
    }

    /**
     * @notice Distribute slashed funds to auditors/challengers
     * @param recipient Address to receive funds
     * @param amount Amount to distribute
     */
    function distributeSlashedFunds(address recipient, uint256 amount) external onlyOwner nonReentrant {
        require(slashedPool >= amount, "Insufficient slashed pool");

        slashedPool -= amount;
        payable(recipient).transfer(amount);
    }

    /**
     * @notice Get stake info for an address
     * @param staker Address to query
     */
    function getStake(address staker) external view returns (Stake memory) {
        return stakes[staker];
    }

    /**
     * @notice Check if address has minimum stake for verifier
     * @param staker Address to check
     */
    function hasVerifierStake(address staker) external view returns (bool) {
        Stake memory stake = stakes[staker];
        return stake.active &&
               stake.stakeType == StakeType.Verifier &&
               (stake.amount - stake.lockedAmount) >= MIN_VERIFIER_STAKE;
    }

    /**
     * @notice Check if address has minimum stake for auditor
     * @param staker Address to check
     */
    function hasAuditorStake(address staker) external view returns (bool) {
        Stake memory stake = stakes[staker];
        return stake.active &&
               stake.stakeType == StakeType.Auditor &&
               (stake.amount - stake.lockedAmount) >= MIN_AUDITOR_STAKE;
    }

    /**
     * @notice Get available (unlocked) stake
     * @param staker Address to query
     */
    function getAvailableStake(address staker) external view returns (uint256) {
        Stake memory stake = stakes[staker];
        if (!stake.active) return 0;
        return stake.amount - stake.lockedAmount;
    }
}
