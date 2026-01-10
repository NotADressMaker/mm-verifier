// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IDisputeInterfaces.sol";
import "@chainlink/contracts/src/v0.8/vrf/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/vrf/interfaces/VRFCoordinatorV2Interface.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title DisputeLadder
 * @notice Multi-tier dispute resolution with VRF jury selection
 * @dev Implements L0 (auto-check) → L1 (small jury) → L2 (medium jury) → L3 (large jury) → Final
 *
 * State Machine:
 * NONE → OPEN (L0 auto-check) → ROUND_ACTIVE → ROUND_RESOLVED → FINALIZED
 *                                      ↓ appeal ↑
 *                                   (escalate to next level)
 *
 * Each round: SELECTING_JURY → EVIDENCE → VOTING → TALLY_READY → RESOLVED → appealable or finalize
 */
contract DisputeLadder is Ownable, ReentrancyGuard, VRFConsumerBaseV2 {
    // ========================================================================
    // Enums
    // ========================================================================

    enum FaultType {
        DISAGREEMENT,
        UNJUSTIFIED_BRANCHING,
        FABRICATION,
        PROTOCOL_VIOLATION
    }

    enum DisputeStatus {
        NONE,
        OPEN,
        ROUND_ACTIVE,
        ROUND_RESOLVED,
        FINALIZED
    }

    enum RoundLevel {
        L0,
        L1,
        L2,
        L3
    }

    enum RoundPhase {
        NONE,
        AUTO_CHECK,
        SELECTING_JURY,
        EVIDENCE,
        VOTING,
        TALLY_READY,
        RESOLVED
    }

    enum Winner {
        UNDECIDED,
        CHALLENGER,
        VERIFIER
    }

    enum EvidenceTier {
        C_ARGUMENT,
        B_PROVENANCE,
        A_CRYPTO
    }

    // ========================================================================
    // Structs
    // ========================================================================

    struct EvidencePacketMeta {
        bytes32 evidenceRoot;
        bytes32 ipfsCidHash;
        EvidenceTier maxTierClaimed;
    }

    struct JurorVote {
        Winner winner;
        uint16 invalidBranchCount;
        bool fabricationProven;
        EvidenceTier winningEvidenceTier;
        bytes32 rationaleHash;
    }

    struct Dispute {
        DisputeStatus status;
        bytes32 bundleId;
        uint32 branchId;
        FaultType faultType;
        address challenger;
        address verifier;
        uint256 createdAt;
        uint256 challengeBond;
        uint256 defenseBond;
        uint8 currentLevel;
        uint8 roundIndex;
    }

    struct Round {
        RoundLevel level;
        RoundPhase phase;
        uint256 vrfRequestId;
        address[] jurors;
        uint32 jurySize;
        uint64 evidenceDeadline;
        uint64 voteDeadline;
        uint64 appealDeadline;
        EvidencePacketMeta challengerEvidence;
        EvidencePacketMeta verifierEvidence;
        uint32 votesCast;
        Winner winner;
        uint16 invalidBranchCountMedian;
        bool fabricationProven;
        uint8 marginBps;
        bool finalized;
    }

    // ========================================================================
    // State Variables
    // ========================================================================

    IBundleRegistry public immutable bundleRegistry;
    IStakeManager public immutable stakeManager;
    VRFCoordinatorV2Interface private immutable vrfCoordinator;

    bytes32 private immutable keyHash;
    uint64 private immutable subscriptionId;
    uint32 private constant CALLBACK_GAS_LIMIT = 500000;
    uint16 private constant REQUEST_CONFIRMATIONS = 3;

    // Dispute storage
    uint256 public nextDisputeId = 1;
    mapping(uint256 => Dispute) public disputes;
    mapping(uint256 => mapping(uint8 => Round)) public rounds; // disputeId => roundIndex => Round
    mapping(uint256 => mapping(uint8 => mapping(address => bool))) public hasVoted;
    mapping(uint256 => mapping(uint8 => mapping(address => JurorVote))) public voteOf;

    // VRF request tracking
    mapping(uint256 => uint256) public vrfRequestToDispute; // vrfRequestId => disputeId
    mapping(uint256 => uint8) public vrfRequestToRound; // vrfRequestId => roundIndex

    // Configuration
    uint256 public constant SUPPORT_REQUIRED_BPS = 7500; // 75% confidence requires support
    uint16 public constant MAX_BRANCHES_PER_BUNDLE = 20;

    // Bond requirements (in wei)
    mapping(FaultType => uint256) public minChallengeBond;
    mapping(RoundLevel => uint256) public appealBondRequired;

    // Jury sizes
    mapping(RoundLevel => uint32) public jurySizes;

    // Time windows (in seconds)
    mapping(RoundLevel => uint64) public evidenceWindows;
    mapping(RoundLevel => uint64) public voteWindows;
    mapping(RoundLevel => uint64) public appealWindows;

    // ========================================================================
    // Events
    // ========================================================================

    event DisputeOpened(uint256 indexed disputeId, bytes32 indexed bundleId, address indexed challenger, FaultType faultType, uint256 bond);
    event DefenseBondPosted(uint256 indexed disputeId, address indexed verifier, uint256 amount);
    event RoundStarted(uint256 indexed disputeId, uint8 roundIndex, RoundLevel level, RoundPhase phase);
    event VRFRequested(uint256 indexed disputeId, uint256 indexed requestId, RoundLevel level, uint32 jurySize);
    event JurySelected(uint256 indexed disputeId, uint8 roundIndex, RoundLevel level, address[] jurors);
    event EvidenceSubmitted(uint256 indexed disputeId, bool forChallenger, bytes32 evidenceRoot, EvidenceTier maxTierClaimed);
    event VotingStarted(uint256 indexed disputeId, uint64 voteDeadline);
    event VoteCast(uint256 indexed disputeId, address indexed juror, Winner winner);
    event RoundResolved(uint256 indexed disputeId, uint8 roundIndex, RoundLevel level, Winner winner, uint8 marginBps, bool fabricationProven, uint16 invalidBranchMedian);
    event Appealed(uint256 indexed disputeId, address indexed appellant, RoundLevel newLevel, uint256 bond);
    event DisputeFinalized(uint256 indexed disputeId, Winner finalWinner, uint256 challengerPayout, uint256 verifierPayout);

    // ========================================================================
    // Constructor
    // ========================================================================

    constructor(
        IBundleRegistry _bundleRegistry,
        IStakeManager _stakeManager,
        address _vrfCoordinator,
        bytes32 _keyHash,
        uint64 _subscriptionId
    ) Ownable(msg.sender) VRFConsumerBaseV2(_vrfCoordinator) {
        bundleRegistry = _bundleRegistry;
        stakeManager = _stakeManager;
        vrfCoordinator = VRFCoordinatorV2Interface(_vrfCoordinator);
        keyHash = _keyHash;
        subscriptionId = _subscriptionId;

        // Default bond requirements
        minChallengeBond[FaultType.DISAGREEMENT] = 0.01 ether;
        minChallengeBond[FaultType.UNJUSTIFIED_BRANCHING] = 0.02 ether;
        minChallengeBond[FaultType.FABRICATION] = 0.05 ether;
        minChallengeBond[FaultType.PROTOCOL_VIOLATION] = 0.01 ether;

        appealBondRequired[RoundLevel.L1] = 0.05 ether;
        appealBondRequired[RoundLevel.L2] = 0.10 ether;
        appealBondRequired[RoundLevel.L3] = 0.20 ether;

        // Jury sizes
        jurySizes[RoundLevel.L1] = 5;
        jurySizes[RoundLevel.L2] = 15;
        jurySizes[RoundLevel.L3] = 51;

        // Time windows
        evidenceWindows[RoundLevel.L1] = 15 minutes;
        evidenceWindows[RoundLevel.L2] = 6 hours;
        evidenceWindows[RoundLevel.L3] = 24 hours;

        voteWindows[RoundLevel.L1] = 1 hours;
        voteWindows[RoundLevel.L2] = 12 hours;
        voteWindows[RoundLevel.L3] = 48 hours;

        appealWindows[RoundLevel.L1] = 2 hours;
        appealWindows[RoundLevel.L2] = 24 hours;
        appealWindows[RoundLevel.L3] = 24 hours;
    }

    // ========================================================================
    // A) Create Dispute
    // ========================================================================

    /**
     * @notice Open a new dispute
     * @param bundleId Bundle identifier
     * @param branchId Branch index (0 = whole bundle)
     * @param faultType Type of fault being disputed
     * @return disputeId New dispute ID
     */
    function openDispute(
        bytes32 bundleId,
        uint32 branchId,
        FaultType faultType
    ) external payable nonReentrant returns (uint256 disputeId) {
        require(msg.value >= minChallengeBond[faultType], "Insufficient bond");

        address verifier = bundleRegistry.getBundleOwner(bundleId);
        require(verifier != address(0), "Bundle not found");
        require(msg.sender != verifier, "Cannot dispute own bundle");

        disputeId = nextDisputeId++;

        disputes[disputeId] = Dispute({
            status: DisputeStatus.OPEN,
            bundleId: bundleId,
            branchId: branchId,
            faultType: faultType,
            challenger: msg.sender,
            verifier: verifier,
            createdAt: block.timestamp,
            challengeBond: msg.value,
            defenseBond: 0,
            currentLevel: 0, // L0
            roundIndex: 0
        });

        emit DisputeOpened(disputeId, bundleId, msg.sender, faultType, msg.value);
    }

    /**
     * @notice Post defense bond (optional)
     * @param disputeId Dispute ID
     */
    function postDefenseBond(uint256 disputeId) external payable nonReentrant {
        Dispute storage dispute = disputes[disputeId];
        require(dispute.status != DisputeStatus.NONE, "Dispute not found");
        require(msg.sender == dispute.verifier, "Only verifier");
        require(dispute.status != DisputeStatus.FINALIZED, "Already finalized");

        dispute.defenseBond += msg.value;

        emit DefenseBondPosted(disputeId, msg.sender, msg.value);
    }

    // ========================================================================
    // B) L0 Auto-Check
    // ========================================================================

    /**
     * @notice Run L0 automatic mechanical checks
     * @param disputeId Dispute ID
     */
    function runL0AutoCheck(uint256 disputeId) external nonReentrant {
        Dispute storage dispute = disputes[disputeId];
        require(dispute.status == DisputeStatus.OPEN, "Not open");
        require(dispute.currentLevel == 0, "Not L0");

        Round storage round = rounds[disputeId][0];
        round.level = RoundLevel.L0;
        round.phase = RoundPhase.AUTO_CHECK;

        emit RoundStarted(disputeId, 0, RoundLevel.L0, RoundPhase.AUTO_CHECK);

        // Run mechanical checks
        bool violation = _runMechanicalChecks(dispute.bundleId, dispute.branchId, dispute.faultType);

        if (violation) {
            // L0 found a violation → CHALLENGER wins
            round.winner = Winner.CHALLENGER;
            round.marginBps = 100; // 100% (mechanical)
            round.phase = RoundPhase.RESOLVED;
            round.appealDeadline = uint64(block.timestamp + appealWindows[RoundLevel.L0]);
            dispute.status = DisputeStatus.ROUND_RESOLVED;

            emit RoundResolved(disputeId, 0, RoundLevel.L0, Winner.CHALLENGER, 100, false, 0);
        } else {
            // L0 finds no mechanical fault → escalate to L1
            _escalateToNextLevel(disputeId);
        }
    }

    /**
     * @notice Run mechanical checks for L0
     * @return violation True if mechanical violation found
     */
    function _runMechanicalChecks(
        bytes32 bundleId,
        uint32 branchId,
        FaultType faultType
    ) internal view returns (bool violation) {
        (uint16 branchCount, , ) = bundleRegistry.getBundleMeta(bundleId);

        // Check 1: Branch budget exceeded
        uint16 budget = bundleRegistry.getDeclaredBudget(bundleId);
        if (branchCount > budget || branchCount > MAX_BRANCHES_PER_BUNDLE) {
            if (faultType == FaultType.UNJUSTIFIED_BRANCHING || faultType == FaultType.PROTOCOL_VIOLATION) {
                return true;
            }
        }

        // Check 2: Missing support on high-confidence branch
        if (branchId > 0) {
            (uint16 confidenceBps, bool requiresSupport) = bundleRegistry.getBranchMeta(bundleId, branchId);
            if (confidenceBps >= SUPPORT_REQUIRED_BPS || requiresSupport) {
                bytes32 supportRoot = bundleRegistry.getSupportCommitment(bundleId, branchId);
                if (supportRoot == bytes32(0)) {
                    if (faultType == FaultType.UNJUSTIFIED_BRANCHING || faultType == FaultType.PROTOCOL_VIOLATION) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    // ========================================================================
    // C) Escalate to Next Level
    // ========================================================================

    /**
     * @notice Escalate dispute to next level (L0 → L1, L1 → L2, etc.)
     * @param disputeId Dispute ID
     */
    function _escalateToNextLevel(uint256 disputeId) internal {
        Dispute storage dispute = disputes[disputeId];
        require(dispute.currentLevel < 3, "Max level reached");

        dispute.currentLevel++;
        dispute.roundIndex++;
        dispute.status = DisputeStatus.ROUND_ACTIVE;

        RoundLevel newLevel = RoundLevel(dispute.currentLevel);
        Round storage round = rounds[disputeId][dispute.roundIndex];

        round.level = newLevel;
        round.phase = RoundPhase.SELECTING_JURY;
        round.jurySize = jurySizes[newLevel];

        emit RoundStarted(disputeId, dispute.roundIndex, newLevel, RoundPhase.SELECTING_JURY);

        // Request VRF for jury selection
        _requestJuryVRF(disputeId, dispute.roundIndex);
    }

    /**
     * @notice Request VRF for jury selection
     * @param disputeId Dispute ID
     * @param roundIndex Round index
     */
    function _requestJuryVRF(uint256 disputeId, uint8 roundIndex) internal {
        Round storage round = rounds[disputeId][roundIndex];

        uint256 requestId = vrfCoordinator.requestRandomWords(
            keyHash,
            subscriptionId,
            REQUEST_CONFIRMATIONS,
            CALLBACK_GAS_LIMIT,
            uint32(round.jurySize)
        );

        round.vrfRequestId = requestId;
        vrfRequestToDispute[requestId] = disputeId;
        vrfRequestToRound[requestId] = roundIndex;

        emit VRFRequested(disputeId, requestId, round.level, round.jurySize);
    }

    // ========================================================================
    // D) VRF Callback (Jury Selection)
    // ========================================================================

    /**
     * @notice Chainlink VRF callback
     * @param requestId VRF request ID
     * @param randomWords Random values
     */
    function fulfillRandomWords(
        uint256 requestId,
        uint256[] memory randomWords
    ) internal override {
        uint256 disputeId = vrfRequestToDispute[requestId];
        uint8 roundIndex = vrfRequestToRound[requestId];

        require(disputeId != 0, "Unknown request");

        Dispute storage dispute = disputes[disputeId];
        Round storage round = rounds[disputeId][roundIndex];

        require(round.phase == RoundPhase.SELECTING_JURY, "Wrong phase");

        // Select jurors
        address[] memory selectedJurors = _selectJurors(
            randomWords,
            round.jurySize,
            dispute.challenger,
            dispute.verifier
        );

        round.jurors = selectedJurors;

        // Set phase based on level
        if (round.level == RoundLevel.L1) {
            // L1: Short evidence window or skip directly to voting
            round.evidenceDeadline = uint64(block.timestamp + evidenceWindows[RoundLevel.L1]);
            round.phase = RoundPhase.EVIDENCE;
        } else {
            // L2/L3: Mandatory evidence phase
            round.evidenceDeadline = uint64(block.timestamp + evidenceWindows[round.level]);
            round.phase = RoundPhase.EVIDENCE;
        }

        emit JurySelected(disputeId, roundIndex, round.level, selectedJurors);
    }

    /**
     * @notice Select jurors using VRF randomness
     * @param randomWords Random values from VRF
     * @param jurySize Number of jurors to select
     * @param challenger Challenger address (exclude)
     * @param verifier Verifier address (exclude)
     * @return selected Array of selected juror addresses
     */
    function _selectJurors(
        uint256[] memory randomWords,
        uint32 jurySize,
        address challenger,
        address verifier
    ) internal view returns (address[] memory selected) {
        uint256 activeCount = stakeManager.activeAuditorCount();
        require(activeCount >= jurySize, "Not enough auditors");

        selected = new address[](jurySize);
        uint256 selectedCount = 0;

        // Simple selection with replacement avoidance
        bool[] memory used = new bool[](activeCount);

        for (uint256 i = 0; i < randomWords.length && selectedCount < jurySize; i++) {
            uint256 idx = randomWords[i] % activeCount;

            // Skip if already used
            uint256 attempts = 0;
            while (used[idx] && attempts < activeCount) {
                idx = (idx + 1) % activeCount;
                attempts++;
            }

            if (used[idx]) break; // Safety: avoid infinite loop

            address auditor = stakeManager.activeAuditorAt(idx);

            // Exclude challenger and verifier
            if (auditor != challenger && auditor != verifier) {
                selected[selectedCount] = auditor;
                used[idx] = true;
                selectedCount++;
            }
        }

        require(selectedCount == jurySize, "Failed to select jury");
    }

    // ========================================================================
    // E) Evidence Submission
    // ========================================================================

    /**
     * @notice Submit evidence packet metadata
     * @param disputeId Dispute ID
     * @param forChallenger True if submitting for challenger
     * @param meta Evidence packet metadata
     */
    function submitEvidence(
        uint256 disputeId,
        bool forChallenger,
        EvidencePacketMeta calldata meta
    ) external nonReentrant {
        Dispute storage dispute = disputes[disputeId];
        Round storage round = rounds[disputeId][dispute.roundIndex];

        require(round.phase == RoundPhase.EVIDENCE, "Not evidence phase");
        require(block.timestamp <= round.evidenceDeadline, "Evidence deadline passed");

        if (forChallenger) {
            require(msg.sender == dispute.challenger, "Only challenger");
            round.challengerEvidence = meta;
        } else {
            require(msg.sender == dispute.verifier, "Only verifier");
            round.verifierEvidence = meta;
        }

        emit EvidenceSubmitted(disputeId, forChallenger, meta.evidenceRoot, meta.maxTierClaimed);
    }

    /**
     * @notice Start voting phase after evidence deadline
     * @param disputeId Dispute ID
     */
    function startVoting(uint256 disputeId) external nonReentrant {
        Dispute storage dispute = disputes[disputeId];
        Round storage round = rounds[disputeId][dispute.roundIndex];

        require(round.phase == RoundPhase.EVIDENCE, "Not evidence phase");
        require(block.timestamp > round.evidenceDeadline, "Evidence window still open");

        round.phase = RoundPhase.VOTING;
        round.voteDeadline = uint64(block.timestamp + voteWindows[round.level]);

        emit VotingStarted(disputeId, round.voteDeadline);
    }

    // ========================================================================
    // F) Voting
    // ========================================================================

    /**
     * @notice Cast vote as juror
     * @param disputeId Dispute ID
     * @param vote Juror vote
     */
    function castVote(uint256 disputeId, JurorVote calldata vote) external nonReentrant {
        Dispute storage dispute = disputes[disputeId];
        Round storage round = rounds[disputeId][dispute.roundIndex];

        require(round.phase == RoundPhase.VOTING, "Not voting phase");
        require(block.timestamp <= round.voteDeadline, "Voting ended");
        require(_isJuror(round.jurors, msg.sender), "Not a juror");
        require(!hasVoted[disputeId][dispute.roundIndex][msg.sender], "Already voted");

        voteOf[disputeId][dispute.roundIndex][msg.sender] = vote;
        hasVoted[disputeId][dispute.roundIndex][msg.sender] = true;
        round.votesCast++;

        emit VoteCast(disputeId, msg.sender, vote.winner);

        // If all jurors voted, allow early tally
        if (round.votesCast == round.jurySize) {
            round.phase = RoundPhase.TALLY_READY;
        }
    }

    /**
     * @notice Check if address is a juror
     */
    function _isJuror(address[] memory jurors, address addr) internal pure returns (bool) {
        for (uint256 i = 0; i < jurors.length; i++) {
            if (jurors[i] == addr) return true;
        }
        return false;
    }

    /**
     * @notice Close voting after deadline
     * @param disputeId Dispute ID
     */
    function closeVoting(uint256 disputeId) external nonReentrant {
        Dispute storage dispute = disputes[disputeId];
        Round storage round = rounds[disputeId][dispute.roundIndex];

        require(round.phase == RoundPhase.VOTING, "Not voting");
        require(
            block.timestamp > round.voteDeadline || round.votesCast == round.jurySize,
            "Voting still open"
        );

        round.phase = RoundPhase.TALLY_READY;
    }

    // ========================================================================
    // G) Tally
    // ========================================================================

    /**
     * @notice Tally votes and compute round outcome
     * @param disputeId Dispute ID
     */
    function tally(uint256 disputeId) external nonReentrant {
        Dispute storage dispute = disputes[disputeId];
        Round storage round = rounds[disputeId][dispute.roundIndex];

        require(round.phase == RoundPhase.TALLY_READY, "Not ready to tally");
        require(round.votesCast > 0, "No votes cast");

        // Count votes
        uint256 challengerVotes = 0;
        uint256 verifierVotes = 0;
        uint256 fabricationCount = 0;
        uint16[] memory invalidCounts = new uint16[](round.votesCast);
        uint256 countIndex = 0;

        for (uint256 i = 0; i < round.jurors.length; i++) {
            address juror = round.jurors[i];
            if (hasVoted[disputeId][dispute.roundIndex][juror]) {
                JurorVote storage v = voteOf[disputeId][dispute.roundIndex][juror];

                if (v.winner == Winner.CHALLENGER) challengerVotes++;
                else if (v.winner == Winner.VERIFIER) verifierVotes++;

                if (v.fabricationProven) fabricationCount++;

                invalidCounts[countIndex] = v.invalidBranchCount;
                countIndex++;
            }
        }

        // Determine winner (majority)
        if (challengerVotes > verifierVotes) {
            round.winner = Winner.CHALLENGER;
        } else if (verifierVotes > challengerVotes) {
            round.winner = Winner.VERIFIER;
        } else {
            round.winner = Winner.UNDECIDED; // Tie (rare, escalate or finalize with split)
        }

        // Fabrication proven if majority says so
        round.fabricationProven = (fabricationCount * 2 > round.votesCast);

        // Invalid branch count median
        round.invalidBranchCountMedian = _median(invalidCounts, countIndex);

        // Margin
        uint256 winnerVotes = challengerVotes > verifierVotes ? challengerVotes : verifierVotes;
        round.marginBps = uint8((winnerVotes * 100) / round.jurySize);

        // Mark resolved
        round.phase = RoundPhase.RESOLVED;
        round.appealDeadline = uint64(block.timestamp + appealWindows[round.level]);
        dispute.status = DisputeStatus.ROUND_RESOLVED;

        emit RoundResolved(
            disputeId,
            dispute.roundIndex,
            round.level,
            round.winner,
            round.marginBps,
            round.fabricationProven,
            round.invalidBranchCountMedian
        );
    }

    /**
     * @notice Compute median of uint16 array
     */
    function _median(uint16[] memory arr, uint256 len) internal pure returns (uint16) {
        if (len == 0) return 0;

        // Sort (insertion sort, fine for small arrays)
        for (uint256 i = 1; i < len; i++) {
            uint16 key = arr[i];
            uint256 j = i;
            while (j > 0 && arr[j - 1] > key) {
                arr[j] = arr[j - 1];
                j--;
            }
            arr[j] = key;
        }

        return arr[len / 2];
    }

    // ========================================================================
    // H) Appeal / Escalate
    // ========================================================================

    /**
     * @notice Appeal current round outcome
     * @param disputeId Dispute ID
     */
    function appeal(uint256 disputeId) external payable nonReentrant {
        Dispute storage dispute = disputes[disputeId];
        Round storage round = rounds[disputeId][dispute.roundIndex];

        require(dispute.status == DisputeStatus.ROUND_RESOLVED, "Not resolved");
        require(block.timestamp <= round.appealDeadline, "Appeal window closed");
        require(dispute.currentLevel < 3, "Max level reached");

        // Only loser can appeal
        bool isLoser = (round.winner == Winner.CHALLENGER && msg.sender == dispute.verifier) ||
                       (round.winner == Winner.VERIFIER && msg.sender == dispute.challenger);
        require(isLoser, "Only loser can appeal");

        RoundLevel nextLevel = RoundLevel(dispute.currentLevel + 1);
        require(msg.value >= appealBondRequired[nextLevel], "Insufficient appeal bond");

        // Add appeal bond to appropriate side
        if (msg.sender == dispute.challenger) {
            dispute.challengeBond += msg.value;
        } else {
            dispute.defenseBond += msg.value;
        }

        emit Appealed(disputeId, msg.sender, nextLevel, msg.value);

        // Escalate to next level
        _escalateToNextLevel(disputeId);
    }

    // ========================================================================
    // I) Finalize
    // ========================================================================

    /**
     * @notice Finalize dispute after appeal deadline or if no appeal
     * @param disputeId Dispute ID
     */
    function finalize(uint256 disputeId) external nonReentrant {
        Dispute storage dispute = disputes[disputeId];
        Round storage round = rounds[disputeId][dispute.roundIndex];

        require(dispute.status == DisputeStatus.ROUND_RESOLVED, "Not resolved");
        require(block.timestamp > round.appealDeadline, "Appeal window still open");

        dispute.status = DisputeStatus.FINALIZED;
        round.finalized = true;

        // Compute payouts and slashing
        (uint256 challengerPayout, uint256 verifierPayout) = _computePayouts(disputeId);

        // Distribute juror rewards
        _distributeJurorRewards(disputeId);

        // Transfer payouts
        if (challengerPayout > 0) {
            payable(dispute.challenger).transfer(challengerPayout);
        }
        if (verifierPayout > 0) {
            payable(dispute.verifier).transfer(verifierPayout);
        }

        emit DisputeFinalized(disputeId, round.winner, challengerPayout, verifierPayout);
    }

    /**
     * @notice Compute final payouts based on outcome
     */
    function _computePayouts(uint256 disputeId) internal view returns (
        uint256 challengerPayout,
        uint256 verifierPayout
    ) {
        Dispute storage dispute = disputes[disputeId];
        Round storage round = rounds[disputeId][dispute.roundIndex];

        uint256 totalBond = dispute.challengeBond + dispute.defenseBond;
        uint256 jurorReward = totalBond / 5; // 20% to jurors
        uint256 remainder = totalBond - jurorReward;

        if (round.winner == Winner.CHALLENGER) {
            challengerPayout = remainder;
            verifierPayout = 0;
        } else if (round.winner == Winner.VERIFIER) {
            challengerPayout = 0;
            verifierPayout = remainder;
        } else {
            // Tie: split equally
            challengerPayout = remainder / 2;
            verifierPayout = remainder / 2;
        }
    }

    /**
     * @notice Distribute rewards to jurors
     */
    function _distributeJurorRewards(uint256 disputeId) internal {
        Dispute storage dispute = disputes[disputeId];
        Round storage round = rounds[disputeId][dispute.roundIndex];

        uint256 totalBond = dispute.challengeBond + dispute.defenseBond;
        uint256 jurorReward = totalBond / 5; // 20% to jurors

        if (round.votesCast == 0) return;

        uint256 rewardPerJuror = jurorReward / round.votesCast;

        for (uint256 i = 0; i < round.jurors.length; i++) {
            address juror = round.jurors[i];
            if (hasVoted[disputeId][dispute.roundIndex][juror]) {
                stakeManager.reward{value: rewardPerJuror}(juror, rewardPerJuror);
            }
        }
    }

    // ========================================================================
    // Configuration
    // ========================================================================

    function setMinChallengeBond(FaultType faultType, uint256 amount) external onlyOwner {
        minChallengeBond[faultType] = amount;
    }

    function setAppealBond(RoundLevel level, uint256 amount) external onlyOwner {
        appealBondRequired[level] = amount;
    }

    function setJurySize(RoundLevel level, uint32 size) external onlyOwner {
        jurySizes[level] = size;
    }

    function setTimeWindows(
        RoundLevel level,
        uint64 evidenceWindow,
        uint64 voteWindow,
        uint64 appealWindow
    ) external onlyOwner {
        evidenceWindows[level] = evidenceWindow;
        voteWindows[level] = voteWindow;
        appealWindows[level] = appealWindow;
    }

    // ========================================================================
    // View Functions
    // ========================================================================

    function getDispute(uint256 disputeId) external view returns (Dispute memory) {
        return disputes[disputeId];
    }

    function getRound(uint256 disputeId, uint8 roundIndex) external view returns (
        RoundLevel level,
        RoundPhase phase,
        address[] memory jurors,
        uint64 evidenceDeadline,
        uint64 voteDeadline,
        uint64 appealDeadline,
        uint32 votesCast,
        Winner winner
    ) {
        Round storage round = rounds[disputeId][roundIndex];
        return (
            round.level,
            round.phase,
            round.jurors,
            round.evidenceDeadline,
            round.voteDeadline,
            round.appealDeadline,
            round.votesCast,
            round.winner
        );
    }

    function getVote(uint256 disputeId, uint8 roundIndex, address juror) external view returns (JurorVote memory) {
        return voteOf[disputeId][roundIndex][juror];
    }

    receive() external payable {}
}
