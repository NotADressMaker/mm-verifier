// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../interfaces/IWETH.sol";

/**
 * @title MockWETH
 * @notice Mock WETH contract for testing
 * @dev Implements IWETH interface for test compatibility
 */
contract MockWETH is ERC20, IWETH {
    constructor() ERC20("Wrapped Ether", "WETH") {}

    /**
     * @notice Deposit ETH and receive WETH
     */
    function deposit() public payable override {
        _mint(msg.sender, msg.value);
        emit Deposit(msg.sender, msg.value);
    }

    /**
     * @notice Withdraw ETH by burning WETH
     * @param amount Amount of WETH to burn
     */
    function withdraw(uint256 amount) public override {
        require(balanceOf(msg.sender) >= amount, "Insufficient balance");
        _burn(msg.sender, amount);
        payable(msg.sender).transfer(amount);
        emit Withdrawal(msg.sender, amount);
    }

    /**
     * @notice Allow contract to receive ETH
     */
    receive() external payable {
        deposit();
    }

    // Override functions that exist in both ERC20 and IWETH
    function balanceOf(address account) public view override(ERC20, IWETH) returns (uint256) {
        return super.balanceOf(account);
    }

    function transfer(address to, uint256 amount) public override(ERC20, IWETH) returns (bool) {
        return super.transfer(to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) public override(ERC20, IWETH) returns (bool) {
        return super.transferFrom(from, to, amount);
    }

    function approve(address spender, uint256 amount) public override(ERC20, IWETH) returns (bool) {
        return super.approve(spender, amount);
    }

    function allowance(address owner, address spender) public view override(ERC20, IWETH) returns (uint256) {
        return super.allowance(owner, spender);
    }
}
