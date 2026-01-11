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
}
