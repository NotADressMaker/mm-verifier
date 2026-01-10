// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./StakingManager.sol";
import "./DisputeResolver.sol";

/**
 * @title VerificationMarketplace
 * @notice Core marketplace for LLM verification jobs with commit-reveal
 * @dev Coordinates job submission, verifier commitments, reveals, and payouts
 */
contract VerificationMarketplace is Ownable, ReentrancyGuard {
    StakingManager public immutable stakingManager;
    DisputeResolver public disputeResolver;

    enum JobStatus {
        Open,
        CommitPhase,
        RevealPhase,
        Completed,
        Disputed,
        Cancelled
    }

    enum TaskType {
        FactualQA,
        MathProof,
        PolicyCompliance,
        CitationCheck,
        General
    }

    struct Job {
        bytes32 id;
        address requester;
        bytes32 promptHash;
        string[] models;
        TaskType taskType;
        uint256 rewardPool;
        uint256 deadline;
        uint256 commitDeadline;
        uint256 revealDeadline;
        JobStatus status;
        uint256 createdAt;
        address[] verifiers;
        bytes32 consensusResult;
        uint256 consensusScore;
    }

    struct Commitment {
        bytes32 commitHash;
        uint256 committedAt;
        bool revealed;
    }

    struct Evaluation {
        uint256 score; // 0-100
        string verdict; // "reliable", "mixed", "unreliable"
        bytes32 evidenceHash; // IPFS/Arweave hash
        uint256 revealedAt;
    }

    // Job storage
    mapping(bytes32 => Job) public jobs;
    bytes32[] public jobList;

    // Commitments: jobId => verifier => commitment
    mapping(bytes32 => mapping(address => Commitment)) public commitments;

    // Evaluations: jobId => verifier => evaluation
    mapping(bytes32 => mapping(address => Evaluation)) public evaluations;

    // Job phases timing
    uint256 public constant COMMIT_PHASE_DURATION = 1 hours;
    uint256 public constant REVEAL_PHASE_DURATION = 1 hours;
    uint256 public constant CHALLENGE_WINDOW = 24 hours;

    // Minimum reward pool
    uint256 public constant MIN_REWARD_POOL = 0.01 ether;

    // Verifier reward distribution
    uint256 public constant VERIFIER_REWARD_PERCENTAGE = 80;
    uint256 public constant PROTOCOL_FEE_PERCENTAGE = 20;

    // Protocol fee collector
    address public feeCollector;

    // Events
    event JobSubmitted(
        bytes32 indexed jobId,
        address indexed requester,
        bytes32 promptHash,
        uint256 rewardPool
    );
    event CommitmentSubmitted(bytes32 indexed jobId, address indexed verifier);
    event EvaluationRevealed(
        bytes32 indexed jobId,
        address indexed verifier,
        uint256 score,
        string verdict
    );
    event JobCompleted(bytes32 indexed jobId, uint256 consensusScore, bytes32 consensusResult);
    event JobCancelled(bytes32 indexed jobId);
    event RewardDistributed(bytes32 indexed jobId, address indexed verifier, uint256 amount);

    constructor(
        address _stakingManager,
        address _feeCollector
    ) Ownable(msg.sender) {
        stakingManager = StakingManager(_stakingManager);
        feeCollector = _feeCollector;
    }

    /**
     * @notice Set dispute resolver contract
     * @param _disputeResolver Dispute resolver address
     */
    function setDisputeResolver(address _disputeResolver) external onlyOwner {
        disputeResolver = DisputeResolver(_disputeResolver);
    }

    /**
     * @notice Submit verification job
     * @param promptHash Hash of the prompt
     * @param models Array of model names to query
     * @param taskType Type of verification task
     * @param deadline Job deadline timestamp
     * @return jobId Job identifier
     */
    function submitJob(
        bytes32 promptHash,
        string[] calldata models,
        TaskType taskType,
        uint256 deadline
    ) external payable nonReentrant returns (bytes32) {
        require(msg.value >= MIN_REWARD_POOL, "Insufficient reward pool");
        require(models.length > 0, "At least one model required");
        require(deadline > block.timestamp, "Deadline must be in future");

        bytes32 jobId = keccak256(
            abi.encodePacked(promptHash, msg.sender, block.timestamp)
        );

        uint256 commitDeadline = block.timestamp + COMMIT_PHASE_DURATION;
        uint256 revealDeadline = commitDeadline + REVEAL_PHASE_DURATION;

        jobs[jobId] = Job({
            id: jobId,
            requester: msg.sender,
            promptHash: promptHash,
            models: models,
            taskType: taskType,
            rewardPool: msg.value,
            deadline: deadline,
            commitDeadline: commitDeadline,
            revealDeadline: revealDeadline,
            status: JobStatus.CommitPhase,
            createdAt: block.timestamp,
            verifiers: new address[](0),
            consensusResult: bytes32(0),
            consensusScore: 0
        });

        jobList.push(jobId);

        emit JobSubmitted(jobId, msg.sender, promptHash, msg.value);

        return jobId;
    }

    /**
     * @notice Commit evaluation hash (commit phase)
     * @param jobId Job identifier
     * @param commitHash Hash of (jobId, verifier, salt, score, verdict, evidenceHash)
     */
    function commitEvaluation(bytes32 jobId, bytes32 commitHash) external nonReentrant {
        Job storage job = jobs[jobId];
        require(job.status == JobStatus.CommitPhase, "Not in commit phase");
        require(block.timestamp <= job.commitDeadline, "Commit phase ended");
        require(commitments[jobId][msg.sender].commitHash == bytes32(0), "Already committed");
        require(stakingManager.hasVerifierStake(msg.sender), "Insufficient stake");

        // Lock verifier stake
        stakingManager.lockStake(msg.sender, stakingManager.MIN_VERIFIER_STAKE(), jobId);

        commitments[jobId][msg.sender] = Commitment({
            commitHash: commitHash,
            committedAt: block.timestamp,
            revealed: false
        });

        job.verifiers.push(msg.sender);

        emit CommitmentSubmitted(jobId, msg.sender);
    }

    /**
     * @notice Reveal evaluation (reveal phase)
     * @param jobId Job identifier
     * @param score Score (0-100)
     * @param verdict Verdict string
     * @param evidenceHash Evidence bundle hash
     * @param salt Random salt used in commitment
     */
    function revealEvaluation(
        bytes32 jobId,
        uint256 score,
        string calldata verdict,
        bytes32 evidenceHash,
        bytes32 salt
    ) external nonReentrant {
        Job storage job = jobs[jobId];

        // Transition to reveal phase if needed
        if (job.status == JobStatus.CommitPhase && block.timestamp > job.commitDeadline) {
            job.status = JobStatus.RevealPhase;
        }

        require(job.status == JobStatus.RevealPhase, "Not in reveal phase");
        require(block.timestamp <= job.revealDeadline, "Reveal phase ended");

        Commitment storage commitment = commitments[jobId][msg.sender];
        require(commitment.commitHash != bytes32(0), "No commitment found");
        require(!commitment.revealed, "Already revealed");

        // Verify commitment
        bytes32 computedHash = keccak256(
            abi.encodePacked(jobId, msg.sender, salt, score, verdict, evidenceHash)
        );
        require(computedHash == commitment.commitHash, "Invalid reveal");

        require(score <= 100, "Score must be <= 100");

        evaluations[jobId][msg.sender] = Evaluation({
            score: score,
            verdict: verdict,
            evidenceHash: evidenceHash,
            revealedAt: block.timestamp
        });

        commitment.revealed = true;

        emit EvaluationRevealed(jobId, msg.sender, score, verdict);
    }

    /**
     * @notice Finalize job and compute consensus
     * @param jobId Job identifier
     */
    function finalizeJob(bytes32 jobId) external nonReentrant {
        Job storage job = jobs[jobId];

        require(job.status == JobStatus.RevealPhase, "Not in reveal phase");
        require(block.timestamp > job.revealDeadline, "Reveal phase not ended");

        // Compute consensus score (median of revealed scores)
        uint256[] memory scores = new uint256[](job.verifiers.length);
        uint256 validCount = 0;

        for (uint256 i = 0; i < job.verifiers.length; i++) {
            address verifier = job.verifiers[i];
            if (commitments[jobId][verifier].revealed) {
                scores[validCount] = evaluations[jobId][verifier].score;
                validCount++;
            }
        }

        require(validCount > 0, "No valid evaluations");

        // Sort scores for median calculation
        uint256[] memory validScores = new uint256[](validCount);
        for (uint256 i = 0; i < validCount; i++) {
            validScores[i] = scores[i];
        }
        _sortScores(validScores);

        uint256 consensusScore = validCount % 2 == 0
            ? (validScores[validCount / 2 - 1] + validScores[validCount / 2]) / 2
            : validScores[validCount / 2];

        job.consensusScore = consensusScore;
        job.consensusResult = keccak256(abi.encodePacked(consensusScore));
        job.status = JobStatus.Completed;

        emit JobCompleted(jobId, consensusScore, job.consensusResult);

        // Distribute rewards
        _distributeRewards(jobId, validCount);
    }

    /**
     * @notice Distribute rewards to honest verifiers
     */
    function _distributeRewards(bytes32 jobId, uint256 validVerifierCount) private {
        Job storage job = jobs[jobId];

        uint256 protocolFee = (job.rewardPool * PROTOCOL_FEE_PERCENTAGE) / 100;
        uint256 verifierPool = job.rewardPool - protocolFee;
        uint256 rewardPerVerifier = verifierPool / validVerifierCount;

        // Transfer protocol fee
        payable(feeCollector).transfer(protocolFee);

        // Distribute to verifiers who revealed
        for (uint256 i = 0; i < job.verifiers.length; i++) {
            address verifier = job.verifiers[i];

            if (commitments[jobId][verifier].revealed) {
                // Unlock stake
                stakingManager.unlockStake(verifier, stakingManager.MIN_VERIFIER_STAKE(), jobId);

                // Pay reward
                payable(verifier).transfer(rewardPerVerifier);

                emit RewardDistributed(jobId, verifier, rewardPerVerifier);
            } else {
                // Punish non-revealer by keeping stake locked temporarily
                // (Can be unlocked after a penalty period)
            }
        }
    }

    /**
     * @notice Sort scores array (bubble sort, ok for small arrays)
     */
    function _sortScores(uint256[] memory arr) private pure {
        uint256 n = arr.length;
        for (uint256 i = 0; i < n - 1; i++) {
            for (uint256 j = 0; j < n - i - 1; j++) {
                if (arr[j] > arr[j + 1]) {
                    (arr[j], arr[j + 1]) = (arr[j + 1], arr[j]);
                }
            }
        }
    }

    /**
     * @notice Cancel job if no commitments received
     * @param jobId Job identifier
     */
    function cancelJob(bytes32 jobId) external nonReentrant {
        Job storage job = jobs[jobId];
        require(msg.sender == job.requester, "Not requester");
        require(job.status == JobStatus.CommitPhase, "Cannot cancel");
        require(job.verifiers.length == 0, "Verifiers already committed");

        job.status = JobStatus.Cancelled;

        // Refund requester
        payable(job.requester).transfer(job.rewardPool);

        emit JobCancelled(jobId);
    }

    /**
     * @notice Get job details
     * @param jobId Job identifier
     */
    function getJob(bytes32 jobId) external view returns (
        address requester,
        bytes32 promptHash,
        string[] memory models,
        TaskType taskType,
        uint256 rewardPool,
        JobStatus status,
        uint256 consensusScore
    ) {
        Job storage job = jobs[jobId];
        return (
            job.requester,
            job.promptHash,
            job.models,
            job.taskType,
            job.rewardPool,
            job.status,
            job.consensusScore
        );
    }

    /**
     * @notice Get job verifiers
     * @param jobId Job identifier
     */
    function getJobVerifiers(bytes32 jobId) external view returns (address[] memory) {
        return jobs[jobId].verifiers;
    }

    /**
     * @notice Get verifier evaluation
     * @param jobId Job identifier
     * @param verifier Verifier address
     */
    function getEvaluation(bytes32 jobId, address verifier) external view returns (
        uint256 score,
        string memory verdict,
        bytes32 evidenceHash,
        bool revealed
    ) {
        Evaluation memory eval = evaluations[jobId][verifier];
        Commitment memory commit = commitments[jobId][verifier];
        return (
            eval.score,
            eval.verdict,
            eval.evidenceHash,
            commit.revealed
        );
    }

    /**
     * @notice Get all jobs
     */
    function getAllJobs() external view returns (bytes32[] memory) {
        return jobList;
    }

    /**
     * @notice Get job count
     */
    function getJobCount() external view returns (uint256) {
        return jobList.length;
    }
}
