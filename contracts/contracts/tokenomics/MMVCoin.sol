// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MMVCoin
 * @notice ERC20 reward token for verifier accuracy
 */
contract MMVCoin is ERC20, Ownable {
    address public minter;

    event MinterSet(address indexed minter);

    constructor() ERC20("MMV Coin", "MMVC") Ownable(msg.sender) {}

    function setMinter(address _minter) external onlyOwner {
        require(_minter != address(0), "minter=0");
        require(_minter.code.length > 0, "minter not contract");
        minter = _minter;
        emit MinterSet(_minter);
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == minter, "only minter");
        _mint(to, amount);
    }
}
