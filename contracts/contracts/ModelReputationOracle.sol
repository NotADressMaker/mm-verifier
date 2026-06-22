// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ModelReputationOracle
 * @notice Receives finalised job outcomes from VerificationMarketplace and
 *         forwards them to ModelRegistry.  Acts as the single authorised
 *         caller for ModelRegistry.recordOutcome() and
 *         ModelRegistry.slashListingStake().
 *
 * Flow:
 *   1. VerificationMarketplace calls recordJobOutcome() after a successful reveal.
 *   2. Oracle converts the per-verifier scoreBps into a model-level score and
 *      pushes it to ModelRegistry for each model used in the job.
 *   3. If a model's reputation after the update is below SLASH_THRESHOLD and it
 *      has enough job history, the oracle triggers a stake slash automatically.
 *
 * The oracle is intentionally thin — it does no scoring logic of its own.
 * Scoring lives in the verifier node; the oracle merely relays the result
 * on-chain so reputation is tamper-evident and auditable.
 */
interface IModelRegistry {
    function recordOutcome(bytes32 modelHash, uint64 scoreBps, bool accurate) external;
    function slashListingStake(bytes32 modelHash) external;
    function reputationOf(bytes32 modelHash) external view returns (uint64);
    function isListed(bytes32 modelHash) external view returns (bool);

    // Thresholds exposed so oracle can read them without hard-coding
    function SLASH_THRESHOLD() external pure returns (uint256);
    function MIN_JOBS_BEFORE_SLASH() external pure returns (uint32);
}

contract ModelReputationOracle is Ownable {

    IModelRegistry public registry;

    // Addresses permitted to push outcomes (verifier nodes / marketplace)
    mapping(address => bool) public authorised;

    // Threshold below which a model may be auto-slashed (bps, 0-10000)
    uint64 public autoSlashThreshold = 1_500; // 15 %

    event OutcomeRecorded(
        bytes32 indexed jobId,
        bytes32 indexed modelHash,
        uint64  scoreBps,
        bool    accurate
    );
    event AutoSlashTriggered(bytes32 indexed modelHash, uint64 reputationAfter);
    event AuthorisedSet(address indexed caller, bool allowed);
    event RegistrySet(address indexed registry);

    modifier onlyAuthorised() {
        require(authorised[msg.sender], "not authorised");
        _;
    }

    constructor(address _registry) Ownable(msg.sender) {
        registry = IModelRegistry(_registry);
        authorised[msg.sender] = true;
    }

    /**
     * @notice Record the outcome of a single model within a verified job.
     * @param jobId      Off-chain job identifier (keccak256 of jobId string).
     * @param modelHash  keccak256(provider:name:version) — matches ModelRegistry.
     * @param scoreBps   0–10000 score produced by the verifier node for this model.
     * @param accurate   True when the model was within consensus (not an outlier).
     */
    function recordJobOutcome(
        bytes32 jobId,
        bytes32 modelHash,
        uint64  scoreBps,
        bool    accurate
    ) external onlyAuthorised {
        require(scoreBps <= 10_000, "score out of range");

        if (!registry.isListed(modelHash)) {
            // Model not listed — skip silently so unregistered models don't break jobs
            return;
        }

        registry.recordOutcome(modelHash, scoreBps, accurate);
        emit OutcomeRecorded(jobId, modelHash, scoreBps, accurate);

        // Auto-slash check: if reputation has fallen below threshold, trigger slash
        uint64 rep = registry.reputationOf(modelHash);
        if (rep <= autoSlashThreshold) {
            // slashListingStake enforces its own MIN_JOBS guard — will revert if
            // not enough history, which is fine; we catch and ignore.
            try registry.slashListingStake(modelHash) {
                emit AutoSlashTriggered(modelHash, rep);
            } catch {
                // Insufficient history or already slashed — no action needed
            }
        }
    }

    /**
     * @notice Batch version for multi-model jobs — saves callers from multiple txs.
     * @param jobId       Off-chain job identifier.
     * @param modelHashes Array of model hashes involved in the job.
     * @param scores      Parallel array of per-model scoreBps.
     * @param accurate    Parallel array of consensus flags.
     */
    function recordBatchOutcomes(
        bytes32          jobId,
        bytes32[] calldata modelHashes,
        uint64[]  calldata scores,
        bool[]    calldata accurate
    ) external onlyAuthorised {
        uint256 n = modelHashes.length;
        require(n == scores.length && n == accurate.length, "array length mismatch");

        for (uint256 i = 0; i < n; i++) {
            if (!registry.isListed(modelHashes[i])) continue;

            registry.recordOutcome(modelHashes[i], scores[i], accurate[i]);
            emit OutcomeRecorded(jobId, modelHashes[i], scores[i], accurate[i]);

            uint64 rep = registry.reputationOf(modelHashes[i]);
            if (rep <= autoSlashThreshold) {
                try registry.slashListingStake(modelHashes[i]) {
                    emit AutoSlashTriggered(modelHashes[i], rep);
                } catch {}
            }
        }
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    function setAuthorised(address caller, bool allowed) external onlyOwner {
        authorised[caller] = allowed;
        emit AuthorisedSet(caller, allowed);
    }

    function setRegistry(address _registry) external onlyOwner {
        registry = IModelRegistry(_registry);
        emit RegistrySet(_registry);
    }

    function setAutoSlashThreshold(uint64 _threshold) external onlyOwner {
        require(_threshold <= 10_000, "threshold > 100%");
        autoSlashThreshold = _threshold;
    }
}
