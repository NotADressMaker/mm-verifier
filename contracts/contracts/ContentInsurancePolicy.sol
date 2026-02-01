// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ContentInsurancePolicy
 * @notice Insurance contract for AI content guarantees
 * @dev Allows content creators to stake funds guaranteeing their claims
 */
contract ContentInsurancePolicy is ReentrancyGuard, Ownable {
    enum PolicyType {
        HUMAN_CREATED,
        AI_VERIFIED,
        HYBRID_DISCLOSURE
    }

    enum PolicyStatus {
        ACTIVE,
        CLAIMED,
        UNDER_REVIEW,
        PAID_OUT,
        EXPIRED,
        CANCELLED
    }

    enum ClaimReason {
        AI_DETECTED_WHEN_HUMAN_CLAIMED,
        FACTUAL_ERROR_IN_VERIFIED_AI,
        MISSING_CITATIONS,
        CONTRADICTION_WITH_SOURCES,
        PLAGIARISM
    }

    struct Policy {
        bytes32 policyId;
        address creator;
        bytes32 contentHash;
        PolicyType policyType;
        uint256 coverageAmount;
        uint256 premium;
        uint256 startTime;
        uint256 duration;
        PolicyStatus status;
        bytes32 verificationHash;
        uint8 verificationScore;
        string contentUrl;
    }

    struct Claim {
        bytes32 claimId;
        bytes32 policyId;
        address claimant;
        ClaimReason reason;
        uint256 claimAmount;
        uint256 claimTime;
        bytes32 evidenceHash;
        bool resolved;
        bool approved;
        address[] auditors;
    }

    mapping(bytes32 => Policy) public policies;
    mapping(bytes32 => Claim) public claims;
    mapping(address => bytes32[]) public creatorPolicies;
    mapping(bytes32 => bytes32[]) public policyClaims;

    uint256 public insurancePool;
    uint256 public totalCoverage;

    event PolicyCreated(
        bytes32 indexed policyId,
        address indexed creator,
        PolicyType policyType,
        uint256 coverageAmount,
        uint256 premium
    );
    event ClaimFiled(
        bytes32 indexed claimId,
        bytes32 indexed policyId,
        address indexed claimant,
        ClaimReason reason,
        uint256 claimAmount
    );
    event ClaimResolved(
        bytes32 indexed claimId,
        bool approved,
        uint256 payoutAmount
    );
    event PolicyExpired(bytes32 indexed policyId);

    constructor() Ownable(msg.sender) {}

    function createPolicy(
        bytes32 contentHash,
        PolicyType policyType,
        uint256 coverageAmount,
        uint256 duration,
        string memory contentUrl
    ) external payable returns (bytes32 policyId) {
        require(coverageAmount > 0, "Coverage required");
        require(duration > 0, "Duration required");

        uint256 premium = calculatePremium(coverageAmount, policyType, duration);
        require(msg.value >= premium, "Insufficient premium payment");

        policyId = keccak256(abi.encodePacked(msg.sender, contentHash, block.timestamp));
        policies[policyId] = Policy({
            policyId: policyId,
            creator: msg.sender,
            contentHash: contentHash,
            policyType: policyType,
            coverageAmount: coverageAmount,
            premium: premium,
            startTime: block.timestamp,
            duration: duration,
            status: PolicyStatus.ACTIVE,
            verificationHash: bytes32(0),
            verificationScore: 0,
            contentUrl: contentUrl
        });

        creatorPolicies[msg.sender].push(policyId);

        insurancePool += premium;
        totalCoverage += coverageAmount;

        emit PolicyCreated(policyId, msg.sender, policyType, coverageAmount, premium);

        if (msg.value > premium) {
            payable(msg.sender).transfer(msg.value - premium);
        }
    }

    function addVerification(
        bytes32 policyId,
        bytes32 verificationHash,
        uint8 score
    ) external {
        Policy storage policy = policies[policyId];
        require(policy.creator == msg.sender, "Only creator can add verification");
        require(policy.policyType == PolicyType.AI_VERIFIED, "Only for AI policies");
        require(policy.status == PolicyStatus.ACTIVE, "Policy not active");
        require(score <= 100, "Invalid score");

        policy.verificationHash = verificationHash;
        policy.verificationScore = score;
    }

    function fileClaim(
        bytes32 policyId,
        ClaimReason reason,
        bytes32 evidenceHash
    ) external payable returns (bytes32 claimId) {
        Policy storage policy = policies[policyId];
        require(policy.status == PolicyStatus.ACTIVE, "Policy not active");
        require(block.timestamp <= policy.startTime + policy.duration, "Policy expired");

        uint256 claimStake = policy.coverageAmount / 20;
        require(msg.value >= claimStake, "Insufficient claim stake");

        claimId = keccak256(abi.encodePacked(policyId, msg.sender, block.timestamp));
        claims[claimId] = Claim({
            claimId: claimId,
            policyId: policyId,
            claimant: msg.sender,
            reason: reason,
            claimAmount: policy.coverageAmount,
            claimTime: block.timestamp,
            evidenceHash: evidenceHash,
            resolved: false,
            approved: false,
            auditors: new address[](0)
        });

        policyClaims[policyId].push(claimId);
        policy.status = PolicyStatus.CLAIMED;

        emit ClaimFiled(claimId, policyId, msg.sender, reason, policy.coverageAmount);
    }

    function resolveClaim(bytes32 claimId, bool approved) external onlyOwner nonReentrant {
        Claim storage claim = claims[claimId];
        Policy storage policy = policies[claim.policyId];

        require(claim.claimId != bytes32(0), "Claim not found");
        require(!claim.resolved, "Claim already resolved");
        require(policy.status == PolicyStatus.CLAIMED, "Invalid policy status");

        claim.resolved = true;
        claim.approved = approved;

        if (approved) {
            require(insurancePool >= claim.claimAmount, "Insufficient insurance pool");
            insurancePool -= claim.claimAmount;
            totalCoverage -= policy.coverageAmount;
            policy.status = PolicyStatus.PAID_OUT;

            payable(claim.claimant).transfer(claim.claimAmount);
            emit ClaimResolved(claimId, true, claim.claimAmount);
            return;
        }

        policy.status = PolicyStatus.ACTIVE;
        uint256 claimStake = policy.coverageAmount / 20;
        payable(claim.claimant).transfer(claimStake);

        emit ClaimResolved(claimId, false, 0);
    }

    function calculatePremium(
        uint256 coverageAmount,
        PolicyType policyType,
        uint256 duration
    ) public pure returns (uint256 premium) {
        uint256 baseRate = coverageAmount / 10;

        uint256 riskMultiplier;
        if (policyType == PolicyType.HUMAN_CREATED) {
            riskMultiplier = 150;
        } else if (policyType == PolicyType.AI_VERIFIED) {
            riskMultiplier = 100;
        } else {
            riskMultiplier = 120;
        }

        uint256 durationDays = duration / 1 days;
        uint256 durationMultiplier = 100 + (durationDays * 5);

        premium = (baseRate * riskMultiplier * durationMultiplier) / 10000;
    }

    function cancelPolicy(bytes32 policyId) external nonReentrant {
        Policy storage policy = policies[policyId];
        require(policy.creator == msg.sender, "Only creator can cancel");
        require(policy.status == PolicyStatus.ACTIVE, "Policy not active");
        require(policyClaims[policyId].length == 0, "Cannot cancel with active claims");

        uint256 refund = policy.premium / 2;
        insurancePool -= refund;
        totalCoverage -= policy.coverageAmount;
        policy.status = PolicyStatus.CANCELLED;

        payable(msg.sender).transfer(refund);
    }

    function expirePolicy(bytes32 policyId) external nonReentrant {
        Policy storage policy = policies[policyId];
        require(policy.status == PolicyStatus.ACTIVE, "Policy not active");
        require(block.timestamp > policy.startTime + policy.duration, "Not expired yet");

        uint256 refund = (policy.premium * 90) / 100;
        insurancePool -= refund;
        totalCoverage -= policy.coverageAmount;
        policy.status = PolicyStatus.EXPIRED;

        payable(policy.creator).transfer(refund);

        emit PolicyExpired(policyId);
    }
}
