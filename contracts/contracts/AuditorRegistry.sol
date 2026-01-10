// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@chainlink/contracts/src/v0.8/vrf/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/vrf/interfaces/VRFCoordinatorV2Interface.sol";

/**
 * @title AuditorRegistry
 * @notice Manages auditor pool and VRF-based random selection
 * @dev Uses Chainlink VRF for verifiable random auditor selection
 */
contract AuditorRegistry is Ownable, VRFConsumerBaseV2 {
    VRFCoordinatorV2Interface private immutable vrfCoordinator;

    // Chainlink VRF configuration
    bytes32 private immutable keyHash;
    uint64 private immutable subscriptionId;
    uint32 private constant CALLBACK_GAS_LIMIT = 200000;
    uint16 private constant REQUEST_CONFIRMATIONS = 3;

    // Auditor reputation tracking
    struct Auditor {
        bool registered;
        uint256 reputation; // 0-1000 scale
        uint256 totalVotes;
        uint256 correctVotes;
        uint256 totalEarnings;
        bool active;
    }

    // Auditor selection request
    struct SelectionRequest {
        bytes32 disputeId;
        uint256 committeeSize;
        address[] selectedAuditors;
        bool fulfilled;
    }

    // Registered auditors
    address[] public auditorList;
    mapping(address => Auditor) public auditors;

    // VRF request tracking
    mapping(uint256 => SelectionRequest) public selectionRequests;
    mapping(bytes32 => uint256) public disputeToRequestId;

    // Reputation parameters
    uint256 public constant INITIAL_REPUTATION = 500; // 50%
    uint256 public constant MAX_REPUTATION = 1000; // 100%
    uint256 public constant REPUTATION_INCREASE = 10;
    uint256 public constant REPUTATION_DECREASE = 20;

    // Events
    event AuditorRegistered(address indexed auditor);
    event AuditorDeactivated(address indexed auditor);
    event AuditorsRequested(bytes32 indexed disputeId, uint256 requestId, uint256 committeeSize);
    event AuditorsSelected(bytes32 indexed disputeId, address[] auditors);
    event ReputationUpdated(address indexed auditor, uint256 newReputation, bool correct);

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
     * @notice Register as an auditor
     * @dev Requires stake in StakingManager (checked externally)
     */
    function registerAuditor() external {
        require(!auditors[msg.sender].registered, "Already registered");

        auditors[msg.sender] = Auditor({
            registered: true,
            reputation: INITIAL_REPUTATION,
            totalVotes: 0,
            correctVotes: 0,
            totalEarnings: 0,
            active: true
        });

        auditorList.push(msg.sender);

        emit AuditorRegistered(msg.sender);
    }

    /**
     * @notice Deactivate auditor status
     */
    function deactivateAuditor() external {
        require(auditors[msg.sender].registered, "Not registered");
        require(auditors[msg.sender].active, "Already inactive");

        auditors[msg.sender].active = false;

        emit AuditorDeactivated(msg.sender);
    }

    /**
     * @notice Request random auditor selection using VRF
     * @param disputeId Dispute identifier
     * @param committeeSize Number of auditors to select
     * @return requestId VRF request ID
     */
    function requestAuditorSelection(
        bytes32 disputeId,
        uint256 committeeSize
    ) external onlyOwner returns (uint256) {
        require(committeeSize > 0, "Committee size must be > 0");
        require(committeeSize <= getActiveAuditorCount(), "Not enough active auditors");
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
     * @notice Chainlink VRF callback
     * @param requestId VRF request ID
     * @param randomWords Random values from VRF
     */
    function fulfillRandomWords(
        uint256 requestId,
        uint256[] memory randomWords
    ) internal override {
        SelectionRequest storage request = selectionRequests[requestId];
        require(!request.fulfilled, "Already fulfilled");

        address[] memory activeAuditors = getActiveAuditors();
        address[] memory selected = new address[](request.committeeSize);

        // Weighted random selection based on reputation
        uint256[] memory weights = new uint256[](activeAuditors.length);
        uint256 totalWeight = 0;

        for (uint256 i = 0; i < activeAuditors.length; i++) {
            weights[i] = auditors[activeAuditors[i]].reputation;
            totalWeight += weights[i];
        }

        // Select auditors
        for (uint256 i = 0; i < request.committeeSize; i++) {
            uint256 randomValue = randomWords[i] % totalWeight;
            uint256 cumulativeWeight = 0;

            for (uint256 j = 0; j < activeAuditors.length; j++) {
                cumulativeWeight += weights[j];
                if (randomValue < cumulativeWeight) {
                    selected[i] = activeAuditors[j];
                    // Remove selected auditor from pool
                    weights[j] = 0;
                    totalWeight -= auditors[activeAuditors[j]].reputation;
                    break;
                }
            }
        }

        request.selectedAuditors = selected;
        request.fulfilled = true;

        emit AuditorsSelected(request.disputeId, selected);
    }

    /**
     * @notice Update auditor reputation after vote
     * @param auditor Auditor address
     * @param correct Whether vote was correct
     */
    function updateReputation(address auditor, bool correct) external onlyOwner {
        Auditor storage aud = auditors[auditor];
        require(aud.registered, "Not registered");

        aud.totalVotes++;

        if (correct) {
            aud.correctVotes++;
            aud.reputation = aud.reputation + REPUTATION_INCREASE > MAX_REPUTATION
                ? MAX_REPUTATION
                : aud.reputation + REPUTATION_INCREASE;
        } else {
            aud.reputation = aud.reputation > REPUTATION_DECREASE
                ? aud.reputation - REPUTATION_DECREASE
                : 0;
        }

        emit ReputationUpdated(auditor, aud.reputation, correct);
    }

    /**
     * @notice Record auditor earnings
     * @param auditor Auditor address
     * @param amount Earnings amount
     */
    function recordEarnings(address auditor, uint256 amount) external onlyOwner {
        require(auditors[auditor].registered, "Not registered");
        auditors[auditor].totalEarnings += amount;
    }

    /**
     * @notice Get selected auditors for a dispute
     * @param disputeId Dispute identifier
     * @return Selected auditor addresses
     */
    function getSelectedAuditors(bytes32 disputeId) external view returns (address[] memory) {
        uint256 requestId = disputeToRequestId[disputeId];
        require(requestId != 0, "No request found");
        require(selectionRequests[requestId].fulfilled, "Selection not fulfilled");

        return selectionRequests[requestId].selectedAuditors;
    }

    /**
     * @notice Get all active auditors
     * @return Array of active auditor addresses
     */
    function getActiveAuditors() public view returns (address[] memory) {
        uint256 activeCount = getActiveAuditorCount();
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
     * @notice Get count of active auditors
     * @return Count of active auditors
     */
    function getActiveAuditorCount() public view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < auditorList.length; i++) {
            if (auditors[auditorList[i]].active) {
                count++;
            }
        }
        return count;
    }

    /**
     * @notice Get auditor info
     * @param auditor Auditor address
     * @return Auditor struct
     */
    function getAuditor(address auditor) external view returns (Auditor memory) {
        return auditors[auditor];
    }

    /**
     * @notice Check if selection is complete
     * @param disputeId Dispute identifier
     */
    function isSelectionComplete(bytes32 disputeId) external view returns (bool) {
        uint256 requestId = disputeToRequestId[disputeId];
        if (requestId == 0) return false;
        return selectionRequests[requestId].fulfilled;
    }
}
