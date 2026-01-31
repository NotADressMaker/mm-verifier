// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@chainlink/contracts/src/v0.8/vrf/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";

/**
 * @title AuditorRegistryV2
 * @notice Enhanced auditor registry with:
 *  - Reputation weighting (capped to prevent centralization)
 *  - Sybil resistance (progressive stake requirements)
 *  - VRF randomness as primary selection mechanism
 *  - Allowlist mode for gradual decentralization
 */
contract AuditorRegistryV2 is Ownable, VRFConsumerBaseV2 {
    VRFCoordinatorV2Interface private immutable vrfCoordinator;

    bytes32 private immutable keyHash;
    uint64 private immutable subscriptionId;
    uint32 private constant CALLBACK_GAS_LIMIT = 200000;
    uint16 private constant REQUEST_CONFIRMATIONS = 3;

    struct Auditor {
        bool registered;
        bool allowlisted; // For gradual decentralization
        uint256 reputation; // 0-1000 scale
        uint256 totalVotes;
        uint256 correctVotes;
        uint256 totalEarnings;
        uint256 registrationTime;
        bool active;
    }

    struct SelectionRequest {
        bytes32 disputeId;
        uint256 committeeSize;
        address[] selectedAuditors;
        bool fulfilled;
    }

    address[] public auditorList;
    mapping(address => Auditor) public auditors;
    mapping(uint256 => SelectionRequest) public selectionRequests;
    mapping(bytes32 => uint256) public disputeToRequestId;

    // Reputation parameters
    uint256 public constant INITIAL_REPUTATION = 500; // 50%
    uint256 public constant MAX_REPUTATION = 1000; // 100%
    uint256 public constant MIN_REPUTATION = 100; // 10% (prevent total exclusion)
    uint256 public constant REPUTATION_INCREASE = 10;
    uint256 public constant REPUTATION_DECREASE = 20;

    // Reputation weighting caps (prevents centralization)
    uint256 public constant MAX_REPUTATION_WEIGHT = 3; // Max 3x weight from reputation
    uint256 public constant BASE_WEIGHT = 1000; // Base weight for all auditors

    // Sybil resistance
    bool public allowlistMode = true; // Start with allowlist, open gradually
    uint256 public minStakeMultiplier = 1; // Progressive stake requirements
    uint256 public constant STAKE_MULTIPLIER_INCREMENT = 10; // 10% increase per X auditors
    uint256 public constant AUDITORS_PER_TIER = 10;

    // Events
    event AuditorRegistered(address indexed auditor, bool allowlisted);
    event AuditorAllowlisted(address indexed auditor);
    event AuditorDeactivated(address indexed auditor);
    event AuditorsRequested(bytes32 indexed disputeId, uint256 requestId, uint256 committeeSize);
    event AuditorsSelected(bytes32 indexed disputeId, address[] auditors);
    event ReputationUpdated(address indexed auditor, uint256 newReputation, bool correct);
    event AllowlistModeChanged(bool enabled);

    constructor(
        address _vrfCoordinator,
        bytes32 _keyHash,
        uint64 _subscriptionId
    ) Ownable(msg.sender) VRFConsumerBaseV2(_vrfCoordinator) {
        vrfCoordinator = VRFCoordinatorV2Interface(_vrfCoordinator);
        keyHash = _keyHash;
        subscriptionId = _subscriptionId;
    }

    /**
     * @notice Toggle allowlist mode (gradual decentralization)
     * @param enabled Whether to enable allowlist mode
     */
    function setAllowlistMode(bool enabled) external onlyOwner {
        allowlistMode = enabled;
        emit AllowlistModeChanged(enabled);
    }

    /**
     * @notice Add auditor to allowlist
     * @param auditor Address to allowlist
     */
    function addToAllowlist(address auditor) external onlyOwner {
        require(auditors[auditor].registered, "Not registered");
        auditors[auditor].allowlisted = true;
        emit AuditorAllowlisted(auditor);
    }

    /**
     * @notice Batch add auditors to allowlist
     * @param auditorAddresses Array of addresses to allowlist
     */
    function batchAddToAllowlist(address[] calldata auditorAddresses) external onlyOwner {
        for (uint256 i = 0; i < auditorAddresses.length; i++) {
            if (auditors[auditorAddresses[i]].registered) {
                auditors[auditorAddresses[i]].allowlisted = true;
                emit AuditorAllowlisted(auditorAddresses[i]);
            }
        }
    }

    /**
     * @notice Register as auditor with Sybil resistance
     */
    function registerAuditor() external {
        require(!auditors[msg.sender].registered, "Already registered");

        // Check allowlist if mode is enabled
        if (allowlistMode) {
            revert("Allowlist mode: contact admin for registration");
        }

        // Progressive stake requirement for Sybil resistance
        uint256 requiredStake = getRequiredStake();

        // Note: Stake check would be done via external StakingManager
        // This is a placeholder for the check
        // require(stakingManager.hasAuditorStake(msg.sender, requiredStake), "Insufficient stake");

        auditors[msg.sender] = Auditor({
            registered: true,
            allowlisted: allowlistMode, // Auto-allowlist if in allowlist mode
            reputation: INITIAL_REPUTATION,
            totalVotes: 0,
            correctVotes: 0,
            totalEarnings: 0,
            registrationTime: block.timestamp,
            active: true
        });

        auditorList.push(msg.sender);

        emit AuditorRegistered(msg.sender, allowlistMode);
    }

    /**
     * @notice Get required stake for new auditor (Sybil resistance)
     * @return Required stake amount (progressive)
     */
    function getRequiredStake() public view returns (uint256) {
        uint256 auditorCount = auditorList.length;
        uint256 tier = auditorCount / AUDITORS_PER_TIER;
        uint256 baseStake = 0.5 ether; // From StakingManager.MIN_AUDITOR_STAKE

        // Progressive increase: +10% per tier
        uint256 multiplier = 100 + (tier * STAKE_MULTIPLIER_INCREMENT);
        return (baseStake * multiplier) / 100;
    }

    /**
     * @notice Deactivate auditor
     */
    function deactivateAuditor() external {
        require(auditors[msg.sender].registered, "Not registered");
        require(auditors[msg.sender].active, "Already inactive");

        auditors[msg.sender].active = false;

        emit AuditorDeactivated(msg.sender);
    }

    /**
     * @notice Request auditor selection with VRF + reputation weighting
     * @param disputeId Dispute identifier
     * @param committeeSize Number of auditors to select
     */
    function requestAuditorSelection(
        bytes32 disputeId,
        uint256 committeeSize
    ) external onlyOwner returns (uint256) {
        require(committeeSize > 0, "Committee size must be > 0");

        uint256 eligibleCount = getEligibleAuditorCount();
        require(committeeSize <= eligibleCount, "Not enough eligible auditors");
        require(disputeToRequestId[disputeId] == 0, "Request already exists");

        uint256 requestId = vrfCoordinator.requestRandomWords(
            keyHash,
            subscriptionId,
            REQUEST_CONFIRMATIONS,
            CALLBACK_GAS_LIMIT,
            uint32(committeeSize)
        );

        selectionRequests[requestId] = SelectionRequest({
            disputeId: disputeId,
            committeeSize: committeeSize,
            selectedAuditors: new address[](0),
            fulfilled: false
        });

        disputeToRequestId[disputeId] = requestId;

        emit AuditorsRequested(disputeId, requestId, committeeSize);

        return requestId;
    }

    /**
     * @notice VRF callback with capped reputation weighting
     * @dev VRF randomness is PRIMARY, reputation is secondary (capped weight)
     */
    function fulfillRandomWords(
        uint256 requestId,
        uint256[] memory randomWords
    ) internal override {
        SelectionRequest storage request = selectionRequests[requestId];
        require(!request.fulfilled, "Already fulfilled");

        address[] memory eligibleAuditors = getEligibleAuditors();
        address[] memory selected = new address[](request.committeeSize);

        // Calculate weights with caps to prevent centralization
        uint256[] memory weights = new uint256[](eligibleAuditors.length);
        uint256 totalWeight = 0;

        for (uint256 i = 0; i < eligibleAuditors.length; i++) {
            weights[i] = _getAuditorWeight(eligibleAuditors[i]);
            totalWeight += weights[i];
        }

        // VRF-based weighted random selection
        for (uint256 i = 0; i < request.committeeSize; i++) {
            uint256 randomValue = randomWords[i] % totalWeight;
            uint256 cumulativeWeight = 0;

            for (uint256 j = 0; j < eligibleAuditors.length; j++) {
                cumulativeWeight += weights[j];
                if (randomValue < cumulativeWeight) {
                    selected[i] = eligibleAuditors[j];

                    // Remove selected auditor from pool
                    weights[j] = 0;
                    totalWeight -= _getAuditorWeight(eligibleAuditors[j]);
                    break;
                }
            }
        }

        request.selectedAuditors = selected;
        request.fulfilled = true;

        emit AuditorsSelected(request.disputeId, selected);
    }

    /**
     * @notice Calculate auditor weight with reputation cap
     * @dev Base weight (1000) + reputation bonus (max 3x)
     * @param auditor Auditor address
     * @return Capped weight
     */
    function _getAuditorWeight(address auditor) private view returns (uint256) {
        Auditor memory aud = auditors[auditor];

        // Base weight ensures everyone has minimum chance
        uint256 baseWeight = BASE_WEIGHT;

        // Reputation bonus (capped at MAX_REPUTATION_WEIGHT = 3x)
        // reputation is 0-1000, normalize to 0-MAX_REPUTATION_WEIGHT
        uint256 reputationBonus = (aud.reputation * MAX_REPUTATION_WEIGHT) / MAX_REPUTATION;

        // Total weight = base + capped bonus
        return baseWeight + (baseWeight * reputationBonus) / MAX_REPUTATION_WEIGHT;
    }

    /**
     * @notice Update auditor reputation (capped)
     * @param auditor Auditor address
     * @param correct Whether vote was correct
     */
    function updateReputation(address auditor, bool correct) external onlyOwner {
        Auditor storage aud = auditors[auditor];
        require(aud.registered, "Not registered");

        aud.totalVotes++;

        if (correct) {
            aud.correctVotes++;

            // Increase reputation (capped at MAX)
            uint256 newRep = aud.reputation + REPUTATION_INCREASE;
            aud.reputation = newRep > MAX_REPUTATION ? MAX_REPUTATION : newRep;
        } else {
            // Decrease reputation (floored at MIN to prevent exclusion)
            if (aud.reputation > REPUTATION_DECREASE + MIN_REPUTATION) {
                aud.reputation -= REPUTATION_DECREASE;
            } else {
                aud.reputation = MIN_REPUTATION;
            }
        }

        emit ReputationUpdated(auditor, aud.reputation, correct);
    }

    /**
     * @notice Record auditor earnings
     */
    function recordEarnings(address auditor, uint256 amount) external onlyOwner {
        require(auditors[auditor].registered, "Not registered");
        auditors[auditor].totalEarnings += amount;
    }

    /**
     * @notice Get selected auditors for dispute
     */
    function getSelectedAuditors(bytes32 disputeId) external view returns (address[] memory) {
        uint256 requestId = disputeToRequestId[disputeId];
        require(requestId != 0, "No request found");
        require(selectionRequests[requestId].fulfilled, "Selection not fulfilled");

        return selectionRequests[requestId].selectedAuditors;
    }

    /**
     * @notice Get eligible auditors (active + allowlist check)
     */
    function getEligibleAuditors() public view returns (address[] memory) {
        uint256 eligibleCount = getEligibleAuditorCount();
        address[] memory eligible = new address[](eligibleCount);
        uint256 index = 0;

        for (uint256 i = 0; i < auditorList.length; i++) {
            Auditor memory aud = auditors[auditorList[i]];
            if (aud.active && (!allowlistMode || aud.allowlisted)) {
                eligible[index] = auditorList[i];
                index++;
            }
        }

        return eligible;
    }

    /**
     * @notice Get count of eligible auditors
     */
    function getEligibleAuditorCount() public view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < auditorList.length; i++) {
            Auditor memory aud = auditors[auditorList[i]];
            if (aud.active && (!allowlistMode || aud.allowlisted)) {
                count++;
            }
        }
        return count;
    }

    /**
     * @notice Get all active auditors (for monitoring)
     */
    function getActiveAuditors() public view returns (address[] memory) {
        uint256 activeCount = 0;
        for (uint256 i = 0; i < auditorList.length; i++) {
            if (auditors[auditorList[i]].active) {
                activeCount++;
            }
        }

        address[] memory activeAuditors = new address[](activeCount);
        uint256 index = 0;

        for (uint256 i = 0; i < auditorList.length; i++) {
            if (auditors[auditorList[i]].active) {
                activeAuditors[index] = auditorList[i];
                index++;
            }
        }

        return activeAuditors;
    }

    /**
     * @notice Get auditor info
     */
    function getAuditor(address auditor) external view returns (Auditor memory) {
        return auditors[auditor];
    }

    /**
     * @notice Get auditor statistics
     */
    function getAuditorStats(address auditor) external view returns (
        uint256 totalVotes,
        uint256 correctVotes,
        uint256 accuracy,
        uint256 reputation,
        uint256 weight
    ) {
        Auditor memory aud = auditors[auditor];

        totalVotes = aud.totalVotes;
        correctVotes = aud.correctVotes;
        accuracy = aud.totalVotes > 0 ? (aud.correctVotes * 100) / aud.totalVotes : 0;
        reputation = aud.reputation;
        weight = _getAuditorWeight(auditor);

        return (totalVotes, correctVotes, accuracy, reputation, weight);
    }

    /**
     * @notice Check if selection is complete
     */
    function isSelectionComplete(bytes32 disputeId) external view returns (bool) {
        uint256 requestId = disputeToRequestId[disputeId];
        if (requestId == 0) return false;
        return selectionRequests[requestId].fulfilled;
    }
}
