// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IWETH
 * @notice Interface for Wrapped ETH (WETH) token
 * @dev Standard WETH9 interface for deposits, withdrawals, and ERC20 functions
 */
interface IWETH {
    /// @notice Deposit ETH and receive WETH
    function deposit() external payable;

    /// @notice Withdraw WETH and receive ETH
    /// @param amount Amount to withdraw
    function withdraw(uint256 amount) external;

    /// @notice Get WETH balance
    /// @param account Address to query
    /// @return Balance of WETH
    function balanceOf(address account) external view returns (uint256);

    /// @notice Transfer WETH
    /// @param to Recipient address
    /// @param amount Amount to transfer
    /// @return Success boolean
    function transfer(address to, uint256 amount) external returns (bool);

    /// @notice Transfer WETH from another address
    /// @param from Sender address
    /// @param to Recipient address
    /// @param amount Amount to transfer
    /// @return Success boolean
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool);

    /// @notice Approve WETH spending
    /// @param spender Spender address
    /// @param amount Amount to approve
    /// @return Success boolean
    function approve(address spender, uint256 amount) external returns (bool);

    /// @notice Get allowance
    /// @param owner Token owner
    /// @param spender Spender address
    /// @return Allowance amount
    function allowance(address owner, address spender) external view returns (uint256);

    /// @notice WETH-specific events
    event Deposit(address indexed dst, uint256 wad);
    event Withdrawal(address indexed src, uint256 wad);
}
