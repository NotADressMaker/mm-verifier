// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ModelRegistry
 * @notice On-chain marketplace for AI models used in the MAMV verification network.
 *
 * Operators stake ETH to list a model. Every verified job outcome feeds an
 * exponential moving average (EMA) reputation score for the model. Consumers
 * discover models via domain tags and sort by reputation. Reputation decay and
 * listing-stake slashing enforce long-term accountability.
 *
 * Reputation EMA:
 *   newScore = (EMA_ALPHA * incomingScore + (1000 - EMA_ALPHA) * currentScore) / 1000
 *   EMA_ALPHA = 100  →  10 % weight on each new data point.
 *
 * Fee tier:
 *   Operators declare a feeBps (0–1000, i.e. 0–10 %) charged against the task
 *   value whenever their model is selected for a verification job.  The
 *   marketplace is responsible for collecting and routing this fee.
 *
 * Slashing:
 *   If a model's reputation falls below SLASH_THRESHOLD_BPS and it has
 *   accumulated MIN_JOBS_BEFORE_SLASH jobs, the oracle may call
 *   slashListingStake(), burning the penalty and leaving a reduced stake.
 */
contract ModelRegistry is Ownable, ReentrancyGuard {

    // ── Constants ───────────────────────────────────────────────────────────

    uint256 public constant EMA_ALPHA        = 100;   // out of 1000 → 10 %
    uint256 public constant INITIAL_SCORE    = 5_000; // 50 % in bps
    uint256 public constant SLASH_THRESHOLD  = 2_000; // 20 % in bps
    uint32  public constant MIN_JOBS_BEFORE_SLASH = 10;

    // ── State ────────────────────────────────────────────────────────────────

    uint256 public minListingStake;  // minimum ETH to list a model
    uint256 public slashPenaltyBps;  // fraction of stake burned on bad reputation

    address public oracle;           // authorised to push outcomes

    struct ModelListing {
        string  name;            // human-readable identifier ("gpt-4o", "claude-3-5")
        bytes32 modelHash;       // keccak256 of provider:model string
        string  provider;        // "openai" | "anthropic" | "google" | …
        string  version;
        string[] domainTags;     // ["factual-qa","math","coding", …]
        uint16  feeBps;          // operator's take on each job (max 1000)
        uint256 listingStake;    // ETH locked while listed
        address operator;        // EOA / contract that controls this listing
        uint64  reputationScore; // 0–10000 bps, EMA updated by oracle
        uint32  totalJobs;
        uint32  accurateJobs;
        uint64  listedAt;
        bool    active;
    }

    // modelHash → listing
    mapping(bytes32 => ModelListing) private listings;
    // all modelHashes, for enumeration
    bytes32[] public modelHashes;
    // domain tag → modelHashes
    mapping(bytes32 => bytes32[]) private domainIndex; // keccak(tag) → hashes

    // ── Events ───────────────────────────────────────────────────────────────

    event ModelListed(
        bytes32 indexed modelHash,
        string name,
        string provider,
        address indexed operator,
        uint256 stake,
        uint16 feeBps
    );
    event ModelDelisted(bytes32 indexed modelHash, address indexed operator, uint256 stakeReturned);
    event ReputationUpdated(
        bytes32 indexed modelHash,
        uint64  newScore,
        uint32  totalJobs,
        bool    accurate
    );
    event ListingStakeSlashed(bytes32 indexed modelHash, uint256 amount);
    event OracleSet(address indexed oracle);
    event MinStakeSet(uint256 minStake);
    event SlashPenaltySet(uint256 bps);

    // ── Constructor ──────────────────────────────────────────────────────────

    constructor(
        uint256 _minListingStake,
        uint256 _slashPenaltyBps,
        address _oracle
    ) Ownable(msg.sender) {
        require(_slashPenaltyBps <= 10_000, "bps > 100%");
        minListingStake = _minListingStake;
        slashPenaltyBps = _slashPenaltyBps;
        oracle = _oracle;
    }

    modifier onlyOracle() {
        require(msg.sender == oracle, "not oracle");
        _;
    }

    // ── Listing lifecycle ────────────────────────────────────────────────────

    /**
     * @notice List a model in the marketplace.
     * @param name        Human-readable model name.
     * @param provider    Provider string ("openai", "anthropic", …).
     * @param version     Semantic version string.
     * @param domainTags  Capability tags (max 8).
     * @param feeBps      Fee charged per verification job (max 1000 = 10 %).
     */
    function listModel(
        string calldata name,
        string calldata provider,
        string calldata version,
        string[] calldata domainTags,
        uint16 feeBps
    ) external payable nonReentrant {
        require(msg.value >= minListingStake,  "insufficient stake");
        require(feeBps <= 1_000,               "feeBps > 10%");
        require(bytes(name).length > 0,        "name required");
        require(domainTags.length <= 8,        "max 8 tags");

        bytes32 modelHash = keccak256(abi.encodePacked(provider, ":", name, ":", version));
        require(!listings[modelHash].active,   "already listed");

        string[] memory tags = new string[](domainTags.length);
        for (uint256 i = 0; i < domainTags.length; i++) {
            tags[i] = domainTags[i];
            domainIndex[keccak256(bytes(domainTags[i]))].push(modelHash);
        }

        listings[modelHash] = ModelListing({
            name:            name,
            modelHash:       modelHash,
            provider:        provider,
            version:         version,
            domainTags:      tags,
            feeBps:          feeBps,
            listingStake:    msg.value,
            operator:        msg.sender,
            reputationScore: uint64(INITIAL_SCORE),
            totalJobs:       0,
            accurateJobs:    0,
            listedAt:        uint64(block.timestamp),
            active:          true
        });
        modelHashes.push(modelHash);

        emit ModelListed(modelHash, name, provider, msg.sender, msg.value, feeBps);
    }

    /**
     * @notice Remove a model listing and return stake to operator.
     * @dev    Only the operator may delist their own model.
     */
    function delistModel(bytes32 modelHash) external nonReentrant {
        ModelListing storage listing = listings[modelHash];
        require(listing.active,                  "not listed");
        require(listing.operator == msg.sender,  "not operator");

        listing.active = false;
        uint256 stake = listing.listingStake;
        listing.listingStake = 0;

        (bool ok, ) = msg.sender.call{value: stake}("");
        require(ok, "transfer failed");

        emit ModelDelisted(modelHash, msg.sender, stake);
    }

    // ── Oracle interface ─────────────────────────────────────────────────────

    /**
     * @notice Record a job outcome and update the model's EMA reputation score.
     * @param modelHash  keccak256(provider:name:version).
     * @param scoreBps   0–10000 score for this job.
     * @param accurate   True when the model's response was in consensus.
     */
    function recordOutcome(
        bytes32 modelHash,
        uint64  scoreBps,
        bool    accurate
    ) external onlyOracle {
        ModelListing storage listing = listings[modelHash];
        require(listing.active, "model not listed");
        require(scoreBps <= 10_000, "score out of range");

        // EMA update
        uint64 current = listing.reputationScore;
        uint64 updated = uint64(
            (EMA_ALPHA * uint256(scoreBps) + (1_000 - EMA_ALPHA) * uint256(current)) / 1_000
        );
        listing.reputationScore = updated;
        listing.totalJobs += 1;
        if (accurate) listing.accurateJobs += 1;

        emit ReputationUpdated(modelHash, updated, listing.totalJobs, accurate);
    }

    /**
     * @notice Slash the listing stake of a poorly-performing model.
     * @dev    Only callable by oracle after the model has MIN_JOBS_BEFORE_SLASH
     *         completed and reputation is below SLASH_THRESHOLD.  Penalty is
     *         burned (sent to address(0)) to create a credible punishment.
     */
    function slashListingStake(bytes32 modelHash) external onlyOracle nonReentrant {
        ModelListing storage listing = listings[modelHash];
        require(listing.active,                                "not listed");
        require(listing.reputationScore <= SLASH_THRESHOLD,   "rep too high to slash");
        require(listing.totalJobs >= MIN_JOBS_BEFORE_SLASH,   "insufficient history");

        uint256 penalty = (listing.listingStake * slashPenaltyBps) / 10_000;
        listing.listingStake -= penalty;

        // Burn the penalty
        (bool ok, ) = address(0).call{value: penalty}("");
        // Burning may fail on some chains; ignore return value intentionally.
        (ok);

        emit ListingStakeSlashed(modelHash, penalty);
    }

    // ── Discovery ────────────────────────────────────────────────────────────

    /**
     * @notice Return the top-k active model hashes for a domain, sorted by
     *         reputation score (highest first).  Callers should use this for
     *         job routing rather than querying all listings individually.
     */
    function getTopModelsByDomain(
        string calldata domain,
        uint256 k
    ) external view returns (bytes32[] memory top) {
        bytes32 tag = keccak256(bytes(domain));
        bytes32[] storage candidates = domainIndex[tag];
        uint256 n = candidates.length;

        // Collect active listings
        bytes32[] memory active = new bytes32[](n);
        uint64[]  memory scores = new uint64[](n);
        uint256   count = 0;
        for (uint256 i = 0; i < n; i++) {
            ModelListing storage l = listings[candidates[i]];
            if (l.active) {
                active[count] = candidates[i];
                scores[count] = l.reputationScore;
                count++;
            }
        }

        // Insertion sort (expected small n)
        for (uint256 i = 1; i < count; i++) {
            bytes32 keyH = active[i];
            uint64  keyS = scores[i];
            int256 j = int256(i) - 1;
            while (j >= 0 && scores[uint256(j)] < keyS) {
                active[uint256(j + 1)] = active[uint256(j)];
                scores[uint256(j + 1)] = scores[uint256(j)];
                j--;
            }
            active[uint256(j + 1)] = keyH;
            scores[uint256(j + 1)] = keyS;
        }

        uint256 take = k < count ? k : count;
        top = new bytes32[](take);
        for (uint256 i = 0; i < take; i++) {
            top[i] = active[i];
        }
    }

    /**
     * @notice Get all active models for a domain (unordered).
     */
    function getModelsByDomain(string calldata domain)
        external view returns (bytes32[] memory)
    {
        bytes32 tag = keccak256(bytes(domain));
        bytes32[] storage candidates = domainIndex[tag];
        uint256 active;
        for (uint256 i = 0; i < candidates.length; i++) {
            if (listings[candidates[i]].active) active++;
        }
        bytes32[] memory result = new bytes32[](active);
        uint256 idx;
        for (uint256 i = 0; i < candidates.length; i++) {
            if (listings[candidates[i]].active) result[idx++] = candidates[i];
        }
        return result;
    }

    // ── View helpers ─────────────────────────────────────────────────────────

    function getListing(bytes32 modelHash)
        external view
        returns (ModelListing memory)
    {
        return listings[modelHash];
    }

    function reputationOf(bytes32 modelHash) external view returns (uint64) {
        return listings[modelHash].reputationScore;
    }

    function isListed(bytes32 modelHash) external view returns (bool) {
        return listings[modelHash].active;
    }

    function totalModels() external view returns (uint256) {
        return modelHashes.length;
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    function setOracle(address _oracle) external onlyOwner {
        oracle = _oracle;
        emit OracleSet(_oracle);
    }

    function setMinListingStake(uint256 _min) external onlyOwner {
        minListingStake = _min;
        emit MinStakeSet(_min);
    }

    function setSlashPenaltyBps(uint256 _bps) external onlyOwner {
        require(_bps <= 10_000, "bps > 100%");
        slashPenaltyBps = _bps;
        emit SlashPenaltySet(_bps);
    }
}
