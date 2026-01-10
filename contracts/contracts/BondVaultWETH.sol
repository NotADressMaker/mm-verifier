// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IWETH.sol";
import "./libraries/VerifierTypes.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title BondVaultWETH
 * @notice Centralized WETH bond management for LLM Verifier system
 * @dev Manages bonds for both marketplace tasks and dispute resolution
 *
 * Authorization Model:
 * - lockBond/unlockBond: Marketplace only (for task participation)
 * - slashBond: DisputeLadder only (for dispute penalties)
 * - payReward: Both Marketplace and DisputeLadder (for rewards distribution)
 * - deposit/withdraw: Any user (self-service bond management)
 *
 * Design Principles:
 * 1. Separation of concerns: One contract manages all bonds
 * 2. Immutable authorization: No owner, authorization via constructor
 * 3. Transparent accounting: Free vs locked bonds tracked separately
 * 4. Gas efficiency: Minimal storage operations
 * 5. Safety: ReentrancyGuard on all state-changing functions
 */
contract BondVaultWETH is ReentrancyGuard {
    // ========================================================================
    // Errors
    // ========================================================================

    error NotAuthorized();
    error InsufficientFreeBond();
    error LockNotFound();
    error ZeroAmount();
    error InsufficientLockedBond();
    error TransferFailed();

    // ========================================================================
    // Events
    // ========================================================================

    event BondDeposited(address indexed user, uint256 amount);
    event BondWithdrawn(address indexed user, uint256 amount);
    event BondLocked(bytes32 indexed taskId, address indexed user, uint256 amount);
    event BondUnlocked(bytes32 indexed taskId, address indexed user, uint256 amount);
    event BondSlashed(bytes32 indexed refId, address indexed user, uint256 amount, address indexed to);
    event RewardPaid(bytes32 indexed refId, address indexed to, uint256 amount);

    // ========================================================================
    // Immutable State
    // ========================================================================

    /// @notice WETH token contract
    IWETH public immutable WETH;

    /// @notice VerifierMarketplace contract (authorized for lock/unlock/reward)
    address public immutable marketplace;

    /// @notice DisputeLadder contract (authorized for slash/reward)
    address public immutable disputeLadder;

    // ========================================================================
    // Mutable State
    // ========================================================================

    /// @notice Total bond deposited by user (free + locked)
    mapping(address => uint256) public totalBondOf;

    /// @notice Total locked bond for user across all tasks
    mapping(address => uint256) public totalLockedOf;

    /// @notice Locked bond for specific user+task
    /// @dev taskId => user => locked amount
    mapping(bytes32 => mapping(address => uint256)) public lockedBondOf;

    // ========================================================================
    // Constructor
    // ========================================================================

    /**
     * @notice Initialize BondVault with immutable contract references
     * @param _weth WETH token address
     * @param _marketplace VerifierMarketplace address
     * @param _disputeLadder DisputeLadder address
     */
    constructor(
        IWETH _weth,
        address _marketplace,
        address _disputeLadder
    ) {
        require(address(_weth) != address(0), "Invalid WETH");
        require(_marketplace != address(0), "Invalid marketplace");
        require(_disputeLadder != address(0), "Invalid disputeLadder");

        WETH = _weth;
        marketplace = _marketplace;
        disputeLadder = _disputeLadder;
    }

    // ========================================================================
    // View Functions
    // ========================================================================

    /**
     * @notice Get free (unlocked) bond balance for user
     * @param user Address to query
     * @return Free bond amount available for withdrawal or locking
     */
    function freeBondOf(address user) public view returns (uint256) {
        return totalBondOf[user] - totalLockedOf[user];
    }

    /**
     * @notice Get locked bond for specific task+user
     * @param taskId Task identifier
     * @param user User address
     * @return Locked bond amount
     */
    function getLockedBond(bytes32 taskId, address user) external view returns (uint256) {
        return lockedBondOf[taskId][user];
    }

    // ========================================================================
    // User Operations (Deposit/Withdraw)
    // ========================================================================

    /**
     * @notice Deposit WETH to bond vault
     * @dev User must approve this contract to spend WETH first
     * @param amount Amount of WETH to deposit
     */
    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();

        // Transfer WETH from user
        bool success = WETH.transferFrom(msg.sender, address(this), amount);
        if (!success) revert TransferFailed();

        // Update accounting
        totalBondOf[msg.sender] += amount;

        emit BondDeposited(msg.sender, amount);
    }

    /**
     * @notice Deposit ETH and wrap to WETH
     * @dev Convenience function for users who have ETH but not WETH
     */
    function depositETH() external payable nonReentrant {
        if (msg.value == 0) revert ZeroAmount();

        // Wrap ETH to WETH
        WETH.deposit{value: msg.value}();

        // Update accounting
        totalBondOf[msg.sender] += msg.value;

        emit BondDeposited(msg.sender, msg.value);
    }

    /**
     * @notice Withdraw free WETH from bond vault
     * @dev Can only withdraw unlocked bonds
     * @param amount Amount of WETH to withdraw
     */
    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (freeBondOf(msg.sender) < amount) revert InsufficientFreeBond();

        // Update accounting
        totalBondOf[msg.sender] -= amount;

        // Transfer WETH to user
        bool success = WETH.transfer(msg.sender, amount);
        if (!success) revert TransferFailed();

        emit BondWithdrawn(msg.sender, amount);
    }

    // ========================================================================
    // Marketplace Operations (Lock/Unlock)
    // ========================================================================

    /**
     * @notice Lock bond for task participation
     * @dev Only callable by Marketplace
     * @param taskId Task identifier
     * @param user User whose bond to lock
     * @param amount Amount to lock
     */
    function lockBond(
        bytes32 taskId,
        address user,
        uint256 amount
    ) external nonReentrant {
        if (msg.sender != marketplace) revert NotAuthorized();
        if (amount == 0) revert ZeroAmount();
        if (freeBondOf(user) < amount) revert InsufficientFreeBond();

        // Update accounting
        lockedBondOf[taskId][user] += amount;
        totalLockedOf[user] += amount;

        emit BondLocked(taskId, user, amount);
    }

    /**
     * @notice Unlock bond after task completion
     * @dev Only callable by Marketplace
     * @param taskId Task identifier
     * @param user User whose bond to unlock
     * @param amount Amount to unlock
     */
    function unlockBond(
        bytes32 taskId,
        address user,
        uint256 amount
    ) external nonReentrant {
        if (msg.sender != marketplace) revert NotAuthorized();
        if (amount == 0) revert ZeroAmount();
        if (lockedBondOf[taskId][user] < amount) revert InsufficientLockedBond();

        // Update accounting
        lockedBondOf[taskId][user] -= amount;
        totalLockedOf[user] -= amount;

        emit BondUnlocked(taskId, user, amount);
    }

    // ========================================================================
    // DisputeLadder Operations (Slash)
    // ========================================================================

    /**
     * @notice Slash bond as penalty for dispute resolution
     * @dev Only callable by DisputeLadder
     * @param refId Reference ID (disputeId or taskId)
     * @param user User to slash
     * @param amount Amount to slash
     * @param to Recipient of slashed funds
     */
    function slashBond(
        bytes32 refId,
        address user,
        uint256 amount,
        address to
    ) external nonReentrant {
        if (msg.sender != disputeLadder) revert NotAuthorized();
        if (amount == 0) revert ZeroAmount();
        if (to == address(0)) revert TransferFailed();

        // Get available bond (can slash from locked + free)
        uint256 available = totalBondOf[user];
        if (available == 0) revert InsufficientFreeBond();

        // Cap slash at available amount
        uint256 slashAmount = amount > available ? available : amount;

        // Update accounting
        totalBondOf[user] -= slashAmount;

        // If user has locked bonds, reduce those proportionally
        if (totalLockedOf[user] > 0) {
            uint256 lockedReduction = (totalLockedOf[user] * slashAmount) / (slashAmount + (available - slashAmount));
            if (lockedReduction > totalLockedOf[user]) lockedReduction = totalLockedOf[user];
            totalLockedOf[user] -= lockedReduction;
        }

        // Transfer slashed WETH to recipient
        bool success = WETH.transfer(to, slashAmount);
        if (!success) revert TransferFailed();

        emit BondSlashed(refId, user, slashAmount, to);
    }

    // ========================================================================
    // Reward Operations (Both Marketplace and DisputeLadder)
    // ========================================================================

    /**
     * @notice Pay reward to user
     * @dev Callable by both Marketplace and DisputeLadder
     * @param refId Reference ID (taskId or disputeId)
     * @param to Recipient address
     * @param amount Amount to pay
     */
    function payReward(
        bytes32 refId,
        address to,
        uint256 amount
    ) external nonReentrant {
        if (msg.sender != marketplace && msg.sender != disputeLadder) {
            revert NotAuthorized();
        }
        if (amount == 0) revert ZeroAmount();
        if (to == address(0)) revert TransferFailed();

        // Transfer WETH reward
        bool success = WETH.transfer(to, amount);
        if (!success) revert TransferFailed();

        emit RewardPaid(refId, to, amount);
    }

    /**
     * @notice Fund vault with WETH for rewards
     * @dev Marketplace/DisputeLadder must deposit WETH before paying rewards
     * @param amount Amount of WETH to fund
     */
    function fundVault(uint256 amount) external nonReentrant {
        if (msg.sender != marketplace && msg.sender != disputeLadder) {
            revert NotAuthorized();
        }
        if (amount == 0) revert ZeroAmount();

        // Transfer WETH from caller
        bool success = WETH.transferFrom(msg.sender, address(this), amount);
        if (!success) revert TransferFailed();

        // Note: Funded WETH is NOT added to any user's totalBondOf
        // It exists as vault reserves for reward payments
    }

    // ========================================================================
    // Emergency Functions
    // ========================================================================

    /**
     * @notice Get vault WETH balance
     * @return Total WETH held by vault
     */
    function vaultBalance() external view returns (uint256) {
        return WETH.balanceOf(address(this));
    }

    /**
     * @notice Receive ETH (for WETH unwrapping)
     */
    receive() external payable {
        // Only accept ETH from WETH contract
        require(msg.sender == address(WETH), "Only WETH");
    }
}
