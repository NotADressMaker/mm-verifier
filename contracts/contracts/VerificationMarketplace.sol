// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IWETH.sol";
import "./libraries/VerifierTypes.sol";
import "./libraries/VerifierHash.sol";
import "./interfaces/IVerifierMining.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title VerifierMarketplace
 * @notice WETH-based marketplace for LLM verification with commit-reveal protocol
 * @dev Evaluators post WETH bonds, commit scores, reveal with evidence bundles,
 *      and earn rewards based on accuracy (proximity to median consensus)
 *
 * Task Lifecycle:
 *   OPEN -> REVEALING -> PROVISIONAL -> (DISPUTED ->) FINAL
 *
 * Escrow Model:
 *   - Bonds held until dispute deadline passes (or dispute settles)
 *   - Non-revealers slashed and marked ineligible for payouts
 *   - Payouts released via releaseEscrow() or settleAfterDispute()
 */
contract VerifierMarketplace is Ownable, ReentrancyGuard {
    IWETH public immutable WETH;

    uint256 public evalBond;          // WETH posted by evaluator at commit
    uint256 public disputeBond;       // WETH posted to open dispute
    uint256 public protocolFeeBps = 500; // 5%
    uint256 public nonRevealSlashBps = 10_000; // 100%

    address public miningContract;
    address public disputeResolver;

    enum TaskState { Open, Revealing, Provisional, Disputed, Final }

    struct Evaluation {
        bytes32 commitHash;
        bool committed;
        bool revealed;
        bool slashed;           // true if slashed for non-reveal
        uint16 scoreBps;        // 0..10000
        bytes32 bundleHash;     // hash of bundle json/cbor
        string bundleURI;       // optional ipfs/arweave
    }

    struct EscrowEntry {
        uint256 bondAmount;     // bond held in escrow (0 if slashed or released)
        uint256 payoutAmount;   // calculated payout (0 if not eligible)
        bool eligible;          // eligible for payout (revealed and not penalized)
        bool released;          // true if funds have been released
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
        uint256 payoutPool;
        uint256 totalSlashed;

        address[] evaluators;
        mapping(address => Evaluation) evals;
        mapping(address => EscrowEntry) escrow;
    }

    uint256 public nextTaskId = 1;
    mapping(uint256 => Task) private tasks;

    // ========================================================================
    // Reputation System
    // ========================================================================

    mapping(address => uint256) public totalEvaluations;
    mapping(address => uint256) public accurateEvaluations;
    mapping(address => uint256) public totalRewardsEarned;
    mapping(address => uint256) public lastActivityTimestamp;
    mapping(address => uint256) public disputesAgainst;
    mapping(address => uint256) public disputesWon;

    // ========================================================================
    // Events
    // ========================================================================

    event TaskCreated(uint256 indexed taskId, address indexed requester, uint256 feePool);
    event Committed(uint256 indexed taskId, address indexed evaluator, bytes32 commitHash);
    event Revealed(uint256 indexed taskId, address indexed evaluator, uint16 scoreBps, bytes32 bundleHash, string bundleURI);

    // Lifecycle events
    event ProvisionalFinalized(uint256 indexed taskId, uint16 medianScoreBps, uint256 payoutPool, uint40 disputeDeadline);
    event EscrowFunded(uint256 indexed taskId, address indexed evaluator, uint256 bondAmount, uint256 payoutAmount);
    event EscrowReleased(uint256 indexed taskId, address indexed evaluator, uint256 totalAmount);
    event TaskFinal(uint256 indexed taskId, uint16 finalScoreBps, uint256 totalPaid, bool wasDisputed);

    // Slashing and dispute events
    event NonRevealSlashed(uint256 indexed taskId, address indexed evaluator, uint256 slashedAmount);
    event DisputeOpened(uint256 indexed taskId, address indexed challenger);
    event DisputeSettled(uint256 indexed taskId, uint16 finalScoreBps, uint256 penalizedCount);
    event DisputeResolverSet(address indexed resolver);

    event MiningContractSet(address indexed miningContract);
    event ReputationUpdated(
        address indexed verifier,
        uint256 totalEvals,
        uint256 accurateEvals,
        uint256 totalRewards,
        uint256 timestamp
    );

    // Legacy events for compatibility
    event Finalized(uint256 indexed taskId, uint16 finalScoreBps, uint256 feePool);
    event TaskResolved(uint256 indexed taskId, uint16 finalScoreBps, uint256 payoutPool, bool disputed);

    constructor(IWETH _weth, uint256 _evalBond, uint256 _disputeBond) Ownable(msg.sender) {
        WETH = _weth;
        evalBond = _evalBond;
        disputeBond = _disputeBond;
    }

    // ========================================================================
    // Admin Functions
    // ========================================================================

    function setBonds(uint256 _evalBond, uint256 _disputeBond) external onlyOwner {
        evalBond = _evalBond;
        disputeBond = _disputeBond;
    }

    function setProtocolFeeBps(uint256 bps) external onlyOwner {
        require(bps <= 2000, "too high");
        protocolFeeBps = bps;
    }

    function setNonRevealSlashBps(uint256 bps) external onlyOwner {
        require(bps <= 10_000, "too high");
        nonRevealSlashBps = bps;
    }

    function setMiningContract(address _miningContract) external onlyOwner {
        miningContract = _miningContract;
        emit MiningContractSet(_miningContract);
    }

    function setDisputeResolver(address _resolver) external onlyOwner {
        disputeResolver = _resolver;
        emit DisputeResolverSet(_resolver);
    }

    // ========================================================================
    // View Functions
    // ========================================================================

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

    function getEscrowInfo(uint256 taskId, address evaluator)
        external
        view
        returns (
            uint256 bondAmount,
            uint256 payoutAmount,
            bool eligible,
            bool released
        )
    {
        EscrowEntry storage e = tasks[taskId].escrow[evaluator];
        return (e.bondAmount, e.payoutAmount, e.eligible, e.released);
    }

    function getEvaluation(uint256 taskId, address evaluator)
        external
        view
        returns (
            bytes32 commitHash,
            bool committed,
            bool revealed,
            bool slashed,
            uint16 scoreBps,
            bytes32 bundleHash,
            string memory bundleURI
        )
    {
        Evaluation storage e = tasks[taskId].evals[evaluator];
        return (e.commitHash, e.committed, e.revealed, e.slashed, e.scoreBps, e.bundleHash, e.bundleURI);
    }

    // ========================================================================
    // Task Creation
    // ========================================================================

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

    // ========================================================================
    // Commit Phase
    // ========================================================================

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
            t.state = TaskState.Revealing;
        }
    }

    function openReveal(uint256 taskId) external {
        Task storage t = tasks[taskId];
        require(t.state == TaskState.Open, "bad state");
        require(block.timestamp > t.commitDeadline, "too early");
        t.state = TaskState.Revealing;
    }

    // ========================================================================
    // Reveal Phase
    // ========================================================================

    function revealEvaluation(
        uint256 taskId,
        uint16 scoreBps,
        bytes32 bundleHash,
        string calldata bundleURI,
        bytes32 salt
    ) external {
        Task storage t = tasks[taskId];
        require(t.state == TaskState.Revealing, "not revealing");
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

    // ========================================================================
    // Finalize (Provisional) - Computes outcome, slashes non-revealers, holds escrow
    // ========================================================================

    function finalize(uint256 taskId) external nonReentrant {
        Task storage t = tasks[taskId];
        require(t.state == TaskState.Revealing, "bad state");
        require(block.timestamp > t.revealDeadline, "too early");

        uint256 n = t.evaluators.length;
        uint16[] memory scores = new uint16[](n);
        uint256 revealedCount = 0;

        // Slash non-revealers first
        uint256 totalSlashed = 0;
        uint256 slashAmount = (evalBond * nonRevealSlashBps) / 10_000;

        for (uint256 i = 0; i < n; i++) {
            address ev = t.evaluators[i];
            Evaluation storage e = t.evals[ev];

            if (e.committed && !e.revealed) {
                // Slash non-revealer: no bond refund, no payout
                e.slashed = true;
                totalSlashed += slashAmount;

                // Store escrow entry with zero bond (slashed) and zero payout
                t.escrow[ev] = EscrowEntry({
                    bondAmount: 0,
                    payoutAmount: 0,
                    eligible: false,
                    released: false
                });

                emit NonRevealSlashed(taskId, ev, slashAmount);
            } else if (e.revealed) {
                scores[revealedCount] = e.scoreBps;
                revealedCount++;
            }
        }

        require(revealedCount >= t.minEvals, "not enough reveals");

        // Sort scores[0:revealedCount] (insertion sort; revealedCount <= 10)
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

        // Protocol fee
        uint256 fee = (t.feePool * protocolFeeBps) / 10_000;
        uint256 payoutPool = t.feePool - fee;
        if (fee > 0) WETH.transfer(owner(), fee);
        t.payoutPool = payoutPool;
        t.totalSlashed = totalSlashed;

        // Transfer slashed funds to protocol
        if (totalSlashed > 0) {
            WETH.transfer(owner(), totalSlashed);
        }

        // Calculate payouts and setup escrow for revealed evaluators
        _calculatePayouts(taskId, median);

        t.state = TaskState.Provisional;

        emit ProvisionalFinalized(taskId, median, payoutPool, t.disputeDeadline);
        emit Finalized(taskId, median, t.feePool); // Legacy event
    }

    function _calculatePayouts(uint256 taskId, uint16 finalScore) internal {
        Task storage t = tasks[taskId];
        uint256 n = t.evaluators.length;

        // Calculate weights: base 100, bonus 120 if within 250 bps
        uint256 baseWeight = 100;
        uint256 bonusWeight = 120;
        uint256 totalWeight = 0;

        uint256[] memory weights = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            address ev = t.evaluators[i];
            Evaluation storage e = t.evals[ev];
            if (!e.revealed) continue;

            uint256 w = baseWeight;
            uint256 diff = e.scoreBps > finalScore
                ? (e.scoreBps - finalScore)
                : (finalScore - e.scoreBps);
            if (diff <= 250) w = bonusWeight;

            weights[i] = w;
            totalWeight += w;
        }

        // Assign payouts and escrow entries
        for (uint256 i = 0; i < n; i++) {
            address ev = t.evaluators[i];
            Evaluation storage e = t.evals[ev];

            if (!e.revealed || e.slashed) continue;

            uint256 w = weights[i];
            uint256 payout = (t.payoutPool * w) / totalWeight;

            t.escrow[ev] = EscrowEntry({
                bondAmount: evalBond,
                payoutAmount: payout,
                eligible: true,
                released: false
            });

            emit EscrowFunded(taskId, ev, evalBond, payout);
        }
    }

    // ========================================================================
    // Release Escrow (after dispute window, if not disputed)
    // ========================================================================

    function releaseEscrow(uint256 taskId) external nonReentrant {
        Task storage t = tasks[taskId];
        require(t.state == TaskState.Provisional, "not provisional");
        require(block.timestamp > t.disputeDeadline, "dispute window open");

        t.state = TaskState.Final;
        uint256 totalPaid = _releaseAllEscrow(taskId, t.finalScoreBps);

        emit TaskFinal(taskId, t.finalScoreBps, totalPaid, false);
        emit TaskResolved(taskId, t.finalScoreBps, t.payoutPool, false); // Legacy
    }

    function _releaseAllEscrow(uint256 taskId, uint16 finalScore) internal returns (uint256 totalPaid) {
        Task storage t = tasks[taskId];
        uint256 n = t.evaluators.length;

        for (uint256 i = 0; i < n; i++) {
            address ev = t.evaluators[i];
            EscrowEntry storage esc = t.escrow[ev];
            Evaluation storage e = t.evals[ev];

            if (esc.released) continue;
            esc.released = true;

            uint256 amount = 0;
            if (esc.eligible) {
                amount = esc.bondAmount + esc.payoutAmount;
                totalPaid += esc.payoutAmount;

                // Update reputation
                totalEvaluations[ev]++;
                totalRewardsEarned[ev] += esc.payoutAmount;
                lastActivityTimestamp[ev] = block.timestamp;

                // Check accuracy for reputation
                uint256 diff = e.scoreBps > finalScore
                    ? (e.scoreBps - finalScore)
                    : (finalScore - e.scoreBps);
                if (diff <= 250) {
                    accurateEvaluations[ev]++;
                }

                // Notify mining contract
                if (miningContract != address(0)) {
                    IVerifierMining(miningContract).recordEvaluation(ev, diff <= 250);
                }

                emit ReputationUpdated(
                    ev,
                    totalEvaluations[ev],
                    accurateEvaluations[ev],
                    totalRewardsEarned[ev],
                    block.timestamp
                );
            }

            if (amount > 0) {
                WETH.transfer(ev, amount);
                emit EscrowReleased(taskId, ev, amount);
            }
        }
    }

    // ========================================================================
    // Dispute Functions
    // ========================================================================

    /**
     * @notice Mark a task as disputed (callable by owner or dispute resolver)
     * @param taskId The task to mark as disputed
     */
    function markDisputed(uint256 taskId) external {
        require(msg.sender == owner() || msg.sender == disputeResolver, "not authorized");
        Task storage t = tasks[taskId];
        require(t.state == TaskState.Provisional, "not provisional");
        require(block.timestamp <= t.disputeDeadline, "dispute window closed");

        t.state = TaskState.Disputed;

        // Track disputes against all evaluators who revealed
        for (uint256 i = 0; i < t.evaluators.length; i++) {
            address ev = t.evaluators[i];
            if (t.evals[ev].revealed) {
                disputesAgainst[ev]++;
            }
        }
    }

    /**
     * @notice Settle task after dispute resolution
     * @dev Can be called by disputeResolver or owner (for MVP)
     * @param taskId The task ID
     * @param finalScoreBps The final score from dispute resolution
     * @param penalizedVerifiers Verifiers who should not receive payouts
     */
    function settleAfterDispute(
        uint256 taskId,
        uint16 finalScoreBps,
        address[] calldata penalizedVerifiers
    ) external nonReentrant {
        require(
            msg.sender == disputeResolver || msg.sender == owner(),
            "not authorized"
        );

        Task storage t = tasks[taskId];
        require(
            t.state == TaskState.Disputed || t.state == TaskState.Provisional,
            "invalid state"
        );

        uint16 originalScore = t.finalScoreBps;
        t.finalScoreBps = finalScoreBps;

        // Mark penalized verifiers as ineligible
        for (uint256 i = 0; i < penalizedVerifiers.length; i++) {
            address penalized = penalizedVerifiers[i];
            EscrowEntry storage esc = t.escrow[penalized];
            if (esc.eligible && !esc.released) {
                esc.eligible = false;
                // Bond goes to protocol when penalized
                if (esc.bondAmount > 0) {
                    WETH.transfer(owner(), esc.bondAmount);
                    esc.bondAmount = 0;
                }
                esc.payoutAmount = 0;
            }
        }

        // Recalculate payouts for remaining eligible verifiers
        _recalculatePayouts(taskId, finalScoreBps);

        // If score didn't change significantly, evaluators defended successfully
        uint16 diff = originalScore > finalScoreBps
            ? (originalScore - finalScoreBps)
            : (finalScoreBps - originalScore);

        if (diff < 500) {
            for (uint256 i = 0; i < t.evaluators.length; i++) {
                address ev = t.evaluators[i];
                if (t.evals[ev].revealed && t.escrow[ev].eligible) {
                    disputesWon[ev]++;
                }
            }
        }

        t.state = TaskState.Final;
        uint256 totalPaid = _releaseAllEscrow(taskId, finalScoreBps);

        emit DisputeSettled(taskId, finalScoreBps, penalizedVerifiers.length);
        emit TaskFinal(taskId, finalScoreBps, totalPaid, true);
        emit TaskResolved(taskId, finalScoreBps, t.payoutPool, true); // Legacy
    }

    function _recalculatePayouts(uint256 taskId, uint16 finalScore) internal {
        Task storage t = tasks[taskId];
        uint256 n = t.evaluators.length;

        // Calculate weights for eligible verifiers only
        uint256 baseWeight = 100;
        uint256 bonusWeight = 120;
        uint256 totalWeight = 0;

        uint256[] memory weights = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            address ev = t.evaluators[i];
            EscrowEntry storage esc = t.escrow[ev];
            Evaluation storage e = t.evals[ev];

            if (!esc.eligible || esc.released) continue;

            uint256 w = baseWeight;
            uint256 diff = e.scoreBps > finalScore
                ? (e.scoreBps - finalScore)
                : (finalScore - e.scoreBps);
            if (diff <= 250) w = bonusWeight;

            weights[i] = w;
            totalWeight += w;
        }

        // Reassign payouts
        if (totalWeight > 0) {
            for (uint256 i = 0; i < n; i++) {
                address ev = t.evaluators[i];
                EscrowEntry storage esc = t.escrow[ev];

                if (!esc.eligible || esc.released) continue;

                uint256 w = weights[i];
                esc.payoutAmount = (t.payoutPool * w) / totalWeight;
            }
        }
    }

    /**
     * @notice Legacy function - now calls releaseEscrow
     */
    function finalizeUndisputed(uint256 taskId) external nonReentrant {
        this.releaseEscrow(taskId);
    }

    /**
     * @notice Legacy function for dispute resolution
     */
    function markResolved(uint256 taskId, uint16 newFinalScoreBps) external {
        require(msg.sender == owner() || msg.sender == disputeResolver, "not authorized");
        address[] memory empty = new address[](0);
        this.settleAfterDispute(taskId, newFinalScoreBps, empty);
    }

    /**
     * @notice Emit dispute opened event (called by dispute manager)
     */
    function emitDisputeOpened(uint256 taskId, address challenger) external {
        require(msg.sender == owner() || msg.sender == disputeResolver, "not authorized");
        emit DisputeOpened(taskId, challenger);
    }

    // ========================================================================
    // Reputation View Functions
    // ========================================================================

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

        accuracyBps = totalEvals > 0 ? (accurateEvals * 10_000) / totalEvals : 0;
        disputeWinRate = disputes > 0 ? (disputeWins * 10_000) / disputes : 0;

        if (lastActivity > 0) {
            daysSinceActive = (block.timestamp - lastActivity) / 1 days;
        } else {
            daysSinceActive = type(uint256).max;
        }
    }
}
