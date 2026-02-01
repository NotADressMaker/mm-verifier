// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./StakingManager.sol";
import "./AuditorRegistryV2.sol";

/**
 * @title DisputeResolverV2
 * @notice Enhanced dispute resolution with commit/reveal voting and bundle availability checks
 * @dev Key improvements:
 *  - Auditor commit/reveal voting (prevents copy-voting)
 *  - Slash evaluators far from final consensus
 *  - Bundle availability enforcement (IPFS CID + pinning proof)
 *  - Challenger rewards from slashed pool
 */
contract DisputeResolverV2 is Ownable, ReentrancyGuard {
    StakingManager public immutable stakingManager;
    AuditorRegistryV2 public immutable auditorRegistry;

    enum DisputeStatus {
        Pending,
        CommitPhase,
        RevealPhase,
        Resolved,
        Escalated
    }

    enum DisputeTier {
        AutoCheck,      // Tier 0: Bundle availability check
        AuditorReview,  // Tier 1: Auditor committee
        Appeal          // Tier 2+: Appeals
    }

    struct AuditorVote {
        bytes32 commitHash;
        bool revealed;
        bool challengerWins; // true = challenger wins, false = verifier wins
        uint256 committedAt;
    }

    struct Dispute {
        bytes32 jobId;
        address challenger;
        address verifier;
        string reason;
        bytes32 challengerEvidenceHash;
        string verifierEvidenceCID; // IPFS CID
        bool bundleAvailable;
        DisputeStatus status;
        DisputeTier tier;
        uint256 challengerStake;
        uint256 createdAt;
        uint256 commitDeadline;
        uint256 revealDeadline;
        uint256 resolvedAt;
        bool challengerWon;
        address[] auditors;
        mapping(address => AuditorVote) auditorVotes;
        uint256 votesForChallenger;
        uint256 votesForVerifier;
    }

    // Dispute ID => Dispute
    mapping(bytes32 => Dispute) public disputes;

    // Job ID => Dispute IDs
    mapping(bytes32 => bytes32[]) public jobDisputes;

    // Verifier => Job => Score (for consensus deviation slashing)
    mapping(address => mapping(bytes32 => uint256)) public verifierScores;

    // Challenge stake requirements
    uint256 public constant BASE_CHALLENGE_STAKE = 0.01 ether;
    uint256 public constant TIER_MULTIPLIER = 2;

    // Committee sizes
    uint256 public constant TIER1_COMMITTEE_SIZE = 3;
    uint256 public constant TIER2_COMMITTEE_SIZE = 5;

    // Voting periods
    uint256 public constant COMMIT_PERIOD = 1 days;
    uint256 public constant REVEAL_PERIOD = 1 days;
    uint256 public constant BUNDLE_CHECK_PERIOD = 1 hours;

    // Slashing parameters
    uint256 public constant CHALLENGER_REWARD_PERCENTAGE = 60;
    uint256 public constant AUDITOR_REWARD_PERCENTAGE = 40;
    uint256 public constant CONSENSUS_DEVIATION_THRESHOLD = 20; // 20% deviation triggers slash

    // Events
    event DisputeCreated(bytes32 indexed disputeId, bytes32 indexed jobId, address challenger, address verifier);
    event BundleAvailabilityChecked(bytes32 indexed disputeId, bool available, string cid);
    event DisputeEscalated(bytes32 indexed disputeId, DisputeTier newTier);
    event AuditorCommitted(bytes32 indexed disputeId, address indexed auditor);
    event AuditorRevealed(bytes32 indexed disputeId, address indexed auditor, bool challengerWins);
    event DisputeResolved(bytes32 indexed disputeId, bool challengerWon, uint256 slashedAmount);
    event ConsensusDeviationSlash(address indexed verifier, bytes32 indexed jobId, uint256 deviation, uint256 slashedAmount);

    constructor(
        address _stakingManager,
        address _auditorRegistry
    ) Ownable(msg.sender) {
        stakingManager = StakingManager(_stakingManager);
        auditorRegistry = AuditorRegistryV2(_auditorRegistry);
    }

    /**
     * @notice Create dispute with bundle availability challenge
     * @param jobId Job identifier
     * @param verifier Address of verifier being challenged
     * @param reason Reason for dispute
     * @param evidenceHash Challenger's evidence hash
     * @param verifierEvidenceCID IPFS CID of verifier's bundle
     */
    function createDispute(
        bytes32 jobId,
        address verifier,
        string calldata reason,
        bytes32 evidenceHash,
        string calldata verifierEvidenceCID
    ) external payable nonReentrant returns (bytes32) {
        require(msg.value >= BASE_CHALLENGE_STAKE, "Insufficient stake");
        require(verifier != address(0), "Invalid verifier");
        require(bytes(reason).length > 0, "Reason required");
        require(bytes(verifierEvidenceCID).length > 0, "Evidence CID required");

        bytes32 disputeId = keccak256(
            abi.encodePacked(jobId, msg.sender, verifier, block.timestamp)
        );

        Dispute storage dispute = disputes[disputeId];
        dispute.jobId = jobId;
        dispute.challenger = msg.sender;
        dispute.verifier = verifier;
        dispute.reason = reason;
        dispute.challengerEvidenceHash = evidenceHash;
        dispute.verifierEvidenceCID = verifierEvidenceCID;
        dispute.status = DisputeStatus.Pending;
        dispute.tier = DisputeTier.AutoCheck;
        dispute.challengerStake = msg.value;
        dispute.createdAt = block.timestamp;

        jobDisputes[jobId].push(disputeId);

        emit DisputeCreated(disputeId, jobId, msg.sender, verifier);

        return disputeId;
    }

    /**
     * @notice Tier 0: Check bundle availability on IPFS
     * @param disputeId Dispute identifier
     * @param bundleAvailable Whether bundle is retrievable from IPFS
     * @param bundleHash Hash of retrieved bundle
     */
    function checkBundleAvailability(
        bytes32 disputeId,
        bool bundleAvailable,
        bytes32 bundleHash
    ) external onlyOwner {
        Dispute storage dispute = disputes[disputeId];
        require(dispute.status == DisputeStatus.Pending, "Invalid status");
        require(dispute.tier == DisputeTier.AutoCheck, "Not in auto-check");

        dispute.bundleAvailable = bundleAvailable;

        emit BundleAvailabilityChecked(
            disputeId,
            bundleAvailable,
            dispute.verifierEvidenceCID
        );

        if (!bundleAvailable) {
            // Bundle missing or invalid - challenger wins immediately
            // Slash verifier for missing bundle
            _resolveDispute(disputeId, true, "Missing or invalid evidence bundle");
        } else if (bundleHash != dispute.challengerEvidenceHash) {
            // Bundle exists but content hash mismatch
            _escalateToAuditorReview(disputeId);
        } else {
            // Bundle valid and matches - verifier wins
            _resolveDispute(disputeId, false, "Evidence bundle verified");
        }
    }

    /**
     * @notice Escalate to Tier 1: Auditor review with commit/reveal voting
     */
    function _escalateToAuditorReview(bytes32 disputeId) private {
        Dispute storage dispute = disputes[disputeId];
        dispute.tier = DisputeTier.AuditorReview;
        dispute.status = DisputeStatus.CommitPhase;
        dispute.commitDeadline = block.timestamp + COMMIT_PERIOD;
        dispute.revealDeadline = dispute.commitDeadline + REVEAL_PERIOD;

        // Request VRF auditor selection
        auditorRegistry.requestAuditorSelection(disputeId, TIER1_COMMITTEE_SIZE);

        emit DisputeEscalated(disputeId, DisputeTier.AuditorReview);
    }

    /**
     * @notice Auditor commits vote (commit phase)
     * @param disputeId Dispute identifier
     * @param commitHash Hash of (disputeId, auditor, vote, salt)
     */
    function commitAuditorVote(bytes32 disputeId, bytes32 commitHash) external {
        Dispute storage dispute = disputes[disputeId];
        require(dispute.status == DisputeStatus.CommitPhase, "Not in commit phase");
        require(block.timestamp <= dispute.commitDeadline, "Commit period ended");
        require(!dispute.auditorVotes[msg.sender].revealed, "Already committed");

        // Verify sender is selected auditor
        require(_isSelectedAuditor(disputeId, msg.sender), "Not selected auditor");

        dispute.auditorVotes[msg.sender] = AuditorVote({
            commitHash: commitHash,
            revealed: false,
            challengerWins: false,
            committedAt: block.timestamp
        });

        emit AuditorCommitted(disputeId, msg.sender);
    }

    /**
     * @notice Auditor reveals vote (reveal phase)
     * @param disputeId Dispute identifier
     * @param challengerWins Vote outcome
     * @param salt Random salt used in commitment
     */
    function revealAuditorVote(
        bytes32 disputeId,
        bool challengerWins,
        bytes32 salt
    ) external {
        Dispute storage dispute = disputes[disputeId];

        // Transition to reveal phase if needed
        if (dispute.status == DisputeStatus.CommitPhase && block.timestamp > dispute.commitDeadline) {
            dispute.status = DisputeStatus.RevealPhase;
        }

        require(dispute.status == DisputeStatus.RevealPhase, "Not in reveal phase");
        require(block.timestamp <= dispute.revealDeadline, "Reveal period ended");

        AuditorVote storage vote = dispute.auditorVotes[msg.sender];
        require(vote.commitHash != bytes32(0), "No commitment found");
        require(!vote.revealed, "Already revealed");

        // Verify commitment
        bytes32 computedHash = keccak256(
            abi.encodePacked(disputeId, msg.sender, challengerWins, salt)
        );
        require(computedHash == vote.commitHash, "Invalid reveal");

        // Record vote
        vote.revealed = true;
        vote.challengerWins = challengerWins;

        if (challengerWins) {
            dispute.votesForChallenger++;
        } else {
            dispute.votesForVerifier++;
        }

        if (dispute.auditors.length == 0 || dispute.auditors[dispute.auditors.length - 1] != msg.sender) {
            dispute.auditors.push(msg.sender);
        }

        emit AuditorRevealed(disputeId, msg.sender, challengerWins);

        // Check if all auditors have revealed
        address[] memory selectedAuditors = auditorRegistry.getSelectedAuditors(disputeId);
        if (dispute.votesForChallenger + dispute.votesForVerifier == selectedAuditors.length) {
            _finalizeVoting(disputeId);
        }
    }

    /**
     * @notice Finalize voting after reveal phase
     */
    function _finalizeVoting(bytes32 disputeId) private {
        Dispute storage dispute = disputes[disputeId];
        bool challengerWon = dispute.votesForChallenger > dispute.votesForVerifier;
        _resolveDispute(disputeId, challengerWon, "Auditor vote");
    }

    /**
     * @notice Force finalize if reveal deadline passed
     * @param disputeId Dispute identifier
     */
    function forceFinalizeVoting(bytes32 disputeId) external {
        Dispute storage dispute = disputes[disputeId];
        require(dispute.status == DisputeStatus.RevealPhase, "Not in reveal phase");
        require(block.timestamp > dispute.revealDeadline, "Reveal period not ended");

        // Slash non-revealing auditors
        address[] memory selectedAuditors = auditorRegistry.getSelectedAuditors(disputeId);
        for (uint256 i = 0; i < selectedAuditors.length; i++) {
            if (!dispute.auditorVotes[selectedAuditors[i]].revealed) {
                // Penalize non-revealing auditor
                auditorRegistry.updateReputation(selectedAuditors[i], false);
            }
        }

        _finalizeVoting(disputeId);
    }

    /**
     * @notice Resolve dispute and distribute rewards/slashing
     */
    function _resolveDispute(
        bytes32 disputeId,
        bool challengerWon,
        string memory resolution
    ) private {
        Dispute storage dispute = disputes[disputeId];
        dispute.status = DisputeStatus.Resolved;
        dispute.challengerWon = challengerWon;
        dispute.resolvedAt = block.timestamp;

        uint256 slashedAmount = 0;

        if (challengerWon) {
            // Slash verifier
            slashedAmount = stakingManager.slash(
                dispute.verifier,
                string(abi.encodePacked("Lost dispute: ", resolution))
            );

            // Reward challenger (60% of slashed)
            uint256 challengerReward = (slashedAmount * CHALLENGER_REWARD_PERCENTAGE) / 100;
            stakingManager.distributeSlashedFunds(dispute.challenger, challengerReward);

            // Return challenger's stake
            payable(dispute.challenger).transfer(dispute.challengerStake);

            // Reward auditors who voted correctly (40% of slashed, split evenly)
            uint256 correctAuditorCount = 0;
            for (uint256 i = 0; i < dispute.auditors.length; i++) {
                if (dispute.auditorVotes[dispute.auditors[i]].revealed &&
                    dispute.auditorVotes[dispute.auditors[i]].challengerWins) {
                    correctAuditorCount++;
                }
            }

            if (correctAuditorCount > 0) {
                uint256 auditorPool = (slashedAmount * AUDITOR_REWARD_PERCENTAGE) / 100;
                uint256 perAuditorReward = auditorPool / correctAuditorCount;

                for (uint256 i = 0; i < dispute.auditors.length; i++) {
                    address auditor = dispute.auditors[i];
                    AuditorVote memory vote = dispute.auditorVotes[auditor];

                    if (vote.revealed) {
                        bool votedCorrectly = vote.challengerWins;
                        if (votedCorrectly) {
                            stakingManager.distributeSlashedFunds(auditor, perAuditorReward);
                            auditorRegistry.recordEarnings(auditor, perAuditorReward);
                        }
                        auditorRegistry.updateReputation(auditor, votedCorrectly);
                    }
                }
            }
        } else {
            // Verifier wins - challenger loses stake
            payable(dispute.verifier).transfer(dispute.challengerStake);

            // Update auditor reputations
            for (uint256 i = 0; i < dispute.auditors.length; i++) {
                address auditor = dispute.auditors[i];
                AuditorVote memory vote = dispute.auditorVotes[auditor];

                if (vote.revealed) {
                    bool votedCorrectly = !vote.challengerWins;
                    auditorRegistry.updateReputation(auditor, votedCorrectly);
                }
            }
        }

        emit DisputeResolved(disputeId, challengerWon, slashedAmount);
    }

    /**
     * @notice Slash verifiers who deviate significantly from consensus
     * @param jobId Job identifier
     * @param consensusScore Final consensus score
     * @param verifiers Array of verifier addresses
     * @param scores Array of corresponding verifier scores
     */
    function slashConsensusDeviators(
        bytes32 jobId,
        uint256 consensusScore,
        address[] calldata verifiers,
        uint256[] calldata scores
    ) external onlyOwner {
        require(verifiers.length == scores.length, "Length mismatch");

        for (uint256 i = 0; i < verifiers.length; i++) {
            address verifier = verifiers[i];
            uint256 score = scores[i];

            // Calculate deviation
            uint256 deviation = score > consensusScore
                ? score - consensusScore
                : consensusScore - score;

            uint256 deviationPercentage = (deviation * 100) / 100; // Out of 100

            // Slash if deviation exceeds threshold
            if (deviationPercentage >= CONSENSUS_DEVIATION_THRESHOLD) {
                uint256 slashedAmount = stakingManager.slash(
                    verifier,
                    string(abi.encodePacked(
                        "Consensus deviation: ",
                        uint2str(deviationPercentage),
                        "% on job ",
                        bytes32ToString(jobId)
                    ))
                );

                emit ConsensusDeviationSlash(
                    verifier,
                    jobId,
                    deviationPercentage,
                    slashedAmount
                );
            }

            // Store score for future reference
            verifierScores[verifier][jobId] = score;
        }
    }

    /**
     * @notice Appeal to higher tier
     */
    function appealDispute(bytes32 disputeId) external payable nonReentrant {
        Dispute storage dispute = disputes[disputeId];
        require(dispute.status == DisputeStatus.Resolved, "Not resolved");
        require(
            msg.sender == dispute.challenger || msg.sender == dispute.verifier,
            "Not a party"
        );

        uint256 requiredStake = BASE_CHALLENGE_STAKE * (TIER_MULTIPLIER ** uint256(dispute.tier));
        require(msg.value >= requiredStake, "Insufficient appeal stake");

        dispute.status = DisputeStatus.CommitPhase;
        dispute.tier = DisputeTier.Appeal;
        dispute.challengerStake += msg.value;
        dispute.votesForChallenger = 0;
        dispute.votesForVerifier = 0;
        dispute.commitDeadline = block.timestamp + COMMIT_PERIOD;
        dispute.revealDeadline = dispute.commitDeadline + REVEAL_PERIOD;

        auditorRegistry.requestAuditorSelection(disputeId, TIER2_COMMITTEE_SIZE);

        emit DisputeEscalated(disputeId, DisputeTier.Appeal);
    }

    /**
     * @notice Check if address is selected auditor for dispute
     */
    function _isSelectedAuditor(bytes32 disputeId, address auditor) private view returns (bool) {
        address[] memory selectedAuditors = auditorRegistry.getSelectedAuditors(disputeId);
        for (uint256 i = 0; i < selectedAuditors.length; i++) {
            if (selectedAuditors[i] == auditor) {
                return true;
            }
        }
        return false;
    }

    /**
     * @notice Get dispute info
     */
    function getDispute(bytes32 disputeId) external view returns (
        bytes32 jobId,
        address challenger,
        address verifier,
        DisputeStatus status,
        DisputeTier tier,
        bool challengerWon,
        bool bundleAvailable
    ) {
        Dispute storage dispute = disputes[disputeId];
        return (
            dispute.jobId,
            dispute.challenger,
            dispute.verifier,
            dispute.status,
            dispute.tier,
            dispute.challengerWon,
            dispute.bundleAvailable
        );
    }

    /**
     * @notice Get auditor vote commitment
     */
    function getAuditorVote(bytes32 disputeId, address auditor)
        external
        view
        returns (bytes32 commitHash, bool revealed, bool challengerWins)
    {
        AuditorVote memory vote = disputes[disputeId].auditorVotes[auditor];
        return (vote.commitHash, vote.revealed, vote.challengerWins);
    }

    // Helper functions
    function uint2str(uint256 _i) internal pure returns (string memory) {
        if (_i == 0) return "0";
        uint256 j = _i;
        uint256 len;
        while (j != 0) {
            len++;
            j /= 10;
        }
        bytes memory bstr = new bytes(len);
        uint256 k = len;
        while (_i != 0) {
            k = k - 1;
            uint8 temp = (48 + uint8(_i - _i / 10 * 10));
            bytes1 b1 = bytes1(temp);
            bstr[k] = b1;
            _i /= 10;
        }
        return string(bstr);
    }

    function bytes32ToString(bytes32 _bytes32) internal pure returns (string memory) {
        bytes memory bytesArray = new bytes(64);
        for (uint256 i = 0; i < 32; i++) {
            uint8 _f = uint8(_bytes32[i] >> 4);
            uint8 _l = uint8(_bytes32[i] & 0x0f);
            bytesArray[i * 2] = bytes1(_f < 10 ? _f + 48 : _f + 87);
            bytesArray[i * 2 + 1] = bytes1(_l < 10 ? _l + 48 : _l + 87);
        }
        return string(bytesArray);
    }
}
