// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IWETH.sol";
import "./interfaces/IDisputeInterfaces.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title AuditorRegistry
 * @notice WETH-based auditor staking registry for dispute resolution
 * @dev Auditors stake WETH to become eligible for dispute panel selection
 *      Implements IStakeManager for DisputeLadder integration
 */
contract AuditorRegistry is IStakeManager, Ownable, ReentrancyGuard {
    IWETH public immutable WETH;

    uint256 public minStake;
    uint256 public slashBps = 2_000; // 20% default max slash (governable)

    mapping(address => uint256) public stakeOf;
    mapping(address => uint256) public lockedStake;
    mapping(address => bool) public active;
    mapping(address => uint16) public reputationBps; // 0-10000 (0-100%)

    address[] public auditorList;
    mapping(address => uint256) private indexOf; // 1-based index

    event Staked(address indexed auditor, uint256 amount, uint256 total);
    event Unstaked(address indexed auditor, uint256 amount, uint256 total);
    event Slashed(address indexed auditor, uint256 amount);
    event Activated(address indexed auditor, bool activeStatus);
    event Rewarded(address indexed auditor, uint256 amount);
    event StakeLocked(address indexed auditor, uint256 amount, uint64 until);

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
            reputationBps[msg.sender] = 5000; // Start at 50% reputation
        }

        emit Staked(msg.sender, amount, stakeOf[msg.sender]);
    }

    function unstake(uint256 amount) external nonReentrant {
        require(amount > 0, "amount=0");
        require(stakeOf[msg.sender] >= amount + lockedStake[msg.sender], "insufficient unlocked");
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

    // ========================================================================
    // IStakeManager Implementation
    // ========================================================================

    function isActiveAuditor(address who) external view override returns (bool) {
        return active[who];
    }

    function activeAuditorCount() external view override returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < auditorList.length; i++) {
            if (active[auditorList[i]]) {
                count++;
            }
        }
        return count;
    }

    function activeAuditorAt(uint256 idx) external view override returns (address) {
        uint256 activeIdx = 0;
        for (uint256 i = 0; i < auditorList.length; i++) {
            if (active[auditorList[i]]) {
                if (activeIdx == idx) {
                    return auditorList[i];
                }
                activeIdx++;
            }
        }
        revert("Index out of bounds");
    }

    function lockStake(address who, uint256 amount, uint64 until) external override onlyOwner {
        require(stakeOf[who] >= lockedStake[who] + amount, "Insufficient unlocked stake");
        lockedStake[who] += amount;
        emit StakeLocked(who, amount, until);
        // Note: unlock mechanism would need a time-lock system (not implemented here for simplicity)
    }

    function slash(address auditor, uint256 amount) external override onlyOwner {
        uint256 s = stakeOf[auditor];
        if (amount > s) amount = s;
        stakeOf[auditor] = s - amount;

        // Slash also reduces locked stake proportionally
        if (lockedStake[auditor] > 0) {
            uint256 lockedReduction = (lockedStake[auditor] * amount) / s;
            lockedStake[auditor] -= lockedReduction;
        }

        // Transfer slashed amount to owner (can be distributed by dispute system)
        WETH.transfer(msg.sender, amount);

        if (stakeOf[auditor] < minStake && active[auditor]) {
            _activate(auditor, false);
        }

        // Reduce reputation on slash
        if (reputationBps[auditor] > 500) {
            reputationBps[auditor] -= 500; // -5% reputation
        } else {
            reputationBps[auditor] = 0;
        }

        emit Slashed(auditor, amount);
    }

    function reward(address who, uint256 amount) external payable override onlyOwner {
        require(msg.value >= amount, "Insufficient ETH sent");

        // Convert ETH to WETH
        WETH.deposit{value: amount}();

        // Add to auditor stake
        stakeOf[who] += amount;

        // Increase reputation on reward (capped at 100%)
        if (reputationBps[who] < 9500) {
            reputationBps[who] += 100; // +1% reputation
        } else {
            reputationBps[who] = 10000; // Cap at 100%
        }

        if (stakeOf[who] >= minStake && !active[who]) {
            _activate(who, true);
        }

        emit Rewarded(who, amount);
    }

    function auditorReputationBps(address who) external view override returns (uint16) {
        return reputationBps[who];
    }

    // ========================================================================
    // Legacy slash function for BLSSlashingManager
    // ========================================================================

    /// @dev Called by BLSSlashingManager to slash (3-param version)
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

    receive() external payable {}
}

