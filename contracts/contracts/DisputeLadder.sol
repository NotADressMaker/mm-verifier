// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IDisputeInterfaces.sol";
import "./interfaces/IWETH.sol";
import "@chainlink/contracts/src/v0.8/vrf/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title DisputeLadder
 * @notice Multi-tier dispute resolution with VRF jury selection (WETH-based)
 * @dev Implements L0 (auto-check) → L1 (small jury) → L2 (medium jury) → L3 (large jury) → Final
 *
 * State Machine:
 * NONE → OPEN (L0 auto-check) → ROUND_ACTIVE → ROUND_RESOLVED → FINALIZED
 *                                      ↓ appeal ↑
 *                                   (escalate to next level)
 *
 * Each round: SELECTING_JURY → EVIDENCE → VOTING → TALLY_READY → RESOLVED → appealable or finalize
 *
 * Bond Management:
 * - Dispute bonds (challenger/verifier): Managed directly in WETH by DisputeLadder
 * - Auditor stakes: Managed by AuditorRegistry (IStakeManager)
 * - Rewards paid in WETH to auditor stakes
 *
 * Emergency Control:
 * - Pausable for production safety (dispute operations can be paused)
 */
contract DisputeLadder is Ownable, ReentrancyGuard, Pausable, VRFConsumerBaseV2 {
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

    IWETH public immutable WETH;
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

    // Juror rewards (pull-based)
    mapping(address => uint256) public pendingRewards;

    // Human expert system
    uint8 public humanExpertWeightMultiplier = 2; // Human experts get 2x selection probability

    // ========================================================================
    // Events
    // ========================================================================

    event DisputeOpened(uint256 indexed disputeId, bytes32 indexed bundleId, address indexed challenger, FaultType faultType, uint256 bond, uint256 timestamp);
    event DefenseBondPosted(uint256 indexed disputeId, address indexed verifier, uint256 amount, uint256 timestamp);
    event RoundStarted(uint256 indexed disputeId, uint8 roundIndex, RoundLevel level, RoundPhase phase, uint256 timestamp);
    event VRFRequested(uint256 indexed disputeId, uint256 indexed requestId, RoundLevel level, uint32 jurySize, uint256 timestamp);
    event JurySelected(uint256 indexed disputeId, uint8 roundIndex, RoundLevel level, address[] jurors, uint256 timestamp);
    event EvidenceSubmitted(uint256 indexed disputeId, bool forChallenger, bytes32 evidenceRoot, EvidenceTier maxTierClaimed, uint256 timestamp);
    event VotingStarted(uint256 indexed disputeId, uint64 voteDeadline, uint256 timestamp);
    event VoteCast(uint256 indexed disputeId, address indexed juror, Winner winner, uint256 timestamp);
    event RoundResolved(uint256 indexed disputeId, uint8 roundIndex, RoundLevel level, Winner winner, uint8 marginBps, bool fabricationProven, uint16 invalidBranchMedian, uint256 timestamp);
    event Appealed(uint256 indexed disputeId, address indexed appellant, RoundLevel newLevel, uint256 bond, uint256 timestamp);
    event DisputeFinalized(uint256 indexed disputeId, Winner finalWinner, uint256 challengerPayout, uint256 verifierPayout, uint256 timestamp);
    event RewardsAccumulated(uint256 indexed disputeId, address indexed juror, uint256 amount, uint256 timestamp);
    event RewardsClaimed(address indexed juror, uint256 amount, uint256 timestamp);

    // ========================================================================
    // Constructor
    // ========================================================================

    constructor(
        IWETH _weth,
        IBundleRegistry _bundleRegistry,
        IStakeManager _stakeManager,
        address _vrfCoordinator,
        bytes32 _keyHash,
        uint64 _subscriptionId
    ) Ownable(msg.sender) VRFConsumerBaseV2(_vrfCoordinator) {
        require(address(_weth) != address(0), "Invalid WETH");
        WETH = _weth;
        bundleRegistry = _bundleRegistry;
        stakeManager = _stakeManager;
        vrfCoordinator = VRFCoordinatorV2Interface(_vrfCoordinator);
        keyHash = _keyHash;
        subscriptionId = _subscriptionId;

        // Default bond requirements (in WETH wei)
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
     * @notice Open a new dispute (WETH-based)
     * @dev Challenger must approve this contract to spend WETH first
     * @param bundleId Bundle identifier
     * @param branchId Branch index (0 = whole bundle)
     * @param faultType Type of fault being disputed
     * @param bondAmount Amount of WETH to bond
     * @return disputeId New dispute ID
     */
    function openDispute(
        bytes32 bundleId,
        uint32 branchId,
        FaultType faultType,
        uint256 bondAmount
    ) external nonReentrant whenNotPaused returns (uint256 disputeId) {
        require(bondAmount >= minChallengeBond[faultType], "Insufficient bond");

        address verifier = bundleRegistry.getBundleOwner(bundleId);
        require(verifier != address(0), "Bundle not found");
        require(msg.sender != verifier, "Cannot dispute own bundle");

        // Transfer WETH bond from challenger
        require(WETH.transferFrom(msg.sender, address(this), bondAmount), "WETH transfer failed");

        disputeId = nextDisputeId++;

        disputes[disputeId] = Dispute({
            status: DisputeStatus.OPEN,
            bundleId: bundleId,
            branchId: branchId,
            faultType: faultType,
            challenger: msg.sender,
            verifier: verifier,
            createdAt: block.timestamp,
            challengeBond: bondAmount,
            defenseBond: 0,
            currentLevel: 0, // L0
            roundIndex: 0
        });

        emit DisputeOpened(disputeId, bundleId, msg.sender, faultType, bondAmount, block.timestamp);
    }

    /**
     * @notice Open a new dispute with ETH (convenience wrapper)
     * @dev Wraps ETH to WETH and calls openDispute logic inline
     * @param bundleId Bundle identifier
     * @param branchId Branch index (0 = whole bundle)
     * @param faultType Type of fault being disputed
     * @return disputeId New dispute ID
     */
    function openDisputeWithETH(
        bytes32 bundleId,
        uint32 branchId,
        FaultType faultType
    ) external payable nonReentrant whenNotPaused returns (uint256 disputeId) {
        require(msg.value >= minChallengeBond[faultType], "Insufficient bond");

        address verifier = bundleRegistry.getBundleOwner(bundleId);
        require(verifier != address(0), "Bundle not found");
        require(msg.sender != verifier, "Cannot dispute own bundle");

        // Wrap ETH to WETH
        WETH.deposit{value: msg.value}();

        uint256 bondAmount = msg.value;
        disputeId = nextDisputeId++;

        disputes[disputeId] = Dispute({
            status: DisputeStatus.OPEN,
            bundleId: bundleId,
            branchId: branchId,
            faultType: faultType,
            challenger: msg.sender,
            verifier: verifier,
            createdAt: block.timestamp,
            challengeBond: bondAmount,
            defenseBond: 0,
            currentLevel: 0, // L0
            roundIndex: 0
        });

        emit DisputeOpened(disputeId, bundleId, msg.sender, faultType, bondAmount, block.timestamp);
    }

    /**
     * @notice Post defense bond (optional, WETH-based)
     * @dev Verifier must approve this contract to spend WETH first
     * @param disputeId Dispute ID
     * @param bondAmount Amount of WETH to bond
     */
    function postDefenseBond(uint256 disputeId, uint256 bondAmount) external nonReentrant whenNotPaused {
        Dispute storage dispute = disputes[disputeId];
        require(dispute.status != DisputeStatus.NONE, "Dispute not found");
        require(msg.sender == dispute.verifier, "Only verifier");
        require(dispute.status != DisputeStatus.FINALIZED, "Already finalized");
        require(bondAmount > 0, "Bond amount must be > 0");

        // Transfer WETH bond from verifier
        require(WETH.transferFrom(msg.sender, address(this), bondAmount), "WETH transfer failed");

        dispute.defenseBond += bondAmount;

        emit DefenseBondPosted(disputeId, msg.sender, bondAmount, block.timestamp);
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

        emit RoundStarted(disputeId, 0, RoundLevel.L0, RoundPhase.AUTO_CHECK, block.timestamp);

        // Run mechanical checks
        bool violation = _runMechanicalChecks(dispute.bundleId, dispute.branchId, dispute.faultType);

        if (violation) {
            // L0 found a violation → CHALLENGER wins
            round.winner = Winner.CHALLENGER;
            round.marginBps = 100; // 100% (mechanical)
            round.phase = RoundPhase.RESOLVED;
            round.appealDeadline = uint64(block.timestamp + appealWindows[RoundLevel.L0]);
            dispute.status = DisputeStatus.ROUND_RESOLVED;

            emit RoundResolved(disputeId, 0, RoundLevel.L0, Winner.CHALLENGER, 100, false, 0, block.timestamp);
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

        emit RoundStarted(disputeId, dispute.roundIndex, newLevel, RoundPhase.SELECTING_JURY, block.timestamp);

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

        emit VRFRequested(disputeId, requestId, round.level, round.jurySize, block.timestamp);
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

        emit JurySelected(disputeId, roundIndex, round.level, selectedJurors, block.timestamp);
    }

    /**
     * @notice Select jurors using VRF randomness with human expert weighting
     * @dev Human experts have higher selection probability (2x default)
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

        // Build weighted pool: human experts appear multiple times
        // Note: For gas efficiency, we use modulo bias towards lower indices for humans
        // Future: Implement full weighted sampling for large jury pools

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

        // Post-selection: Prioritize human experts for L2/L3 rounds
        // If we have human experts available, replace some AI jurors
        _prioritizeHumanExperts(selected, challenger, verifier);
    }

    /**
     * @notice Prioritize human experts in jury selection (weighted approach)
     * @dev Ensures human experts are represented based on humanExpertWeightMultiplier
     * @param selected Initial selected jury (modified in-place)
     * @param challenger Challenger address (exclude)
     * @param verifier Verifier address (exclude)
     */
    function _prioritizeHumanExperts(
        address[] memory selected,
        address challenger,
        address verifier
    ) internal view {
        // Get all active human experts
        address[] memory experts = stakeManager.getActiveHumanExperts();
        if (experts.length == 0) return; // No experts available

        // Count how many experts are already in the jury
        uint256 expertCount = 0;
        bool[] memory isExpertInJury = new bool[](selected.length);

        for (uint256 i = 0; i < selected.length; i++) {
            if (stakeManager.isHumanExpert(selected[i])) {
                expertCount++;
                isExpertInJury[i] = true;
            }
        }

        // Calculate target expert count based on weight multiplier
        // If multiplier is 2, target is: jurySize * 2 / (totalAuditors + experts)
        // Simplified: Aim for humanExpertWeightMultiplier * normalProbability
        // For 2x weight with 10% experts: target ~18% of jury (simplified to min 20%)
        uint256 targetExpertCount = (selected.length * uint256(humanExpertWeightMultiplier)) / 10;
        if (targetExpertCount > selected.length / 2) {
            targetExpertCount = selected.length / 2; // Cap at 50% of jury
        }
        if (targetExpertCount > experts.length) {
            targetExpertCount = experts.length; // Can't exceed available experts
        }

        // If we already have enough experts, we're done
        if (expertCount >= targetExpertCount) return;

        // Replace non-expert jurors with experts
        uint256 replacementsNeeded = targetExpertCount - expertCount;
        uint256 replacementsMade = 0;
        uint256 expertIdx = 0;

        for (uint256 i = 0; i < selected.length && replacementsMade < replacementsNeeded; i++) {
            // Skip if already an expert
            if (isExpertInJury[i]) continue;

            // Find next available expert not already in jury and not challenger/verifier
            while (expertIdx < experts.length) {
                address expert = experts[expertIdx];
                expertIdx++;

                // Check if expert is already in selected jury
                bool alreadySelected = false;
                for (uint256 j = 0; j < selected.length; j++) {
                    if (selected[j] == expert) {
                        alreadySelected = true;
                        break;
                    }
                }

                // Check if expert is challenger or verifier
                if (!alreadySelected && expert != challenger && expert != verifier) {
                    // Replace this AI juror with the expert
                    selected[i] = expert;
                    isExpertInJury[i] = true;
                    replacementsMade++;
                    break;
                }
            }

            // If we've exhausted all experts, stop trying
            if (expertIdx >= experts.length) break;
        }
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
    ) external nonReentrant whenNotPaused {
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

        emit EvidenceSubmitted(disputeId, forChallenger, meta.evidenceRoot, meta.maxTierClaimed, block.timestamp);
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

        emit VotingStarted(disputeId, round.voteDeadline, block.timestamp);
    }

    // ========================================================================
    // F) Voting
    // ========================================================================

    /**
     * @notice Cast vote as juror
     * @param disputeId Dispute ID
     * @param vote Juror vote
     */
    function castVote(uint256 disputeId, JurorVote calldata vote) external nonReentrant whenNotPaused {
        Dispute storage dispute = disputes[disputeId];
        Round storage round = rounds[disputeId][dispute.roundIndex];

        require(round.phase == RoundPhase.VOTING, "Not voting phase");
        require(block.timestamp <= round.voteDeadline, "Voting ended");
        require(_isJuror(round.jurors, msg.sender), "Not a juror");
        require(!hasVoted[disputeId][dispute.roundIndex][msg.sender], "Already voted");

        voteOf[disputeId][dispute.roundIndex][msg.sender] = vote;
        hasVoted[disputeId][dispute.roundIndex][msg.sender] = true;
        round.votesCast++;

        emit VoteCast(disputeId, msg.sender, vote.winner, block.timestamp);

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
            round.invalidBranchCountMedian,
            block.timestamp
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
     * @notice Appeal current round outcome (WETH-based)
     * @dev Appellant must approve this contract to spend WETH first
     * @param disputeId Dispute ID
     * @param bondAmount Amount of WETH to bond for appeal
     */
    function appeal(uint256 disputeId, uint256 bondAmount) external nonReentrant whenNotPaused {
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
        require(bondAmount >= appealBondRequired[nextLevel], "Insufficient appeal bond");

        // Transfer WETH bond from appellant
        require(WETH.transferFrom(msg.sender, address(this), bondAmount), "WETH transfer failed");

        // Add appeal bond to appropriate side
        if (msg.sender == dispute.challenger) {
            dispute.challengeBond += bondAmount;
        } else {
            dispute.defenseBond += bondAmount;
        }

        emit Appealed(disputeId, msg.sender, nextLevel, bondAmount, block.timestamp);

        // Escalate to next level
        _escalateToNextLevel(disputeId);
    }

    // ========================================================================
    // I) Finalize
    // ========================================================================

    /**
     * @notice Finalize dispute after appeal deadline or if no appeal (WETH-based)
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

        // Distribute juror rewards (in WETH)
        _distributeJurorRewards(disputeId);

        // Transfer WETH payouts
        if (challengerPayout > 0) {
            require(WETH.transfer(dispute.challenger, challengerPayout), "WETH transfer failed");
        }
        if (verifierPayout > 0) {
            require(WETH.transfer(dispute.verifier, verifierPayout), "WETH transfer failed");
        }

        emit DisputeFinalized(disputeId, round.winner, challengerPayout, verifierPayout, block.timestamp);
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
     * @notice Accumulate WETH rewards for jurors (pull-based pattern)
     * @dev Jurors must call claimRewards() to withdraw accumulated rewards
     *      This prevents one failed transfer from blocking the entire finalization
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
                pendingRewards[juror] += rewardPerJuror;
                emit RewardsAccumulated(disputeId, juror, rewardPerJuror, block.timestamp);
            }
        }
    }

    /**
     * @notice Claim accumulated juror rewards
     * @dev Pull-based reward withdrawal for gas efficiency and safety
     */
    function claimRewards() external nonReentrant {
        uint256 amount = pendingRewards[msg.sender];
        require(amount > 0, "No rewards to claim");

        // Clear pending rewards before transfer (reentrancy protection)
        pendingRewards[msg.sender] = 0;

        // Transfer WETH to juror
        require(WETH.transfer(msg.sender, amount), "WETH transfer failed");

        emit RewardsClaimed(msg.sender, amount, block.timestamp);
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

    function setHumanExpertWeightMultiplier(uint8 multiplier) external onlyOwner {
        require(multiplier > 0 && multiplier <= 10, "Invalid multiplier");
        humanExpertWeightMultiplier = multiplier;
    }

    // ========================================================================
    // Emergency Functions
    // ========================================================================

    /**
     * @notice Pause dispute operations in case of emergency
     * @dev Only callable by owner (governance/multisig)
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause dispute operations after emergency resolved
     * @dev Only callable by owner (governance/multisig)
     */
    function unpause() external onlyOwner {
        _unpause();
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

    /**
     * @notice Get comprehensive dispute summary (dashboard helper)
     * @param disputeId Dispute ID
     * @return status Current dispute status
     * @return bundleId Bundle identifier
     * @return challenger Challenger address
     * @return verifier Verifier address
     * @return challengeBond Challenge bond amount
     * @return defenseBond Defense bond amount
     * @return currentLevel Current round level (0=L0, 1=L1, 2=L2, 3=L3)
     * @return roundPhase Current round phase
     * @return winner Current round winner (if resolved)
     */
    function getDisputeSummary(uint256 disputeId) external view returns (
        DisputeStatus status,
        bytes32 bundleId,
        address challenger,
        address verifier,
        uint256 challengeBond,
        uint256 defenseBond,
        uint8 currentLevel,
        RoundPhase roundPhase,
        Winner winner
    ) {
        Dispute storage dispute = disputes[disputeId];
        Round storage round = rounds[disputeId][dispute.roundIndex];

        return (
            dispute.status,
            dispute.bundleId,
            dispute.challenger,
            dispute.verifier,
            dispute.challengeBond,
            dispute.defenseBond,
            dispute.currentLevel,
            round.phase,
            round.winner
        );
    }
}
