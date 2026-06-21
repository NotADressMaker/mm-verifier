// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MAMVToken
 * @notice Governance token for MAMV protocol
 * @dev ERC20Votes enables on-chain governance with delegation
 *
 * Features:
 * - Total supply: 1,000,000 MAMV
 * - Burnable: Holders can burn tokens
 * - Votable: Supports delegation for governance
 * - Permit: Gasless approvals via EIP-2612
 *
 * Distribution:
 * - 40% Treasury (controlled by governance)
 * - 30% Team/Contributors (vested)
 * - 20% Liquidity mining rewards
 * - 10% Initial airdrop to early verifiers
 */
contract MAMVToken is ERC20, ERC20Burnable, ERC20Votes, ERC20Permit, Ownable {
    uint256 public constant TOTAL_SUPPLY = 1_000_000 * 10**18; // 1M tokens

    // Distribution addresses
    address public immutable treasury;
    address public immutable teamVesting;
    address public immutable miningRewards;
    address public immutable airdrop;

    constructor(
        address _treasury,
        address _teamVesting,
        address _miningRewards,
        address _airdrop
    )
        ERC20("MM Verify", "MAMV")
        ERC20Permit("MM Verify")
        Ownable(msg.sender)
    {
        require(_treasury != address(0), "Invalid treasury");
        require(_teamVesting != address(0), "Invalid team vesting");
        require(_miningRewards != address(0), "Invalid mining rewards");
        require(_airdrop != address(0), "Invalid airdrop");

        treasury = _treasury;
        teamVesting = _teamVesting;
        miningRewards = _miningRewards;
        airdrop = _airdrop;

        // Mint total supply
        _mint(_treasury, TOTAL_SUPPLY * 40 / 100);      // 400K to treasury
        _mint(_teamVesting, TOTAL_SUPPLY * 30 / 100);   // 300K to team (vested)
        _mint(_miningRewards, TOTAL_SUPPLY * 20 / 100); // 200K for mining
        _mint(_airdrop, TOTAL_SUPPLY * 10 / 100);       // 100K for airdrop
    }

    // The following functions are overrides required by Solidity

    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Votes)
    {
        super._update(from, to, value);
    }

    function nonces(address owner)
        public
        view
        override(ERC20Permit, Nonces)
        returns (uint256)
    {
        return super.nonces(owner);
    }
}
