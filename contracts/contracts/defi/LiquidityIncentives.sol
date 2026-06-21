// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title LiquidityIncentives
 * @notice Reward liquidity providers with MAMV tokens
 * @dev Incentivize deep liquidity for MAMV/WETH pairs on DEXes
 *
 * Supported DEXes:
 * - Uniswap V2/V3
 * - Sushiswap
 * - Curve (stableswap)
 * - Balancer
 *
 * How it works:
 * 1. Users provide liquidity on supported DEX (get LP tokens)
 * 2. Stake LP tokens in this contract
 * 3. Earn MAMV tokens proportionally
 * 4. Rewards emitted per block (like Masterchef)
 *
 * Benefits:
 * - Deep liquidity for MAMV token
 * - Reduced slippage for traders
 * - Additional yield for LPs
 * - Price stability
 *
 * Example:
 * ```
 * // Add liquidity on Uniswap V2
 * lpToken = uniswapV2.addLiquidity(MAMV, WETH, 1000e18, 10e18);
 *
 * // Stake LP tokens
 * lpToken.approve(incentives, amount);
 * incentives.stake(0, amount); // Pool 0 = MAMV/WETH
 *
 * // Harvest rewards
 * incentives.harvest(0);
 * ```
 */
contract LiquidityIncentives is Ownable, ReentrancyGuard {
    IERC20 public immutable verifyToken;

    // Pool info
    struct PoolInfo {
        IERC20 lpToken;         // LP token contract
        uint256 allocPoint;     // Allocation points (weight)
        uint256 lastRewardBlock;
        uint256 accRewardPerShare; // Scaled by 1e12
        uint256 totalStaked;
        bool active;
        string name;            // Pool name (e.g., "Uniswap V2 MAMV/WETH")
    }

    // User info
    struct UserInfo {
        uint256 amount;         // LP tokens staked
        uint256 rewardDebt;     // Rewards already accounted for
        uint256 pendingRewards; // Rewards ready to claim
    }

    // State
    PoolInfo[] public poolInfo;
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;

    uint256 public rewardPerBlock = 10e18; // 10 MAMV per block
    uint256 public totalAllocPoint = 0;
    uint256 public startBlock;

    // Bonus multiplier (for early adopters)
    uint256 public constant BONUS_MULTIPLIER = 1; // Can be >1 for early bonus

    // Events
    event PoolAdded(
        uint256 indexed pid,
        address indexed lpToken,
        uint256 allocPoint,
        string name
    );
    event Staked(address indexed user, uint256 indexed pid, uint256 amount);
    event Unstaked(address indexed user, uint256 indexed pid, uint256 amount);
    event Harvested(address indexed user, uint256 indexed pid, uint256 amount);
    event EmissionRateUpdated(uint256 newRate);

    constructor(
        IERC20 _verifyToken,
        uint256 _startBlock
    ) Ownable(msg.sender) {
        verifyToken = _verifyToken;
        startBlock = _startBlock > 0 ? _startBlock : block.number;
    }

    /**
     * @notice Add new LP pool
     * @param lpToken LP token address
     * @param allocPoint Allocation weight
     * @param name Pool name
     * @param withUpdate Update all pools first
     */
    function addPool(
        IERC20 lpToken,
        uint256 allocPoint,
        string calldata name,
        bool withUpdate
    ) external onlyOwner {
        if (withUpdate) {
            massUpdatePools();
        }

        uint256 lastRewardBlock = block.number > startBlock ? block.number : startBlock;
        totalAllocPoint += allocPoint;

        poolInfo.push(PoolInfo({
            lpToken: lpToken,
            allocPoint: allocPoint,
            lastRewardBlock: lastRewardBlock,
            accRewardPerShare: 0,
            totalStaked: 0,
            active: true,
            name: name
        }));

        emit PoolAdded(poolInfo.length - 1, address(lpToken), allocPoint, name);
    }

    /**
     * @notice Update pool allocation
     * @param pid Pool ID
     * @param allocPoint New allocation points
     * @param withUpdate Update all pools first
     */
    function setPool(
        uint256 pid,
        uint256 allocPoint,
        bool withUpdate
    ) external onlyOwner {
        if (withUpdate) {
            massUpdatePools();
        }

        totalAllocPoint = totalAllocPoint - poolInfo[pid].allocPoint + allocPoint;
        poolInfo[pid].allocPoint = allocPoint;
    }

    /**
     * @notice Stake LP tokens
     * @param pid Pool ID
     * @param amount Amount to stake
     */
    function stake(uint256 pid, uint256 amount) external nonReentrant {
        require(pid < poolInfo.length, "Invalid pool");
        require(amount > 0, "Cannot stake 0");

        PoolInfo storage pool = poolInfo[pid];
        UserInfo storage user = userInfo[pid][msg.sender];

        require(pool.active, "Pool not active");

        updatePool(pid);

        // Harvest pending rewards
        if (user.amount > 0) {
            uint256 pending = (user.amount * pool.accRewardPerShare / 1e12) - user.rewardDebt;
            if (pending > 0) {
                user.pendingRewards += pending;
            }
        }

        // Transfer LP tokens
        pool.lpToken.transferFrom(msg.sender, address(this), amount);

        // Update state
        user.amount += amount;
        pool.totalStaked += amount;
        user.rewardDebt = user.amount * pool.accRewardPerShare / 1e12;

        emit Staked(msg.sender, pid, amount);
    }

    /**
     * @notice Unstake LP tokens
     * @param pid Pool ID
     * @param amount Amount to unstake
     */
    function unstake(uint256 pid, uint256 amount) external nonReentrant {
        require(pid < poolInfo.length, "Invalid pool");
        require(amount > 0, "Cannot unstake 0");

        PoolInfo storage pool = poolInfo[pid];
        UserInfo storage user = userInfo[pid][msg.sender];

        require(user.amount >= amount, "Insufficient balance");

        updatePool(pid);

        // Harvest pending rewards
        uint256 pending = (user.amount * pool.accRewardPerShare / 1e12) - user.rewardDebt;
        if (pending > 0) {
            user.pendingRewards += pending;
        }

        // Update state
        user.amount -= amount;
        pool.totalStaked -= amount;
        user.rewardDebt = user.amount * pool.accRewardPerShare / 1e12;

        // Transfer LP tokens back
        pool.lpToken.transfer(msg.sender, amount);

        emit Unstaked(msg.sender, pid, amount);
    }

    /**
     * @notice Harvest rewards
     * @param pid Pool ID
     * @return harvested Amount harvested
     */
    function harvest(uint256 pid) external nonReentrant returns (uint256 harvested) {
        require(pid < poolInfo.length, "Invalid pool");

        PoolInfo storage pool = poolInfo[pid];
        UserInfo storage user = userInfo[pid][msg.sender];

        updatePool(pid);

        // Calculate pending
        uint256 pending = (user.amount * pool.accRewardPerShare / 1e12) - user.rewardDebt;
        harvested = pending + user.pendingRewards;

        if (harvested > 0) {
            user.pendingRewards = 0;
            user.rewardDebt = user.amount * pool.accRewardPerShare / 1e12;

            verifyToken.transfer(msg.sender, harvested);

            emit Harvested(msg.sender, pid, harvested);
        }

        return harvested;
    }

    /**
     * @notice Update pool rewards
     * @param pid Pool ID
     */
    function updatePool(uint256 pid) public {
        PoolInfo storage pool = poolInfo[pid];

        if (block.number <= pool.lastRewardBlock) {
            return;
        }

        if (pool.totalStaked == 0 || pool.allocPoint == 0) {
            pool.lastRewardBlock = block.number;
            return;
        }

        uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
        uint256 reward = (multiplier * rewardPerBlock * pool.allocPoint) / totalAllocPoint;

        pool.accRewardPerShare += (reward * 1e12) / pool.totalStaked;
        pool.lastRewardBlock = block.number;
    }

    /**
     * @notice Update all pools
     */
    function massUpdatePools() public {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; pid++) {
            updatePool(pid);
        }
    }

    /**
     * @notice Get multiplier for block range
     * @param from From block
     * @param to To block
     * @return multiplier Block multiplier
     */
    function getMultiplier(uint256 from, uint256 to) public pure returns (uint256) {
        return (to - from) * BONUS_MULTIPLIER;
    }

    /**
     * @notice Get pending rewards for user
     * @param pid Pool ID
     * @param user User address
     * @return pending Pending rewards
     */
    function pendingRewards(uint256 pid, address user)
        external
        view
        returns (uint256 pending)
    {
        PoolInfo memory pool = poolInfo[pid];
        UserInfo memory userInfo_ = userInfo[pid][user];

        uint256 accRewardPerShare = pool.accRewardPerShare;

        if (block.number > pool.lastRewardBlock && pool.totalStaked > 0) {
            uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
            uint256 reward = (multiplier * rewardPerBlock * pool.allocPoint) / totalAllocPoint;
            accRewardPerShare += (reward * 1e12) / pool.totalStaked;
        }

        pending = (userInfo_.amount * accRewardPerShare / 1e12) - userInfo_.rewardDebt;
        pending += userInfo_.pendingRewards;

        return pending;
    }

    /**
     * @notice Get user info across all pools
     * @param user User address
     * @return stakes Array of staked amounts per pool
     * @return rewards Array of pending rewards per pool
     */
    function getUserInfoAll(address user)
        external
        view
        returns (uint256[] memory stakes, uint256[] memory rewards)
    {
        uint256 length = poolInfo.length;
        stakes = new uint256[](length);
        rewards = new uint256[](length);

        for (uint256 pid = 0; pid < length; pid++) {
            stakes[pid] = userInfo[pid][user].amount;

            PoolInfo memory pool = poolInfo[pid];
            UserInfo memory userInfo_ = userInfo[pid][user];

            uint256 accRewardPerShare = pool.accRewardPerShare;
            if (block.number > pool.lastRewardBlock && pool.totalStaked > 0) {
                uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
                uint256 reward = (multiplier * rewardPerBlock * pool.allocPoint) / totalAllocPoint;
                accRewardPerShare += (reward * 1e12) / pool.totalStaked;
            }

            rewards[pid] = (userInfo_.amount * accRewardPerShare / 1e12) - userInfo_.rewardDebt;
            rewards[pid] += userInfo_.pendingRewards;
        }
    }

    /**
     * @notice Update emission rate
     * @param _rewardPerBlock New reward per block
     */
    function setRewardPerBlock(uint256 _rewardPerBlock) external onlyOwner {
        massUpdatePools();
        rewardPerBlock = _rewardPerBlock;
        emit EmissionRateUpdated(_rewardPerBlock);
    }

    /**
     * @notice Get number of pools
     * @return count Pool count
     */
    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }
}
