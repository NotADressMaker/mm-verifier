// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IWETH.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title AuditorRegistry
 * @notice WETH-based auditor staking registry for dispute resolution
 * @dev Auditors stake WETH to become eligible for dispute panel selection
 */
contract AuditorRegistry is Ownable, ReentrancyGuard {
    IWETH public immutable WETH;

    uint256 public minStake;
    uint256 public slashBps = 2_000; // 20% default max slash (governable)

    mapping(address => uint256) public stakeOf;
    mapping(address => bool) public active;

    address[] public auditorList;
    mapping(address => uint256) private indexOf; // 1-based index

    event Staked(address indexed auditor, uint256 amount, uint256 total);
    event Unstaked(address indexed auditor, uint256 amount, uint256 total);
    event Slashed(address indexed auditor, uint256 amount);
    event Activated(address indexed auditor, bool activeStatus);

    constructor(IWETH _weth, uint256 _minStake) Ownable(msg.sender) {
        WETH = _weth;
        minStake = _minStake;
    }

    function auditorsCount() external view returns (uint256) {
        return auditorList.length;
    }

    function getAuditor(uint256 i) external view returns (address) {
        return auditorList[i];
    }

    function setMinStake(uint256 v) external onlyOwner { minStake = v; }
    function setSlashBps(uint256 v) external onlyOwner { require(v <= 10_000); slashBps = v; }

    function stake(uint256 amount) external nonReentrant {
        require(amount > 0, "amount=0");
        WETH.transferFrom(msg.sender, address(this), amount);
        stakeOf[msg.sender] += amount;

        if (stakeOf[msg.sender] >= minStake && !active[msg.sender]) {
            _activate(msg.sender, true);
        }
        if (indexOf[msg.sender] == 0) {
            auditorList.push(msg.sender);
            indexOf[msg.sender] = auditorList.length; // 1-based
        }

        emit Staked(msg.sender, amount, stakeOf[msg.sender]);
    }

    function unstake(uint256 amount) external nonReentrant {
        require(amount > 0, "amount=0");
        require(stakeOf[msg.sender] >= amount, "insufficient");
        stakeOf[msg.sender] -= amount;
        WETH.transfer(msg.sender, amount);

        if (stakeOf[msg.sender] < minStake && active[msg.sender]) {
            _activate(msg.sender, false);
        }
        emit Unstaked(msg.sender, amount, stakeOf[msg.sender]);
    }

    function _activate(address a, bool v) internal {
        active[a] = v;
        emit Activated(a, v);
    }

    /// @dev Called by DisputeManager to slash.
    function slash(address auditor, uint256 amount, address to) external nonReentrant onlyOwner {
        uint256 s = stakeOf[auditor];
        if (amount > s) amount = s;
        stakeOf[auditor] = s - amount;
        WETH.transfer(to, amount);

        if (stakeOf[auditor] < minStake && active[auditor]) {
            _activate(auditor, false);
        }
        emit Slashed(auditor, amount);
    }
}
