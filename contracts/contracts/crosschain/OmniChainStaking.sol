// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title OmniChainStaking
 * @notice Stake MAMV on any chain, earn rewards everywhere
 * @dev Cross-chain staking aggregator using message passing
 *
 * Architecture:
 * - Each chain has its own OmniChainStaking contract
 * - Stakes are tracked locally but aggregated globally
 * - Rewards distributed proportionally across all chains
 * - Uses LayerZero for cross-chain communication
 *
 * Example Flow:
 * 1. Alice stakes 1000 MAMV on Arbitrum
 * 2. Contract sends message to Ethereum (main chain)
 * 3. Ethereum updates global stake count
 * 4. When rewards distributed on any chain, Alice can claim proportionally
 *
 * Benefits:
 * - Stake on cheap L2s, earn from mainnet revenue
 * - Unified liquidity across chains
 * - No need to bridge tokens for staking
 * - Gas-efficient reward distribution
 */
contract OmniChainStaking is Ownable, ReentrancyGuard {
    IERC20 public immutable verifyToken;

    // Chain info
    uint16 public immutable chainId; // LayerZero chain ID
    address public mainChainContract; // Main staking contract address
    bool public isMainChain;

    // Staking state
    uint256 public totalStaked;
    mapping(address => uint256) public stakedAmount;

    // Cross-chain state
    uint256 public globalTotalStaked; // Updated from main chain
    uint256 public lastSyncBlock;

    // Reward accounting (same pattern as VerifyStaking)
    uint256 public accRewardPerShare; // Scaled by 1e12
    mapping(address => uint256) public rewardDebt;

    // Bridge configuration
    mapping(uint16 => address) public chainContracts; // Remote chain contracts
    mapping(uint16 => bool) public trustedChains;

    // Pending cross-chain messages
    uint256 public messageNonce;
    mapping(bytes32 => bool) public processedMessages;

    // Events
    event Staked(address indexed user, uint256 amount, uint256 chainStaked);
    event Unstaked(address indexed user, uint256 amount, uint256 chainStaked);
    event RewardsClaimed(address indexed user, uint256 amount);
    event CrossChainStakeSync(uint16 indexed chainId, uint256 totalStaked, uint256 globalStaked);
    event RewardsDistributed(uint256 amount, uint256 newAccRewardPerShare);
    event ChainTrusted(uint16 indexed chainId, address contractAddress, bool trusted);

    constructor(
        IERC20 _verifyToken,
        uint16 _chainId,
        bool _isMainChain
    ) Ownable(msg.sender) {
        verifyToken = _verifyToken;
        chainId = _chainId;
        isMainChain = _isMainChain;
    }

    /**
     * @notice Configure trusted chain
     * @param remoteChainId LayerZero chain ID
     * @param remoteContract Contract address on remote chain
     * @param trusted True to trust, false to untrust
     */
    function setTrustedChain(
        uint16 remoteChainId,
        address remoteContract,
        bool trusted
    ) external onlyOwner {
        chainContracts[remoteChainId] = remoteContract;
        trustedChains[remoteChainId] = trusted;
        emit ChainTrusted(remoteChainId, remoteContract, trusted);
    }

    /**
     * @notice Set main chain contract address
     * @param _mainChainContract Address of main chain contract
     */
    function setMainChainContract(address _mainChainContract) external onlyOwner {
        require(!isMainChain, "Already main chain");
        mainChainContract = _mainChainContract;
    }

    /**
     * @notice Stake MAMV tokens
     * @param amount Amount to stake
     */
    function stake(uint256 amount) external nonReentrant {
        require(amount > 0, "Cannot stake 0");

        // Claim pending rewards first
        if (stakedAmount[msg.sender] > 0) {
            _claimRewards(msg.sender);
        }

        // Transfer tokens
        verifyToken.transferFrom(msg.sender, address(this), amount);

        // Update local state
        stakedAmount[msg.sender] += amount;
        totalStaked += amount;

        // Update reward debt
        rewardDebt[msg.sender] = stakedAmount[msg.sender] * accRewardPerShare / 1e12;

        emit Staked(msg.sender, amount, totalStaked);

        // Sync with main chain (if not main chain)
        if (!isMainChain) {
            _syncToMainChain();
        } else {
            // Update global total
            globalTotalStaked += amount;
        }
    }

    /**
     * @notice Unstake MAMV tokens
     * @param amount Amount to unstake
     */
    function unstake(uint256 amount) external nonReentrant {
        require(amount > 0, "Cannot unstake 0");
        require(stakedAmount[msg.sender] >= amount, "Insufficient staked");

        // Claim pending rewards
        _claimRewards(msg.sender);

        // Update local state
        stakedAmount[msg.sender] -= amount;
        totalStaked -= amount;

        // Transfer tokens
        verifyToken.transfer(msg.sender, amount);

        // Update reward debt
        rewardDebt[msg.sender] = stakedAmount[msg.sender] * accRewardPerShare / 1e12;

        emit Unstaked(msg.sender, amount, totalStaked);

        // Sync with main chain
        if (!isMainChain) {
            _syncToMainChain();
        } else {
            globalTotalStaked -= amount;
        }
    }

    /**
     * @notice Claim accumulated rewards
     */
    function claimRewards() external nonReentrant {
        _claimRewards(msg.sender);
    }

    /**
     * @notice Distribute rewards (called by revenue distributor)
     * @param amount Amount to distribute
     */
    function distributeRewards(uint256 amount) external nonReentrant onlyOwner {
        require(amount > 0, "Cannot distribute 0");
        require(totalStaked > 0, "No stakers");

        // Transfer tokens
        verifyToken.transferFrom(msg.sender, address(this), amount);

        // Update reward per share
        accRewardPerShare += (amount * 1e12) / totalStaked;

        emit RewardsDistributed(amount, accRewardPerShare);
    }

    /**
     * @notice Receive cross-chain stake update (from LayerZero relayer)
     * @param srcChainId Source chain ID
     * @param srcTotalStaked Total staked on source chain
     */
    function receiveStakeUpdate(
        uint16 srcChainId,
        uint256 srcTotalStaked
    ) external onlyOwner nonReentrant {
        require(trustedChains[srcChainId], "Untrusted chain");
        require(isMainChain, "Only main chain can receive updates");

        // Update global total
        // Note: This is simplified - production would track per-chain and aggregate
        globalTotalStaked = srcTotalStaked;
        lastSyncBlock = block.number;

        emit CrossChainStakeSync(srcChainId, srcTotalStaked, globalTotalStaked);
    }

    /**
     * @notice Get pending rewards for user
     * @param user Address to check
     * @return pending Pending rewards
     */
    function pendingRewards(address user) external view returns (uint256 pending) {
        if (stakedAmount[user] == 0) return 0;

        uint256 accumulatedReward = stakedAmount[user] * accRewardPerShare / 1e12;
        pending = accumulatedReward - rewardDebt[user];
    }

    /**
     * @notice Get staking info for user
     * @param user Address to query
     * @return staked Amount staked
     * @return pending Pending rewards
     * @return shareOfChain Share of this chain's pool (bps)
     * @return shareOfGlobal Share of global pool (bps)
     */
    function getStakingInfo(address user) external view returns (
        uint256 staked,
        uint256 pending,
        uint256 shareOfChain,
        uint256 shareOfGlobal
    ) {
        staked = stakedAmount[user];

        if (staked > 0) {
            uint256 accumulatedReward = staked * accRewardPerShare / 1e12;
            pending = accumulatedReward - rewardDebt[user];
            shareOfChain = (staked * 10000) / totalStaked;

            if (globalTotalStaked > 0) {
                shareOfGlobal = (staked * 10000) / globalTotalStaked;
            }
        }
    }

    /**
     * @notice Internal claim rewards
     * @param user User claiming
     */
    function _claimRewards(address user) internal {
        if (stakedAmount[user] == 0) return;

        uint256 accumulatedReward = stakedAmount[user] * accRewardPerShare / 1e12;
        uint256 pending = accumulatedReward - rewardDebt[user];

        if (pending > 0) {
            verifyToken.transfer(user, pending);
            emit RewardsClaimed(user, pending);
        }

        rewardDebt[user] = accumulatedReward;
    }

    /**
     * @notice Sync local stake to main chain
     */
    function _syncToMainChain() internal {
        // In production, this would call LayerZero to send message
        // For now, emit event for off-chain relayer
        messageNonce++;
        emit CrossChainStakeSync(chainId, totalStaked, globalTotalStaked);
    }
}
