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
    uint256 public minHumanExpertStake; // Higher stake requirement for human experts
    uint256 public slashBps = 2_000; // 20% default max slash (governable)

    mapping(address => uint256) public stakeOf;
    mapping(address => uint256) public lockedStake;
    mapping(address => bool) public active;
    mapping(address => uint16) public reputationBps; // 0-10000 (0-100%)

    // Human expert system
    mapping(address => bool) public isHumanExpert;
    mapping(address => string) public expertCredentials; // IPFS hash of credentials/bio
    uint256 public humanExpertCount;

    address[] public auditorList;
    mapping(address => uint256) private indexOf; // 1-based index

    event Staked(address indexed auditor, uint256 amount, uint256 total);
    event Unstaked(address indexed auditor, uint256 amount, uint256 total);
    event Slashed(address indexed auditor, uint256 amount);
    event Activated(address indexed auditor, bool activeStatus);
    event Rewarded(address indexed auditor, uint256 amount);
    event StakeLocked(address indexed auditor, uint256 amount, uint64 until);
    event HumanExpertRegistered(address indexed expert, string credentials, uint256 timestamp);
    event HumanExpertRemoved(address indexed expert, uint256 timestamp);

    constructor(IWETH _weth, uint256 _minStake) Ownable(msg.sender) {
        WETH = _weth;
        minStake = _minStake;
        minHumanExpertStake = _minStake * 5; // 5x minimum stake for human experts
    }

    function auditorsCount() external view returns (uint256) {
        return auditorList.length;
    }

    function getAuditor(uint256 i) external view returns (address) {
        return auditorList[i];
    }

    function setMinStake(uint256 v) external onlyOwner { minStake = v; }
    function setMinHumanExpertStake(uint256 v) external onlyOwner { minHumanExpertStake = v; }
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
    // Human Expert Management
    // ========================================================================

    /**
     * @notice Register as a human expert (requires higher stake)
     * @param credentialsHash IPFS hash of credentials/bio/certifications
     */
    function registerAsHumanExpert(string calldata credentialsHash) external nonReentrant {
        require(stakeOf[msg.sender] >= minHumanExpertStake, "Insufficient stake for human expert");
        require(!isHumanExpert[msg.sender], "Already registered as expert");
        require(active[msg.sender], "Must be active auditor");
        require(bytes(credentialsHash).length > 0, "Credentials required");

        isHumanExpert[msg.sender] = true;
        expertCredentials[msg.sender] = credentialsHash;
        humanExpertCount++;

        emit HumanExpertRegistered(msg.sender, credentialsHash, block.timestamp);
    }

    /**
     * @notice Owner can designate verified human experts (governance/multisig)
     * @param expert Address to designate as human expert
     * @param credentialsHash IPFS hash of credentials
     */
    function designateHumanExpert(address expert, string calldata credentialsHash) external onlyOwner {
        require(stakeOf[expert] >= minHumanExpertStake, "Expert must meet stake requirement");
        require(!isHumanExpert[expert], "Already a human expert");
        require(active[expert], "Expert must be active");

        isHumanExpert[expert] = true;
        expertCredentials[expert] = credentialsHash;
        humanExpertCount++;

        emit HumanExpertRegistered(expert, credentialsHash, block.timestamp);
    }

    /**
     * @notice Remove human expert status (self or owner)
     * @param expert Address to remove expert status from
     */
    function removeHumanExpert(address expert) external {
        require(msg.sender == expert || msg.sender == owner(), "Only expert or owner");
        require(isHumanExpert[expert], "Not a human expert");

        isHumanExpert[expert] = false;
        delete expertCredentials[expert];
        humanExpertCount--;

        emit HumanExpertRemoved(expert, block.timestamp);
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
    // Human Expert View Functions
    // ========================================================================

    /**
     * @notice Get list of all human experts
     * @return experts Array of human expert addresses
     */
    function getHumanExperts() external view returns (address[] memory experts) {
        // Count human experts
        uint256 count = 0;
        for (uint256 i = 0; i < auditorList.length; i++) {
            if (isHumanExpert[auditorList[i]]) {
                count++;
            }
        }

        // Build array
        experts = new address[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < auditorList.length; i++) {
            if (isHumanExpert[auditorList[i]]) {
                experts[idx] = auditorList[i];
                idx++;
            }
        }
    }

    /**
     * @notice Get active human experts (for jury selection)
     * @return experts Array of active human expert addresses
     */
    function getActiveHumanExperts() external view returns (address[] memory experts) {
        // Count active human experts
        uint256 count = 0;
        for (uint256 i = 0; i < auditorList.length; i++) {
            address auditor = auditorList[i];
            if (isHumanExpert[auditor] && active[auditor]) {
                count++;
            }
        }

        // Build array
        experts = new address[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < auditorList.length; i++) {
            address auditor = auditorList[i];
            if (isHumanExpert[auditor] && active[auditor]) {
                experts[idx] = auditor;
                idx++;
            }
        }
    }

    /**
     * @notice Check if auditor qualifies as human expert (stake + flag)
     * @param auditor Address to check
     * @return qualified True if meets stake requirement and has expert flag
     */
    function isQualifiedHumanExpert(address auditor) external view returns (bool qualified) {
        return isHumanExpert[auditor]
            && active[auditor]
            && stakeOf[auditor] >= minHumanExpertStake;
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

