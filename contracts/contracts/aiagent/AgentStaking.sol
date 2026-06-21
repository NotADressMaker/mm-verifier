// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title AgentStaking
 * @notice Stake MAMV tokens to delegate to AI agents
 * @dev Users stake tokens to support specific AI agents, share revenue
 *
 * Delegation Model:
 * 1. User stakes MAMV to support specific AI agent
 * 2. Agent performs verifications
 * 3. Agent earns MAMV rewards from mining
 * 4. Rewards split between agent operator + delegators
 *
 * Revenue Split:
 * - 70% to delegators (proportional to stake)
 * - 30% to agent operator
 *
 * Benefits:
 * - Passive income for MAMV holders
 * - Economic backing for agents
 * - Reputation signal (more stake = more trusted)
 * - Slashing protection (shared risk)
 *
 * Example:
 * ```
 * // Stake 1000 MAMV to GPT-4 agent
 * agentStaking.stake(gpt4Agent, 1000e18);
 *
 * // Earn share of agent's verification rewards
 * // Agent earns 100 MAMV → You earn 70% * (your_stake / total_stake)
 *
 * // Unstake anytime
 * agentStaking.unstake(gpt4Agent, 500e18);
 * ```
 */
contract AgentStaking is Ownable, ReentrancyGuard {
    IERC20 public immutable verifyToken;
    address public agentRegistry;

    // Agent pool info
    struct AgentPool {
        address agent;                  // Agent address
        uint256 totalStaked;            // Total MAMV staked to this agent
        uint256 accRewardPerShare;      // Accumulated rewards per share (scaled 1e12)
        uint256 lastRewardBlock;        // Last block rewards were distributed
        uint256 operatorShare;          // Operator's share (basis points, default 3000 = 30%)
        bool active;                    // Pool active
    }

    // User delegation info
    struct DelegationInfo {
        uint256 amount;                 // Amount delegated
        uint256 rewardDebt;             // Reward debt for calculation
        uint256 pendingRewards;         // Unclaimed rewards
        uint256 delegatedAt;            // Delegation timestamp
    }

    // State
    mapping(address => AgentPool) public agentPools;
    mapping(address => mapping(address => DelegationInfo)) public delegations; // user => agent => info
    address[] public agentList;

    // Configuration
    uint256 public defaultOperatorShare = 3000; // 30% to operator
    uint256 public minDelegation = 10e18;       // Min 10 MAMV
    uint256 public unstakeCooldown = 7 days;    // 7 day cooldown

    // Events
    event AgentPoolCreated(
        address indexed agent,
        uint256 operatorShare
    );

    event Staked(
        address indexed user,
        address indexed agent,
        uint256 amount,
        uint256 totalStaked
    );

    event Unstaked(
        address indexed user,
        address indexed agent,
        uint256 amount,
        uint256 totalStaked
    );

    event RewardsDistributed(
        address indexed agent,
        uint256 totalReward,
        uint256 operatorReward,
        uint256 delegatorReward
    );

    event RewardsClaimed(
        address indexed user,
        address indexed agent,
        uint256 amount
    );

    constructor(
        IERC20 _verifyToken,
        address _agentRegistry
    ) Ownable(msg.sender) {
        require(address(_verifyToken) != address(0), "Invalid token");
        require(_agentRegistry != address(0), "Invalid registry");

        verifyToken = _verifyToken;
        agentRegistry = _agentRegistry;
    }

    /**
     * @notice Create agent pool
     * @param agent Agent address
     * @param operatorShare Operator share in basis points
     */
    function createAgentPool(
        address agent,
        uint256 operatorShare
    ) external onlyOwner {
        require(agent != address(0), "Invalid agent");
        require(!agentPools[agent].active, "Pool exists");
        require(operatorShare <= 5000, "Share too high"); // Max 50%

        agentPools[agent] = AgentPool({
            agent: agent,
            totalStaked: 0,
            accRewardPerShare: 0,
            lastRewardBlock: block.number,
            operatorShare: operatorShare,
            active: true
        });

        agentList.push(agent);

        emit AgentPoolCreated(agent, operatorShare);
    }

    /**
     * @notice Stake MAMV to agent
     * @param agent Agent to delegate to
     * @param amount Amount to stake
     */
    function stake(address agent, uint256 amount) external nonReentrant {
        require(amount >= minDelegation, "Below minimum");

        AgentPool storage pool = agentPools[agent];
        require(pool.active, "Pool not active");

        DelegationInfo storage delegation = delegations[msg.sender][agent];

        // Claim pending rewards first
        if (delegation.amount > 0) {
            _claimRewards(msg.sender, agent);
        }

        // Transfer tokens
        verifyToken.transferFrom(msg.sender, address(this), amount);

        // Update delegation
        delegation.amount += amount;
        delegation.delegatedAt = block.timestamp;
        delegation.rewardDebt = delegation.amount * pool.accRewardPerShare / 1e12;

        // Update pool
        pool.totalStaked += amount;

        emit Staked(msg.sender, agent, amount, pool.totalStaked);
    }

    /**
     * @notice Unstake from agent
     * @param agent Agent to undelegate from
     * @param amount Amount to unstake
     */
    function unstake(address agent, uint256 amount) external nonReentrant {
        require(amount > 0, "Cannot unstake 0");

        AgentPool storage pool = agentPools[agent];
        DelegationInfo storage delegation = delegations[msg.sender][agent];

        require(delegation.amount >= amount, "Insufficient delegation");
        require(
            block.timestamp >= delegation.delegatedAt + unstakeCooldown,
            "Cooldown active"
        );

        // Claim pending rewards
        _claimRewards(msg.sender, agent);

        // Update delegation
        delegation.amount -= amount;
        delegation.rewardDebt = delegation.amount * pool.accRewardPerShare / 1e12;

        // Update pool
        pool.totalStaked -= amount;

        // Transfer tokens
        verifyToken.transfer(msg.sender, amount);

        emit Unstaked(msg.sender, agent, amount, pool.totalStaked);
    }

    /**
     * @notice Claim rewards from agent
     * @param agent Agent to claim from
     * @return claimed Amount claimed
     */
    function claimRewards(address agent) external nonReentrant returns (uint256 claimed) {
        return _claimRewards(msg.sender, agent);
    }

    /**
     * @notice Distribute rewards to agent pool (called by mining contract)
     * @param agent Agent that earned rewards
     * @param totalReward Total reward amount
     */
    function distributeRewards(address agent, uint256 totalReward)
        external
        nonReentrant
        onlyOwner
    {
        require(totalReward > 0, "No rewards");

        AgentPool storage pool = agentPools[agent];
        require(pool.active, "Pool not active");
        require(pool.totalStaked > 0, "No delegators");

        // Transfer rewards from caller
        verifyToken.transferFrom(msg.sender, address(this), totalReward);

        // Calculate splits
        uint256 operatorReward = (totalReward * pool.operatorShare) / 10000;
        uint256 delegatorReward = totalReward - operatorReward;

        // Send operator share immediately
        if (operatorReward > 0) {
            verifyToken.transfer(agent, operatorReward);
        }

        // Update reward per share for delegators
        if (delegatorReward > 0 && pool.totalStaked > 0) {
            pool.accRewardPerShare += (delegatorReward * 1e12) / pool.totalStaked;
        }

        emit RewardsDistributed(agent, totalReward, operatorReward, delegatorReward);
    }

    /**
     * @notice Get pending rewards for user
     * @param user User address
     * @param agent Agent address
     * @return pending Pending rewards
     */
    function pendingRewards(address user, address agent)
        external
        view
        returns (uint256 pending)
    {
        AgentPool memory pool = agentPools[agent];
        DelegationInfo memory delegation = delegations[user][agent];

        if (delegation.amount == 0) return 0;

        uint256 accumulatedReward = delegation.amount * pool.accRewardPerShare / 1e12;
        pending = accumulatedReward - delegation.rewardDebt + delegation.pendingRewards;

        return pending;
    }

    /**
     * @notice Get user's total staked across all agents
     * @param user User address
     * @return totalStaked Total staked
     * @return agents Array of agents delegated to
     */
    function getUserTotalStaked(address user)
        external
        view
        returns (uint256 totalStaked, address[] memory agents)
    {
        uint256 count = 0;
        for (uint256 i = 0; i < agentList.length; i++) {
            if (delegations[user][agentList[i]].amount > 0) {
                totalStaked += delegations[user][agentList[i]].amount;
                count++;
            }
        }

        agents = new address[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < agentList.length; i++) {
            if (delegations[user][agentList[i]].amount > 0) {
                agents[idx] = agentList[i];
                idx++;
            }
        }
    }

    /**
     * @notice Get agent's total delegated stake
     * @param agent Agent address
     * @return totalStaked Total staked to agent
     */
    function getAgentTotalStaked(address agent) external view returns (uint256) {
        return agentPools[agent].totalStaked;
    }

    /**
     * @notice Get top agents by stake
     * @param limit Max number to return
     * @return topAgents Array of top agents
     * @return stakes Array of stake amounts
     */
    function getTopAgentsByStake(uint256 limit)
        external
        view
        returns (address[] memory topAgents, uint256[] memory stakes)
    {
        uint256 count = agentList.length < limit ? agentList.length : limit;

        topAgents = new address[](count);
        stakes = new uint256[](count);

        // Simple selection (production would use heap/sorting)
        for (uint256 i = 0; i < count && i < agentList.length; i++) {
            topAgents[i] = agentList[i];
            stakes[i] = agentPools[agentList[i]].totalStaked;
        }
    }

    /**
     * @notice Internal claim function
     * @param user User address
     * @param agent Agent address
     * @return claimed Amount claimed
     */
    function _claimRewards(address user, address agent)
        internal
        returns (uint256 claimed)
    {
        AgentPool storage pool = agentPools[agent];
        DelegationInfo storage delegation = delegations[user][agent];

        if (delegation.amount == 0) return 0;

        uint256 accumulatedReward = delegation.amount * pool.accRewardPerShare / 1e12;
        uint256 pending = accumulatedReward - delegation.rewardDebt;
        claimed = pending + delegation.pendingRewards;

        if (claimed > 0) {
            delegation.pendingRewards = 0;
            delegation.rewardDebt = accumulatedReward;

            verifyToken.transfer(user, claimed);

            emit RewardsClaimed(user, agent, claimed);
        }

        return claimed;
    }

    /**
     * @notice Update agent pool settings
     * @param agent Agent address
     * @param operatorShare New operator share
     */
    function setAgentPoolSettings(
        address agent,
        uint256 operatorShare
    ) external onlyOwner {
        require(agentPools[agent].active, "Pool not active");
        require(operatorShare <= 5000, "Share too high");

        agentPools[agent].operatorShare = operatorShare;
    }

    /**
     * @notice Update configuration
     * @param _minDelegation New min delegation
     * @param _unstakeCooldown New unstake cooldown
     */
    function setConfig(
        uint256 _minDelegation,
        uint256 _unstakeCooldown
    ) external onlyOwner {
        minDelegation = _minDelegation;
        unstakeCooldown = _unstakeCooldown;
    }

    /**
     * @notice Get agent count
     * @return count Number of agent pools
     */
    function getAgentCount() external view returns (uint256) {
        return agentList.length;
    }
}
