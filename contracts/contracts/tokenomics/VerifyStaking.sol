// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IWETH.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title VerifyStaking
 * @notice Stake VERIFY tokens to earn protocol revenue (WETH)
 * @dev Implements revenue sharing from marketplace protocol fees
 *
 * How it works:
 * 1. Users stake VERIFY tokens
 * 2. Protocol fees (WETH) distributed proportionally to stakers
 * 3. Users can claim accumulated WETH rewards anytime
 * 4. Unstaking has no lockup period (instant withdrawal)
 *
 * Revenue Formula:
 * userReward = (userStake / totalStaked) * newRevenue
 *
 * Implementation uses "accRewardPerShare" pattern:
 * - Accumulates rewards per share over time
 * - Each user tracks their "debt" (rewards already accounted for)
 * - Pending reward = (userStake * accRewardPerShare) - userDebt
 *
 * Example:
 * - Alice stakes 10K VERIFY (50% of pool)
 * - Bob stakes 10K VERIFY (50% of pool)
 * - Protocol earns 1 WETH in fees
 * - Alice and Bob each earn 0.5 WETH
 */
contract VerifyStaking is ReentrancyGuard, Ownable {
    IERC20 public immutable verifyToken;
    IWETH public immutable weth;

    // Authorized contracts that can distribute revenue
    mapping(address => bool) public isRevenueDistributor;

    // Staking state
    uint256 public totalStaked;
    mapping(address => uint256) public stakedAmount;

    // Reward accounting (scaled by 1e12 for precision)
    uint256 public accRewardPerShare; // Accumulated WETH per staked VERIFY (scaled)
    mapping(address => uint256) public rewardDebt; // Rewards already accounted for

    // Events
    event Staked(address indexed user, uint256 amount, uint256 totalStaked);
    event Unstaked(address indexed user, uint256 amount, uint256 totalStaked);
    event RewardsClaimed(address indexed user, uint256 amount);
    event RevenueDistributed(uint256 amount, uint256 newAccRewardPerShare);
    event RevenueDistributorSet(address indexed distributor, bool authorized);

    constructor(
        IERC20 _verifyToken,
        IWETH _weth
    ) Ownable(msg.sender) {
        require(address(_verifyToken) != address(0), "Invalid token");
        require(address(_weth) != address(0), "Invalid WETH");

        verifyToken = _verifyToken;
        weth = _weth;
    }

    /**
     * @notice Authorize contract to distribute revenue
     * @param distributor Address (e.g., VerificationMarketplace)
     * @param authorized True to authorize, false to revoke
     */
    function setRevenueDistributor(address distributor, bool authorized) external onlyOwner {
        isRevenueDistributor[distributor] = authorized;
        emit RevenueDistributorSet(distributor, authorized);
    }

    /**
     * @notice Stake VERIFY tokens to earn protocol revenue
     * @param amount Amount of VERIFY to stake
     */
    function stake(uint256 amount) external nonReentrant {
        require(amount > 0, "Cannot stake 0");

        // Claim pending rewards first (before stake changes)
        if (stakedAmount[msg.sender] > 0) {
            _claimRewards(msg.sender);
        }

        // Transfer VERIFY from user
        verifyToken.transferFrom(msg.sender, address(this), amount);

        // Update staking state
        stakedAmount[msg.sender] += amount;
        totalStaked += amount;

        // Update reward debt
        rewardDebt[msg.sender] = stakedAmount[msg.sender] * accRewardPerShare / 1e12;

        emit Staked(msg.sender, amount, totalStaked);
    }

    /**
     * @notice Unstake VERIFY tokens (instant withdrawal)
     * @param amount Amount of VERIFY to unstake
     */
    function unstake(uint256 amount) external nonReentrant {
        require(amount > 0, "Cannot unstake 0");
        require(stakedAmount[msg.sender] >= amount, "Insufficient staked");

        // Claim pending rewards first
        _claimRewards(msg.sender);

        // Update staking state
        stakedAmount[msg.sender] -= amount;
        totalStaked -= amount;

        // Transfer VERIFY back to user
        verifyToken.transfer(msg.sender, amount);

        // Update reward debt
        rewardDebt[msg.sender] = stakedAmount[msg.sender] * accRewardPerShare / 1e12;

        emit Unstaked(msg.sender, amount, totalStaked);
    }

    /**
     * @notice Claim accumulated WETH rewards
     */
    function claimRewards() external nonReentrant {
        _claimRewards(msg.sender);
    }

    /**
     * @notice Distribute protocol revenue to stakers
     * @dev Only callable by authorized distributors (e.g., marketplace)
     * @param amount Amount of WETH to distribute
     */
    function distributeRevenue(uint256 amount) external nonReentrant {
        require(isRevenueDistributor[msg.sender], "Not authorized distributor");
        require(amount > 0, "Cannot distribute 0");
        require(totalStaked > 0, "No stakers");

        // Transfer WETH from distributor
        weth.transferFrom(msg.sender, address(this), amount);

        // Update reward per share (scaled by 1e12)
        accRewardPerShare += (amount * 1e12) / totalStaked;

        emit RevenueDistributed(amount, accRewardPerShare);
    }

    /**
     * @notice Get pending WETH rewards for user
     * @param user Address to check
     * @return pending Pending WETH rewards
     */
    function pendingRewards(address user) external view returns (uint256 pending) {
        if (stakedAmount[user] == 0) return 0;

        uint256 accumulatedReward = stakedAmount[user] * accRewardPerShare / 1e12;
        pending = accumulatedReward - rewardDebt[user];
    }

    /**
     * @notice Get staking info for user
     * @param user Address to query
     * @return staked Amount of VERIFY staked
     * @return pending Pending WETH rewards
     * @return shareOfPool Share of total pool (basis points)
     */
    function getStakingInfo(address user) external view returns (
        uint256 staked,
        uint256 pending,
        uint256 shareOfPool
    ) {
        staked = stakedAmount[user];

        if (staked > 0) {
            uint256 accumulatedReward = staked * accRewardPerShare / 1e12;
            pending = accumulatedReward - rewardDebt[user];
            shareOfPool = (staked * 10000) / totalStaked; // In basis points
        }
    }

    /**
     * @notice Internal function to claim rewards
     * @param user Address claiming rewards
     */
    function _claimRewards(address user) internal {
        if (stakedAmount[user] == 0) return;

        uint256 accumulatedReward = stakedAmount[user] * accRewardPerShare / 1e12;
        uint256 pending = accumulatedReward - rewardDebt[user];

        if (pending > 0) {
            weth.transfer(user, pending);
            emit RewardsClaimed(user, pending);
        }

        // Update reward debt
        rewardDebt[user] = accumulatedReward;
    }
}
