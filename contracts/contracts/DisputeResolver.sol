// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./StakingManager.sol";
import "./AuditorRegistryV2.sol";

/**
 * @title DisputeResolver
 * @notice Handles multi-tier dispute resolution with escalating stakes
 * @dev Implements dispute ladder: Tier 0 (auto-check) -> Tier 1 (auditor review) -> Tier 2+ (appeals)
 */
contract DisputeResolver is Ownable, ReentrancyGuard {
    StakingManager public immutable stakingManager;
    AuditorRegistryV2 public immutable auditorRegistry;

    enum DisputeStatus {
        Pending,
        UnderReview,
        Resolved,
        Escalated
    }

    enum DisputeTier {
        AutoCheck,      // Tier 0
        AuditorReview,  // Tier 1
        Appeal          // Tier 2+
    }

    struct Dispute {
        bytes32 jobId;
        address challenger;
        address verifier;
        string reason;
        bytes32 evidenceHash;
        DisputeStatus status;
        DisputeTier tier;
        uint256 challengerStake;
        uint256 createdAt;
        uint256 resolvedAt;
        bool challengerWon;
        address[] auditors;
        mapping(address => bool) auditorVotes; // true = challenger wins, false = verifier wins
        uint256 votesForChallenger;
        uint256 votesForVerifier;
    }

    // Dispute ID => Dispute
    mapping(bytes32 => Dispute) public disputes;

    // Job ID => Dispute IDs
    mapping(bytes32 => bytes32[]) public jobDisputes;

    // Challenge stake requirements (doubles each tier)
    uint256 public constant BASE_CHALLENGE_STAKE = 0.01 ether;
    uint256 public constant TIER_MULTIPLIER = 2;

    // Auditor committee sizes per tier
    uint256 public constant TIER1_COMMITTEE_SIZE = 3;
    uint256 public constant TIER2_COMMITTEE_SIZE = 5;

    // Voting periods
    uint256 public constant VOTING_PERIOD = 3 days;
    uint256 public constant AUTO_CHECK_PERIOD = 1 hours;

    // Slashed fund distribution
    uint256 public constant CHALLENGER_REWARD_PERCENTAGE = 60;
    uint256 public constant AUDITOR_REWARD_PERCENTAGE = 40;

    // Events
    event DisputeCreated(
        bytes32 indexed disputeId,
        bytes32 indexed jobId,
        address indexed challenger,
        address verifier,
        DisputeTier tier
    );
    event DisputeEscalated(bytes32 indexed disputeId, DisputeTier newTier);
    event AuditorVoted(bytes32 indexed disputeId, address indexed auditor, bool challengerWins);
    event DisputeResolved(bytes32 indexed disputeId, bool challengerWon, uint256 slashedAmount);

    constructor(
        address _stakingManager,
        address _auditorRegistry
    ) Ownable(msg.sender) {
        stakingManager = StakingManager(_stakingManager);
        auditorRegistry = AuditorRegistryV2(_auditorRegistry);
    }

    /**
     * @notice Create a new dispute
     * @param jobId Job identifier
     * @param verifier Address of verifier being challenged
     * @param reason Reason for dispute
     * @param evidenceHash Hash of challenger's evidence
     * @return disputeId Dispute identifier
     */
    function createDispute(
        bytes32 jobId,
        address verifier,
        string calldata reason,
        bytes32 evidenceHash
    ) external payable nonReentrant returns (bytes32) {
        require(msg.value >= BASE_CHALLENGE_STAKE, "Insufficient challenge stake");
        require(verifier != address(0), "Invalid verifier address");
        require(bytes(reason).length > 0, "Reason required");

        bytes32 disputeId = keccak256(
            abi.encodePacked(jobId, msg.sender, verifier, block.timestamp)
        );

        Dispute storage dispute = disputes[disputeId];
        dispute.jobId = jobId;
        dispute.challenger = msg.sender;
        dispute.verifier = verifier;
        dispute.reason = reason;
        dispute.evidenceHash = evidenceHash;
        dispute.status = DisputeStatus.Pending;
        dispute.tier = DisputeTier.AutoCheck;
        dispute.challengerStake = msg.value;
        dispute.createdAt = block.timestamp;

        jobDisputes[jobId].push(disputeId);

        emit DisputeCreated(disputeId, jobId, msg.sender, verifier, DisputeTier.AutoCheck);

        return disputeId;
    }

    /**
     * @notice Perform Tier 0 auto-check
     * @param disputeId Dispute identifier
     * @param evidenceValid Whether evidence bundle is valid
     */
    function autoCheckDispute(bytes32 disputeId, bool evidenceValid) external onlyOwner {
        Dispute storage dispute = disputes[disputeId];
        require(dispute.status == DisputeStatus.Pending, "Invalid status");
        require(dispute.tier == DisputeTier.AutoCheck, "Not in auto-check tier");

        if (!evidenceValid) {
            // Evidence is invalid/incomplete - challenger wins immediately
            _resolveDispute(disputeId, true);
        } else {
            // Escalate to Tier 1
            _escalateToTier1(disputeId);
        }
    }

    /**
     * @notice Escalate to Tier 1 (auditor review)
     */
    function _escalateToTier1(bytes32 disputeId) private {
        Dispute storage dispute = disputes[disputeId];
        dispute.tier = DisputeTier.AuditorReview;
        dispute.status = DisputeStatus.UnderReview;

        // Request VRF auditor selection
        auditorRegistry.requestAuditorSelection(disputeId, TIER1_COMMITTEE_SIZE);

        emit DisputeEscalated(disputeId, DisputeTier.AuditorReview);
    }

    /**
     * @notice Submit auditor vote
     * @param disputeId Dispute identifier
     * @param challengerWins Vote outcome
     */
    function submitAuditorVote(bytes32 disputeId, bool challengerWins) external {
        Dispute storage dispute = disputes[disputeId];
        require(dispute.status == DisputeStatus.UnderReview, "Not under review");
        require(dispute.tier != DisputeTier.AutoCheck, "Auto-check tier");
        require(!dispute.auditorVotes[msg.sender], "Already voted");

        // Verify sender is selected auditor
        address[] memory selectedAuditors = auditorRegistry.getSelectedAuditors(disputeId);
        bool isAuditor = false;
        for (uint256 i = 0; i < selectedAuditors.length; i++) {
            if (selectedAuditors[i] == msg.sender) {
                isAuditor = true;
                dispute.auditors.push(msg.sender);
                break;
            }
        }
        require(isAuditor, "Not selected as auditor");

        dispute.auditorVotes[msg.sender] = true;

        if (challengerWins) {
            dispute.votesForChallenger++;
        } else {
            dispute.votesForVerifier++;
        }

        emit AuditorVoted(disputeId, msg.sender, challengerWins);

        // Check if voting is complete
        if (dispute.votesForChallenger + dispute.votesForVerifier == selectedAuditors.length) {
            _finalizeVoting(disputeId);
        }
    }

    /**
     * @notice Finalize voting and resolve or escalate
     */
    function _finalizeVoting(bytes32 disputeId) private {
        Dispute storage dispute = disputes[disputeId];

        bool challengerWon = dispute.votesForChallenger > dispute.votesForVerifier;

        _resolveDispute(disputeId, challengerWon);
    }

    /**
     * @notice Appeal a dispute to higher tier
     * @param disputeId Dispute identifier
     */
    function appealDispute(bytes32 disputeId) external payable nonReentrant {
        Dispute storage dispute = disputes[disputeId];
        require(dispute.status == DisputeStatus.Resolved, "Not resolved");
        require(
            msg.sender == dispute.challenger || msg.sender == dispute.verifier,
            "Not a party"
        );

        // Calculate required stake (doubles each tier)
        uint256 requiredStake = BASE_CHALLENGE_STAKE * (TIER_MULTIPLIER ** uint256(dispute.tier));
        require(msg.value >= requiredStake, "Insufficient appeal stake");

        // Reset dispute for new tier
        dispute.status = DisputeStatus.UnderReview;
        dispute.tier = DisputeTier.Appeal;
        dispute.challengerStake += msg.value;
        dispute.votesForChallenger = 0;
        dispute.votesForVerifier = 0;

        // Request larger auditor committee
        auditorRegistry.requestAuditorSelection(disputeId, TIER2_COMMITTEE_SIZE);

        emit DisputeEscalated(disputeId, DisputeTier.Appeal);
    }

    /**
     * @notice Resolve dispute
     * @param disputeId Dispute identifier
     * @param challengerWon Whether challenger won
     */
    function _resolveDispute(bytes32 disputeId, bool challengerWon) private {
        Dispute storage dispute = disputes[disputeId];
        dispute.status = DisputeStatus.Resolved;
        dispute.challengerWon = challengerWon;
        dispute.resolvedAt = block.timestamp;

        uint256 slashedAmount = 0;

        if (challengerWon) {
            // Slash verifier
            slashedAmount = stakingManager.slash(
                dispute.verifier,
                string(abi.encodePacked("Lost dispute: ", disputeId))
            );

            // Reward challenger (60% of slashed)
            uint256 challengerReward = (slashedAmount * CHALLENGER_REWARD_PERCENTAGE) / 100;
            stakingManager.distributeSlashedFunds(dispute.challenger, challengerReward);

            // Return challenger's stake
            payable(dispute.challenger).transfer(dispute.challengerStake);

            // Reward auditors (40% of slashed, split evenly)
            if (dispute.auditors.length > 0) {
                uint256 auditorPool = (slashedAmount * AUDITOR_REWARD_PERCENTAGE) / 100;
                uint256 perAuditorReward = auditorPool / dispute.auditors.length;

                for (uint256 i = 0; i < dispute.auditors.length; i++) {
                    address auditor = dispute.auditors[i];
                    stakingManager.distributeSlashedFunds(auditor, perAuditorReward);
                    auditorRegistry.recordEarnings(auditor, perAuditorReward);

                    // Update reputation based on vote
                    bool votedCorrectly = dispute.auditorVotes[auditor];
                    auditorRegistry.updateReputation(auditor, votedCorrectly);
                }
            }
        } else {
            // Verifier wins - slash challenger's stake
            // Transfer stake to verifier
            payable(dispute.verifier).transfer(dispute.challengerStake);

            // Update auditor reputations
            for (uint256 i = 0; i < dispute.auditors.length; i++) {
                address auditor = dispute.auditors[i];
                bool votedCorrectly = !dispute.auditorVotes[auditor];
                auditorRegistry.updateReputation(auditor, votedCorrectly);
            }
        }

        emit DisputeResolved(disputeId, challengerWon, slashedAmount);
    }

    /**
     * @notice Get dispute info
     * @param disputeId Dispute identifier
     */
    function getDispute(bytes32 disputeId) external view returns (
        bytes32 jobId,
        address challenger,
        address verifier,
        string memory reason,
        DisputeStatus status,
        DisputeTier tier,
        uint256 challengerStake,
        bool challengerWon
    ) {
        Dispute storage dispute = disputes[disputeId];
        return (
            dispute.jobId,
            dispute.challenger,
            dispute.verifier,
            dispute.reason,
            dispute.status,
            dispute.tier,
            dispute.challengerStake,
            dispute.challengerWon
        );
    }

    /**
     * @notice Get dispute votes
     * @param disputeId Dispute identifier
     */
    function getDisputeVotes(bytes32 disputeId) external view returns (
        uint256 votesForChallenger,
        uint256 votesForVerifier,
        address[] memory auditors
    ) {
        Dispute storage dispute = disputes[disputeId];
        return (
            dispute.votesForChallenger,
            dispute.votesForVerifier,
            dispute.auditors
        );
    }

    /**
     * @notice Get all disputes for a job
     * @param jobId Job identifier
     */
    function getJobDisputes(bytes32 jobId) external view returns (bytes32[] memory) {
        return jobDisputes[jobId];
    }
}
