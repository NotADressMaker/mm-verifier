// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IBondVaultWETH
 * @notice Interface for centralized WETH bond management
 * @dev Formal interface for bond vault operations across marketplace and disputes
 */
interface IBondVaultWETH {
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

    event BondDeposited(address indexed user, uint256 amount, uint256 timestamp);
    event BondWithdrawn(address indexed user, uint256 amount, uint256 timestamp);
    event BondLocked(bytes32 indexed taskId, address indexed user, uint256 amount, uint256 timestamp);
    event BondUnlocked(bytes32 indexed taskId, address indexed user, uint256 amount, uint256 timestamp);
    event BondSlashed(bytes32 indexed refId, address indexed user, uint256 amount, address indexed to, uint256 timestamp);
    event RewardPaid(bytes32 indexed refId, address indexed to, uint256 amount, uint256 timestamp);

    // ========================================================================
    // View Functions
    // ========================================================================

    /**
     * @notice Get WETH token address
     * @return WETH contract address
     */
    function WETH() external view returns (address);

    /**
     * @notice Get free (unlocked) bond balance for user
     * @param user Address to query
     * @return Free bond amount available for withdrawal or locking
     */
    function freeBondOf(address user) external view returns (uint256);

    /**
     * @notice Get locked bond for specific task+user
     * @param taskId Task identifier
     * @param user User address
     * @return Locked bond amount
     */
    function lockedBondOf(bytes32 taskId, address user) external view returns (uint256);

    /**
     * @notice Get total bond balance for user
     * @param user Address to query
     * @return Total bond (free + locked)
     */
    function totalBondOf(address user) external view returns (uint256);

    /**
     * @notice Get total locked bond for user across all tasks
     * @param user Address to query
     * @return Total locked amount
     */
    function totalLockedOf(address user) external view returns (uint256);

    /**
     * @notice Get vault WETH balance
     * @return Total WETH held by vault
     */
    function vaultBalance() external view returns (uint256);

    /**
     * @notice Get comprehensive bond summary for user (dashboard helper)
     * @param user Address to query
     * @return total Total bond (free + locked)
     * @return free Free bond available for withdrawal
     * @return locked Total locked bond across all tasks
     */
    function getUserBondSummary(address user) external view returns (
        uint256 total,
        uint256 free,
        uint256 locked
    );

    // ========================================================================
    // User Operations (Deposit/Withdraw)
    // ========================================================================

    /**
     * @notice Deposit WETH to bond vault
     * @dev User must approve this contract to spend WETH first
     * @param amount Amount of WETH to deposit
     */
    function deposit(uint256 amount) external;

    /**
     * @notice Deposit ETH and wrap to WETH
     * @dev Convenience function for users who have ETH but not WETH
     */
    function depositETH() external payable;

    /**
     * @notice Withdraw free WETH from bond vault
     * @dev Can only withdraw unlocked bonds
     * @param amount Amount of WETH to withdraw
     */
    function withdraw(uint256 amount) external;

    // ========================================================================
    // Authorized Operations
    // ========================================================================

    /**
     * @notice Lock bond for task participation
     * @dev Only callable by authorized contracts (Marketplace)
     * @param taskId Task identifier
     * @param user User whose bond to lock
     * @param amount Amount to lock
     */
    function lockBond(bytes32 taskId, address user, uint256 amount) external;

    /**
     * @notice Unlock bond after task completion
     * @dev Only callable by authorized contracts (Marketplace)
     * @param taskId Task identifier
     * @param user User whose bond to unlock
     * @param amount Amount to unlock
     */
    function unlockBond(bytes32 taskId, address user, uint256 amount) external;

    /**
     * @notice Slash bond as penalty
     * @dev Only callable by authorized contracts (DisputeLadder)
     * @param refId Reference ID (disputeId or taskId)
     * @param user User to slash
     * @param amount Amount to slash
     * @param to Recipient of slashed funds
     */
    function slashBond(bytes32 refId, address user, uint256 amount, address to) external;

    /**
     * @notice Pay reward to user
     * @dev Callable by authorized contracts (Marketplace, DisputeLadder)
     * @param refId Reference ID (taskId or disputeId)
     * @param to Recipient address
     * @param amount Amount to pay
     */
    function payReward(bytes32 refId, address to, uint256 amount) external;

    /**
     * @notice Fund vault with WETH for rewards
     * @dev Authorized contracts must deposit WETH before paying rewards
     * @param amount Amount of WETH to fund
     */
    function fundVault(uint256 amount) external;
}
