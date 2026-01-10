// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IWETH.sol";
import "./libraries/VerifierTypes.sol";
import "./libraries/VerifierHash.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title VerificationMarketplace
 * @notice WETH-based marketplace for LLM verification with commit-reveal protocol
 * @dev Evaluators post WETH bonds, commit scores, reveal with evidence bundles,
 *      and earn rewards based on accuracy (proximity to median consensus)
 *
 * TODO: Migrate to canonical libraries for type consistency
 * - Replace Task struct with VerifierTypes.TaskMeta
 * - Replace Evaluation with VerifierTypes.CommitInfo + VerifierTypes.RevealBundle
 * - Use VerifierHash.commitHash() for canonical commitment computation
 * - Use bytes32 taskId (from VerifierHash.generateTaskId()) instead of uint256
 * - This will ensure consistency with DisputeLadder and BondVaultWETH
 */
contract VerifierMarketplace is Ownable, ReentrancyGuard {
    IWETH public immutable WETH;

    uint256 public evalBond;          // WETH posted by evaluator at commit
    uint256 public disputeBond;       // WETH posted to open dispute
    uint256 public protocolFeeBps = 500; // 5%

    enum TaskState { Open, Reveal, Finalized, Disputed, Resolved }

    struct Evaluation {
        bytes32 commitHash;
        bool committed;
        bool revealed;
        uint16 scoreBps;        // 0..10000
        bytes32 bundleHash;     // hash of bundle json/cbor
        string bundleURI;       // optional ipfs/arweave
    }

    struct Task {
        TaskState state;
        address requester;

        bytes32 promptHash;
        bytes32 rubricHash;

        uint40 commitDeadline;
        uint40 revealDeadline;
        uint40 disputeDeadline;

        uint8 minEvals;
        uint8 maxEvals;

        uint256 feePool; // WETH
        uint16 finalScoreBps;

        address[] evaluators;
        mapping(address => Evaluation) evals;
    }

    uint256 public nextTaskId = 1;
    mapping(uint256 => Task) private tasks;

    // ========================================================================
    // Reputation System
    // ========================================================================

    /// @notice Total evaluations completed by verifier
    mapping(address => uint256) public totalEvaluations;

    /// @notice Evaluations within 250bps of median (accurate)
    mapping(address => uint256) public accurateEvaluations;

    /// @notice Cumulative WETH rewards earned (excludes bond returns)
    mapping(address => uint256) public totalRewardsEarned;

    /// @notice Last activity timestamp for drift detection
    mapping(address => uint256) public lastActivityTimestamp;

    /// @notice Times this verifier's evaluation was disputed
    mapping(address => uint256) public disputesAgainst;

    /// @notice Times this verifier successfully defended against dispute
    mapping(address => uint256) public disputesWon;

    // ========================================================================
    // Events
    // ========================================================================

    event TaskCreated(uint256 indexed taskId, address indexed requester, uint256 feePool);
    event Committed(uint256 indexed taskId, address indexed evaluator, bytes32 commitHash);
    event Revealed(uint256 indexed taskId, address indexed evaluator, uint16 scoreBps, bytes32 bundleHash, string bundleURI);
    event Finalized(uint256 indexed taskId, uint16 finalScoreBps, uint256 feePool);
    event DisputeOpened(uint256 indexed taskId, address indexed challenger);
    event ReputationUpdated(
        address indexed verifier,
        uint256 totalEvals,
        uint256 accurateEvals,
        uint256 totalRewards,
        uint256 timestamp
    );

    constructor(IWETH _weth, uint256 _evalBond, uint256 _disputeBond) Ownable(msg.sender) {
        WETH = _weth;
        evalBond = _evalBond;
        disputeBond = _disputeBond;
    }

    function setBonds(uint256 _evalBond, uint256 _disputeBond) external onlyOwner {
        evalBond = _evalBond;
        disputeBond = _disputeBond;
    }

    function setProtocolFeeBps(uint256 bps) external onlyOwner {
        require(bps <= 2000, "too high");
        protocolFeeBps = bps;
    }

    function getTaskMeta(uint256 taskId)
        external
        view
        returns (
            TaskState state,
            address requester,
            bytes32 promptHash,
            bytes32 rubricHash,
            uint40 commitDeadline,
            uint40 revealDeadline,
            uint40 disputeDeadline,
            uint8 minEvals,
            uint8 maxEvals,
            uint256 feePool,
            uint16 finalScoreBps,
            uint256 evalCount
        )
    {
        Task storage t = tasks[taskId];
        return (
            t.state, t.requester, t.promptHash, t.rubricHash,
            t.commitDeadline, t.revealDeadline, t.disputeDeadline,
            t.minEvals, t.maxEvals, t.feePool, t.finalScoreBps, t.evaluators.length
        );
    }

    function createTask(
        bytes32 promptHash,
        bytes32 rubricHash,
        uint40 commitDeadline,
        uint40 revealDeadline,
        uint40 disputeWindowSeconds,
        uint8 minEvals,
        uint8 maxEvals,
        uint256 feePool
    ) external nonReentrant returns (uint256 taskId) {
        require(commitDeadline > block.timestamp, "bad commit deadline");
        require(revealDeadline > commitDeadline, "bad reveal deadline");
        require(minEvals > 0 && maxEvals >= minEvals && maxEvals <= 10, "bad eval bounds");
        require(feePool > 0, "feePool=0");

        WETH.transferFrom(msg.sender, address(this), feePool);

        taskId = nextTaskId++;
        Task storage t = tasks[taskId];
        t.state = TaskState.Open;
        t.requester = msg.sender;
        t.promptHash = promptHash;
        t.rubricHash = rubricHash;
        t.commitDeadline = commitDeadline;
        t.revealDeadline = revealDeadline;
        t.disputeDeadline = uint40(revealDeadline + disputeWindowSeconds);
        t.minEvals = minEvals;
        t.maxEvals = maxEvals;
        t.feePool = feePool;

        emit TaskCreated(taskId, msg.sender, feePool);
    }

    function commitEvaluation(uint256 taskId, bytes32 commitHash) external nonReentrant {
        Task storage t = tasks[taskId];
        require(t.state == TaskState.Open, "not open");
        require(block.timestamp <= t.commitDeadline, "commit ended");
        require(t.evaluators.length < t.maxEvals, "max evals");
        Evaluation storage e = t.evals[msg.sender];
        require(!e.committed, "already committed");

        // post evaluator bond
        WETH.transferFrom(msg.sender, address(this), evalBond);

        e.committed = true;
        e.commitHash = commitHash;
        t.evaluators.push(msg.sender);

        emit Committed(taskId, msg.sender, commitHash);

        // move to reveal early if full
        if (t.evaluators.length == t.maxEvals) {
            t.state = TaskState.Reveal;
        }
    }

    function openReveal(uint256 taskId) external {
        Task storage t = tasks[taskId];
        require(t.state == TaskState.Open, "bad state");
        require(block.timestamp > t.commitDeadline, "too early");
        t.state = TaskState.Reveal;
    }

    function revealEvaluation(
        uint256 taskId,
        uint16 scoreBps,
        bytes32 bundleHash,
        string calldata bundleURI,
        bytes32 salt
    ) external {
        Task storage t = tasks[taskId];
        require(t.state == TaskState.Reveal, "not reveal");
        require(block.timestamp <= t.revealDeadline, "reveal ended");
        require(scoreBps <= 10_000, "score>100%");
        Evaluation storage e = t.evals[msg.sender];
        require(e.committed, "no commit");
        require(!e.revealed, "already revealed");

        bytes32 expected = keccak256(abi.encodePacked(taskId, msg.sender, scoreBps, bundleHash, salt));
        require(expected == e.commitHash, "commit mismatch");

        e.revealed = true;
        e.scoreBps = scoreBps;
        e.bundleHash = bundleHash;
        e.bundleURI = bundleURI;

        emit Revealed(taskId, msg.sender, scoreBps, bundleHash, bundleURI);
    }

    function finalize(uint256 taskId) external nonReentrant {
        Task storage t = tasks[taskId];
        require(t.state == TaskState.Reveal, "bad state");
        require(block.timestamp > t.revealDeadline, "too early");

        // collect revealed scores
        uint256 n = t.evaluators.length;
        uint16[] memory scores = new uint16[](n);
        uint256 revealedCount = 0;

        for (uint256 i = 0; i < n; i++) {
            address ev = t.evaluators[i];
            if (t.evals[ev].revealed) {
                scores[revealedCount] = t.evals[ev].scoreBps;
                revealedCount++;
            }
        }
        require(revealedCount >= t.minEvals, "not enough reveals");

        // sort scores[0:revealedCount] (insertion sort; revealedCount <= 10)
        for (uint256 i = 1; i < revealedCount; i++) {
            uint16 key = scores[i];
            uint256 j = i;
            while (j > 0 && scores[j - 1] > key) {
                scores[j] = scores[j - 1];
                j--;
            }
            scores[j] = key;
        }

        uint16 median = scores[revealedCount / 2];
        t.finalScoreBps = median;
        t.state = TaskState.Finalized;

        // protocol fee
        uint256 fee = (t.feePool * protocolFeeBps) / 10_000;
        uint256 payoutPool = t.feePool - fee;
        if (fee > 0) WETH.transfer(owner(), fee);

        // pay evaluators: equal split among revealers + small "accuracy bonus"
        // bonus: within 250 bps of median gets +20% share weight
        uint256 baseWeight = 100;
        uint256 bonusWeight = 120;
        uint256 totalWeight = 0;

        uint256[] memory weights = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            address ev = t.evaluators[i];
            Evaluation storage e = t.evals[ev];
            if (!e.revealed) continue;

            uint256 w = baseWeight;
            uint256 diff = e.scoreBps > median ? (e.scoreBps - median) : (median - e.scoreBps);
            if (diff <= 250) w = bonusWeight;

            weights[i] = w;
            totalWeight += w;
        }

        for (uint256 i = 0; i < n; i++) {
            address ev = t.evaluators[i];
            Evaluation storage e = t.evals[ev];

            // return eval bond if committed (revealed or not)
            if (e.committed) {
                WETH.transfer(ev, evalBond);
            }

            // rewards only to revealers
            uint256 w = weights[i];
            if (w > 0) {
                uint256 amt = (payoutPool * w) / totalWeight;
                if (amt > 0) {
                    WETH.transfer(ev, amt);

                    // Track reputation: rewards earned
                    totalRewardsEarned[ev] += amt;
                }

                // Track reputation: evaluation completed
                totalEvaluations[ev]++;

                // Track reputation: accurate if within 250bps (bonusWeight = 120)
                if (w == bonusWeight) {
                    accurateEvaluations[ev]++;
                }

                // Update activity timestamp
                lastActivityTimestamp[ev] = block.timestamp;

                // Emit reputation update
                emit ReputationUpdated(
                    ev,
                    totalEvaluations[ev],
                    accurateEvaluations[ev],
                    totalRewardsEarned[ev],
                    block.timestamp
                );
            }
        }

        emit Finalized(taskId, median, t.feePool);
    }

    /// @dev Called by DisputeManager. Here for MVP wiring.
    function markDisputed(uint256 taskId) external onlyOwner {
        Task storage t = tasks[taskId];
        require(t.state == TaskState.Finalized, "not finalized");
        t.state = TaskState.Disputed;

        // Track disputes against all evaluators who revealed
        for (uint256 i = 0; i < t.evaluators.length; i++) {
            address ev = t.evaluators[i];
            if (t.evals[ev].revealed) {
                disputesAgainst[ev]++;
            }
        }
    }

    function markResolved(uint256 taskId, uint16 newFinalScoreBps) external onlyOwner {
        Task storage t = tasks[taskId];
        require(t.state == TaskState.Disputed, "not disputed");

        uint16 originalScore = t.finalScoreBps;
        t.finalScoreBps = newFinalScoreBps;
        t.state = TaskState.Resolved;

        // If score didn't change significantly, evaluators successfully defended
        uint16 diff = originalScore > newFinalScoreBps
            ? (originalScore - newFinalScoreBps)
            : (newFinalScoreBps - originalScore);

        // If change is < 500 bps (5%), consider it a successful defense
        if (diff < 500) {
            for (uint256 i = 0; i < t.evaluators.length; i++) {
                address ev = t.evaluators[i];
                if (t.evals[ev].revealed) {
                    disputesWon[ev]++;
                }
            }
        }
    }

    /// @dev Dispute bond escrowed in DisputeManager; emitted here for indexing convenience.
    function emitDisputeOpened(uint256 taskId, address challenger) external onlyOwner {
        emit DisputeOpened(taskId, challenger);
    }

    // ========================================================================
    // Reputation View Functions
    // ========================================================================

    /**
     * @notice Get comprehensive reputation metrics for verifier (dashboard helper)
     * @param verifier Address to query
     * @return totalEvals Total evaluations completed
     * @return accurateEvals Evaluations within 250bps of median
     * @return accuracyBps Accuracy percentage in basis points (0-10000)
     * @return totalRewards Cumulative WETH rewards earned
     * @return disputes Total disputes against this verifier
     * @return disputeWins Disputes successfully defended
     * @return disputeWinRate Win rate in basis points (0-10000)
     * @return lastActivity Timestamp of last evaluation
     * @return daysSinceActive Days since last activity (for drift detection)
     */
    function getVerifierReputation(address verifier) external view returns (
        uint256 totalEvals,
        uint256 accurateEvals,
        uint256 accuracyBps,
        uint256 totalRewards,
        uint256 disputes,
        uint256 disputeWins,
        uint256 disputeWinRate,
        uint256 lastActivity,
        uint256 daysSinceActive
    ) {
        totalEvals = totalEvaluations[verifier];
        accurateEvals = accurateEvaluations[verifier];
        totalRewards = totalRewardsEarned[verifier];
        disputes = disputesAgainst[verifier];
        disputeWins = disputesWon[verifier];
        lastActivity = lastActivityTimestamp[verifier];

        // Calculate accuracy percentage
        accuracyBps = totalEvals > 0 ? (accurateEvals * 10_000) / totalEvals : 0;

        // Calculate dispute win rate
        disputeWinRate = disputes > 0 ? (disputeWins * 10_000) / disputes : 0;

        // Calculate days since last activity
        if (lastActivity > 0) {
            daysSinceActive = (block.timestamp - lastActivity) / 1 days;
        } else {
            daysSinceActive = type(uint256).max; // Never active
        }
    }
}
