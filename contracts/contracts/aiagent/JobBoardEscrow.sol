// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title JobBoardEscrow
 * @notice Standalone on-chain job board with escrowed payouts released by validator responses.
 * @dev Jobs commit to off-chain specs via jobHash + milestone hashes. Payments held in escrow.
 *      This version does NOT depend on external ERC-8004 registries.
 */
contract JobBoardEscrow is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Job {
        address owner;
        string jobURI;
        bytes32 jobHash;
        address paymentToken; // address(0) for ETH
        uint256 budgetAmount;
        uint256 deadline;
        uint256 awardedAt;
        address agent; // Direct agent address (no external registry)
        uint256 milestoneCount;
        uint16 passThreshold;
        uint256 totalReleased;
        bool milestonesAdded;
        bool closed;
        bool disputeOpen;
        uint16 disputePayoutBps;
        uint256 disputeOpenedAt;
        string disputeURI;
        bytes32 disputeHash;
    }

    struct Milestone {
        string uri;
        bytes32 hash;
        uint16 weightBps;
        bool released;
    }

    struct Proof {
        string uri;
        bytes32 hash;
        address submitter;
        uint256 submittedAt;
    }

    struct ValidationResponse {
        uint8 score;
        string responseURI;
        bytes32 responseHash;
        string tag;
        bool exists;
    }

    struct ValidationRequestMeta {
        uint256 jobId;
        uint256 milestoneIndex;
        address validator;
        bool exists;
    }

    uint256 public nextJobId = 1;
    uint256 public disputeWindowSeconds = 7 days;
    uint16 public defaultPassThreshold = 70;

    mapping(uint256 => Job) public jobs;
    mapping(uint256 => mapping(uint256 => Milestone)) public milestones;
    mapping(uint256 => mapping(uint256 => Proof)) public proofs;
    mapping(bytes32 => ValidationRequestMeta) public validationRequests;
    mapping(bytes32 => ValidationResponse) public validationResponses;

    event JobPosted(
        uint256 indexed jobId,
        address indexed owner,
        string jobURI,
        bytes32 jobHash,
        address paymentToken,
        uint256 budgetAmount,
        uint256 deadline,
        uint256 milestoneCount,
        uint16 passThreshold
    );
    event MilestonesAdded(uint256 indexed jobId, uint256 milestoneCount);
    event JobAwarded(uint256 indexed jobId, address indexed agent, uint256 awardedAt);
    event ProofSubmitted(
        uint256 indexed jobId,
        uint256 indexed milestoneIndex,
        string proofURI,
        bytes32 proofHash,
        address submitter
    );
    event ValidationRequested(
        uint256 indexed jobId,
        uint256 indexed milestoneIndex,
        address indexed validator,
        bytes32 requestHash,
        string requestURI
    );
    event ValidationSubmitted(
        bytes32 indexed requestHash,
        uint8 score,
        string responseURI,
        bytes32 responseHash,
        string tag
    );
    event JobFinalized(
        uint256 indexed jobId,
        uint256 indexed milestoneIndex,
        bytes32 requestHash,
        uint8 score,
        uint256 payoutAmount,
        address payoutAddress
    );
    event DisputeOpened(
        uint256 indexed jobId,
        uint16 proposedPayoutBps,
        string disputeURI,
        bytes32 disputeHash
    );
    event DisputeAccepted(
        uint256 indexed jobId,
        uint256 agentPayout,
        uint256 ownerRefund
    );
    event RemainderReclaimed(uint256 indexed jobId, uint256 amount);

    constructor() Ownable(msg.sender) {}

    function setDisputeWindowSeconds(uint256 newWindow) external onlyOwner {
        require(newWindow > 0, "Invalid window");
        disputeWindowSeconds = newWindow;
    }

    function setDefaultPassThreshold(uint16 newThreshold) external onlyOwner {
        require(newThreshold <= 100, "Invalid threshold");
        defaultPassThreshold = newThreshold;
    }

    function postJob(
        string calldata jobURI,
        bytes32 jobHash,
        address paymentToken,
        uint256 budgetAmount,
        uint256 deadline,
        uint256 milestoneCount,
        uint16 passThreshold
    ) external payable nonReentrant returns (uint256 jobId) {
        require(bytes(jobURI).length > 0, "Job URI required");
        require(jobHash != bytes32(0), "Job hash required");
        require(budgetAmount > 0, "Budget required");
        require(deadline > block.timestamp, "Invalid deadline");
        require(passThreshold <= 100, "Invalid threshold");

        if (paymentToken == address(0)) {
            require(msg.value == budgetAmount, "Incorrect ETH amount");
        } else {
            require(msg.value == 0, "ETH not accepted");
            IERC20(paymentToken).safeTransferFrom(msg.sender, address(this), budgetAmount);
        }

        jobId = nextJobId++;

        jobs[jobId] = Job({
            owner: msg.sender,
            jobURI: jobURI,
            jobHash: jobHash,
            paymentToken: paymentToken,
            budgetAmount: budgetAmount,
            deadline: deadline,
            awardedAt: 0,
            agent: address(0),
            milestoneCount: milestoneCount,
            passThreshold: passThreshold == 0 ? defaultPassThreshold : passThreshold,
            totalReleased: 0,
            milestonesAdded: milestoneCount == 0,
            closed: false,
            disputeOpen: false,
            disputePayoutBps: 0,
            disputeOpenedAt: 0,
            disputeURI: "",
            disputeHash: bytes32(0)
        });

        emit JobPosted(
            jobId,
            msg.sender,
            jobURI,
            jobHash,
            paymentToken,
            budgetAmount,
            deadline,
            milestoneCount,
            jobs[jobId].passThreshold
        );
    }

    function addMilestones(
        uint256 jobId,
        string[] calldata milestoneURIs,
        bytes32[] calldata milestoneHashes,
        uint16[] calldata weightBps
    ) external {
        Job storage job = jobs[jobId];
        require(job.owner == msg.sender, "Not job owner");
        require(!job.milestonesAdded, "Milestones already set");
        require(
            milestoneURIs.length == job.milestoneCount &&
                milestoneHashes.length == job.milestoneCount &&
                weightBps.length == job.milestoneCount,
            "Milestone length mismatch"
        );

        uint256 totalWeight;
        for (uint256 i = 0; i < job.milestoneCount; i++) {
            require(bytes(milestoneURIs[i]).length > 0, "Milestone URI required");
            require(milestoneHashes[i] != bytes32(0), "Milestone hash required");
            require(weightBps[i] > 0, "Milestone weight required");
            milestones[jobId][i] = Milestone({
                uri: milestoneURIs[i],
                hash: milestoneHashes[i],
                weightBps: weightBps[i],
                released: false
            });
            totalWeight += weightBps[i];
        }

        require(totalWeight == 10000, "Weights must sum to 10000");

        job.milestonesAdded = true;
        emit MilestonesAdded(jobId, job.milestoneCount);
    }

    /**
     * @notice Award job to an agent address (no external registry lookup)
     * @param jobId The job to award
     * @param agent The agent address to receive payouts
     */
    function award(uint256 jobId, address agent) external {
        Job storage job = jobs[jobId];
        require(job.owner == msg.sender, "Not job owner");
        require(job.awardedAt == 0, "Already awarded");
        require(job.milestonesAdded, "Milestones required");
        require(agent != address(0), "Agent required");

        job.agent = agent;
        job.awardedAt = block.timestamp;

        emit JobAwarded(jobId, agent, job.awardedAt);
    }

    function submitProof(
        uint256 jobId,
        uint256 milestoneIndex,
        string calldata proofURI,
        bytes32 proofHash
    ) external {
        Job storage job = jobs[jobId];
        require(job.agent != address(0), "Job not awarded");
        require(msg.sender == job.agent, "Not agent");
        require(milestoneIndex <= job.milestoneCount, "Invalid milestone index");
        require(bytes(proofURI).length > 0, "Proof URI required");
        require(proofHash != bytes32(0), "Proof hash required");

        proofs[jobId][milestoneIndex] = Proof({
            uri: proofURI,
            hash: proofHash,
            submitter: msg.sender,
            submittedAt: block.timestamp
        });

        emit ProofSubmitted(jobId, milestoneIndex, proofURI, proofHash, msg.sender);
    }

    /**
     * @notice Job owner requests validation from a validator
     * @dev Stores the request metadata; validator must call submitValidation to respond
     */
    function requestValidation(
        uint256 jobId,
        address validator,
        uint256 milestoneIndex,
        string calldata requestURI,
        bytes32 requestHash
    ) external {
        Job storage job = jobs[jobId];
        require(job.owner == msg.sender, "Not job owner");
        require(job.agent != address(0), "Job not awarded");
        require(!job.closed, "Job closed");
        require(milestoneIndex <= job.milestoneCount, "Invalid milestone index");
        require(requestHash != bytes32(0), "Request hash required");
        require(!validationRequests[requestHash].exists, "Request hash used");
        require(validator != address(0), "Validator required");

        validationRequests[requestHash] = ValidationRequestMeta({
            jobId: jobId,
            milestoneIndex: milestoneIndex,
            validator: validator,
            exists: true
        });

        emit ValidationRequested(jobId, milestoneIndex, validator, requestHash, requestURI);
    }

    /**
     * @notice Validator submits a validation response
     * @param requestHash The request hash to respond to
     * @param score Validation score (0-100)
     * @param responseURI Off-chain response details
     * @param responseHash Hash of the response content
     * @param tag Tag for the response (e.g., "milestone-0", "final")
     */
    function submitValidation(
        bytes32 requestHash,
        uint8 score,
        string calldata responseURI,
        bytes32 responseHash,
        string calldata tag
    ) external {
        ValidationRequestMeta storage meta = validationRequests[requestHash];
        require(meta.exists, "Request does not exist");
        require(meta.validator == msg.sender, "Not designated validator");
        require(!validationResponses[requestHash].exists, "Already responded");
        require(score <= 100, "Invalid score");

        validationResponses[requestHash] = ValidationResponse({
            score: score,
            responseURI: responseURI,
            responseHash: responseHash,
            tag: tag,
            exists: true
        });

        emit ValidationSubmitted(requestHash, score, responseURI, responseHash, tag);
    }

    /**
     * @notice Get validation response for a request hash
     */
    function getValidationResponse(bytes32 requestHash)
        external
        view
        returns (
            uint8 score,
            string memory responseURI,
            bytes32 responseHash,
            string memory tag,
            bool exists
        )
    {
        ValidationResponse memory response = validationResponses[requestHash];
        return (
            response.score,
            response.responseURI,
            response.responseHash,
            response.tag,
            response.exists
        );
    }

    function finalize(
        uint256 jobId,
        uint256 milestoneIndex,
        bytes32 requestHash
    ) external nonReentrant {
        Job storage job = jobs[jobId];
        require(job.owner == msg.sender, "Not job owner");
        require(!job.closed, "Job closed");
        require(milestoneIndex <= job.milestoneCount, "Invalid milestone index");

        ValidationRequestMeta memory meta = validationRequests[requestHash];
        require(meta.exists && meta.jobId == jobId && meta.milestoneIndex == milestoneIndex, "Invalid request");

        ValidationResponse memory response = validationResponses[requestHash];
        require(response.exists, "Validation missing");
        require(response.score >= job.passThreshold, "Validation failed");

        uint256 payoutAmount;
        address payoutAddress = job.agent;

        if (milestoneIndex == job.milestoneCount) {
            payoutAmount = job.budgetAmount - job.totalReleased;
        } else {
            Milestone storage milestone = milestones[jobId][milestoneIndex];
            require(!milestone.released, "Milestone released");
            payoutAmount = (job.budgetAmount * milestone.weightBps) / 10000;
            milestone.released = true;
        }

        if (payoutAmount > 0) {
            job.totalReleased += payoutAmount;
            _payout(job.paymentToken, payoutAddress, payoutAmount);
        }

        if (job.totalReleased >= job.budgetAmount) {
            job.closed = true;
        }

        emit JobFinalized(jobId, milestoneIndex, requestHash, response.score, payoutAmount, payoutAddress);
    }

    function openDispute(
        uint256 jobId,
        uint16 proposedPayoutBps,
        string calldata disputeURI,
        bytes32 disputeHash
    ) external {
        Job storage job = jobs[jobId];
        require(job.owner == msg.sender, "Not job owner");
        require(job.agent != address(0), "Job not awarded");
        require(!job.closed, "Job closed");
        require(!job.disputeOpen, "Dispute already open");
        require(_inDisputeWindow(job), "Dispute window closed");
        require(proposedPayoutBps <= 10000, "Invalid payout bps");
        require(disputeHash != bytes32(0), "Dispute hash required");

        uint256 minPaidBps = job.totalReleased == 0 ? 0 : (job.totalReleased * 10000) / job.budgetAmount;
        require(proposedPayoutBps >= minPaidBps, "Below released payout");

        job.disputeOpen = true;
        job.disputePayoutBps = proposedPayoutBps;
        job.disputeOpenedAt = block.timestamp;
        job.disputeURI = disputeURI;
        job.disputeHash = disputeHash;

        emit DisputeOpened(jobId, proposedPayoutBps, disputeURI, disputeHash);
    }

    function acceptDispute(uint256 jobId) external nonReentrant {
        Job storage job = jobs[jobId];
        require(job.disputeOpen, "No dispute");
        require(!job.closed, "Job closed");
        require(msg.sender == job.agent, "Not agent");
        require(_inDisputeWindow(job), "Dispute window closed");

        uint256 targetPayout = (job.budgetAmount * job.disputePayoutBps) / 10000;
        require(targetPayout >= job.totalReleased, "Payout already exceeded");

        uint256 agentAmount = targetPayout - job.totalReleased;
        uint256 ownerRefund = job.budgetAmount - targetPayout;

        address payoutAddress = job.agent;
        if (agentAmount > 0) {
            job.totalReleased += agentAmount;
            _payout(job.paymentToken, payoutAddress, agentAmount);
        }

        if (ownerRefund > 0) {
            _payout(job.paymentToken, job.owner, ownerRefund);
        }

        job.closed = true;

        emit DisputeAccepted(jobId, agentAmount, ownerRefund);
    }

    function reclaimRemainder(uint256 jobId) external nonReentrant {
        Job storage job = jobs[jobId];
        require(job.owner == msg.sender, "Not job owner");
        require(job.disputeOpen, "No dispute");
        require(!job.closed, "Job closed");
        require(!_inDisputeWindow(job), "Dispute window open");

        uint256 remaining = job.budgetAmount - job.totalReleased;
        job.closed = true;

        if (remaining > 0) {
            _payout(job.paymentToken, job.owner, remaining);
        }

        emit RemainderReclaimed(jobId, remaining);
    }

    function _payout(address token, address to, uint256 amount) internal {
        if (token == address(0)) {
            (bool success, ) = to.call{value: amount}("");
            require(success, "ETH payout failed");
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    function _inDisputeWindow(Job storage job) internal view returns (bool) {
        return block.timestamp <= job.awardedAt + disputeWindowSeconds;
    }

    receive() external payable {}
}
