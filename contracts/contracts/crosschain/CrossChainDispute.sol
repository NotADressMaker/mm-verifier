// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title CrossChainDispute
 * @notice Handle disputes spanning multiple chains
 * @dev Enables verification tasks on one chain to be disputed on another
 *
 * Use Cases:
 * 1. Task submitted on Arbitrum (low fees)
 * 2. Dispute escalated to Ethereum (more security, larger jury pool)
 * 3. Resolution propagated back to Arbitrum
 *
 * Architecture:
 * - Each chain has DisputeLadder contract
 * - CrossChainDispute acts as bridge between them
 * - Jury selection can span multiple chains
 * - Bonding occurs on origin chain, resolution on destination
 *
 * Example:
 * ```
 * // Task on Arbitrum
 * taskId = marketplace.createTask{value: 1 ether}(...);
 *
 * // Dispute escalates to Ethereum (needs more experts)
 * crossChainDispute.escalateToMainnet(taskId);
 *
 * // Mainnet jury resolves
 * disputeLadder.voteOnDispute(disputeId, score);
 *
 * // Result sent back to Arbitrum
 * crossChainDispute.resolveFromMainnet(taskId, outcome);
 * ```
 *
 * Benefits:
 * - Access larger expert pools on mainnet
 * - Lower costs for task submission on L2s
 * - Unified dispute resolution across ecosystem
 */
contract CrossChainDispute is Ownable, ReentrancyGuard {
    // Chain configuration
    uint16 public immutable chainId;
    uint16 public mainnetChainId;
    bool public isMainnet;

    // Cross-chain dispute state
    struct CrossChainDisputeInfo {
        uint256 originTaskId;      // Task ID on origin chain
        uint16 originChainId;      // Chain where task was created
        uint16 resolutionChainId;  // Chain where dispute is resolved
        address disputer;          // Address that initiated dispute
        uint256 bondAmount;        // Bond locked for dispute
        DisputeStatus status;      // Current status
        uint256 outcome;           // Final outcome (score)
        uint256 createdAt;         // Timestamp
        uint256 resolvedAt;        // Resolution timestamp
    }

    enum DisputeStatus {
        Pending,        // Waiting for cross-chain confirmation
        Active,         // Dispute active on resolution chain
        Resolved,       // Dispute resolved
        Cancelled       // Dispute cancelled
    }

    // State
    mapping(bytes32 => CrossChainDisputeInfo) public disputes; // disputeId => info
    mapping(uint256 => bytes32) public taskToDispute;          // originTaskId => disputeId
    mapping(uint16 => address) public chainContracts;          // chainId => dispute contract
    mapping(uint16 => bool) public trustedChains;

    uint256 public disputeNonce;

    // Events
    event DisputeEscalated(
        bytes32 indexed disputeId,
        uint256 indexed originTaskId,
        uint16 originChainId,
        uint16 resolutionChainId,
        address indexed disputer,
        uint256 bondAmount
    );

    event DisputeResolved(
        bytes32 indexed disputeId,
        uint256 outcome,
        uint16 resolutionChainId
    );

    event DisputePropagated(
        bytes32 indexed disputeId,
        uint16 indexed targetChainId,
        uint256 outcome
    );

    event ChainConfigured(
        uint16 indexed chainId,
        address contractAddress,
        bool trusted
    );

    constructor(
        uint16 _chainId,
        uint16 _mainnetChainId,
        bool _isMainnet
    ) Ownable(msg.sender) {
        chainId = _chainId;
        mainnetChainId = _mainnetChainId;
        isMainnet = _isMainnet;
    }

    /**
     * @notice Configure trusted chain
     * @param remoteChainId Chain ID
     * @param remoteContract Contract address
     * @param trusted Trust status
     */
    function configureChain(
        uint16 remoteChainId,
        address remoteContract,
        bool trusted
    ) external onlyOwner {
        chainContracts[remoteChainId] = remoteContract;
        trustedChains[remoteChainId] = trusted;
        emit ChainConfigured(remoteChainId, remoteContract, trusted);
    }

    /**
     * @notice Escalate dispute to another chain (typically mainnet)
     * @param taskId Task ID on current chain
     * @param targetChainId Chain to escalate to
     * @param bondAmount Bond amount (in WETH)
     * @return disputeId Cross-chain dispute ID
     */
    function escalateDispute(
        uint256 taskId,
        uint16 targetChainId,
        uint256 bondAmount
    ) external nonReentrant returns (bytes32 disputeId) {
        require(trustedChains[targetChainId], "Untrusted target chain");
        require(taskToDispute[taskId] == bytes32(0), "Dispute already exists");

        // Generate dispute ID
        disputeNonce++;
        disputeId = keccak256(
            abi.encodePacked(
                chainId,
                taskId,
                msg.sender,
                disputeNonce,
                block.timestamp
            )
        );

        // Create dispute record
        disputes[disputeId] = CrossChainDisputeInfo({
            originTaskId: taskId,
            originChainId: chainId,
            resolutionChainId: targetChainId,
            disputer: msg.sender,
            bondAmount: bondAmount,
            status: DisputeStatus.Pending,
            outcome: 0,
            createdAt: block.timestamp,
            resolvedAt: 0
        });

        taskToDispute[taskId] = disputeId;

        emit DisputeEscalated(
            disputeId,
            taskId,
            chainId,
            targetChainId,
            msg.sender,
            bondAmount
        );

        return disputeId;
    }

    /**
     * @notice Receive dispute from another chain
     * @param disputeId Dispute ID
     * @param originTaskId Original task ID
     * @param originChainId Origin chain
     * @param disputer Disputer address
     * @param bondAmount Bond amount
     */
    function receiveDispute(
        bytes32 disputeId,
        uint256 originTaskId,
        uint16 originChainId,
        address disputer,
        uint256 bondAmount
    ) external onlyOwner nonReentrant {
        require(trustedChains[originChainId], "Untrusted origin chain");
        require(disputes[disputeId].createdAt == 0, "Dispute already exists");

        disputes[disputeId] = CrossChainDisputeInfo({
            originTaskId: originTaskId,
            originChainId: originChainId,
            resolutionChainId: chainId,
            disputer: disputer,
            bondAmount: bondAmount,
            status: DisputeStatus.Active,
            outcome: 0,
            createdAt: block.timestamp,
            resolvedAt: 0
        });

        emit DisputeEscalated(
            disputeId,
            originTaskId,
            originChainId,
            chainId,
            disputer,
            bondAmount
        );
    }

    /**
     * @notice Resolve dispute (called by DisputeLadder after jury decision)
     * @param disputeId Dispute ID
     * @param outcome Final outcome/score
     */
    function resolveDispute(
        bytes32 disputeId,
        uint256 outcome
    ) external onlyOwner nonReentrant {
        CrossChainDisputeInfo storage dispute = disputes[disputeId];
        require(dispute.status == DisputeStatus.Active, "Dispute not active");
        require(dispute.resolutionChainId == chainId, "Wrong resolution chain");

        dispute.status = DisputeStatus.Resolved;
        dispute.outcome = outcome;
        dispute.resolvedAt = block.timestamp;

        emit DisputeResolved(disputeId, outcome, chainId);

        // If resolved on different chain than origin, propagate result
        if (dispute.originChainId != chainId) {
            _propagateResolution(disputeId, dispute.originChainId, outcome);
        }
    }

    /**
     * @notice Receive resolution from another chain
     * @param disputeId Dispute ID
     * @param outcome Resolution outcome
     */
    function receiveResolution(
        bytes32 disputeId,
        uint256 outcome
    ) external onlyOwner nonReentrant {
        CrossChainDisputeInfo storage dispute = disputes[disputeId];
        require(dispute.status == DisputeStatus.Pending, "Invalid state");
        require(dispute.originChainId == chainId, "Wrong origin chain");

        dispute.status = DisputeStatus.Resolved;
        dispute.outcome = outcome;
        dispute.resolvedAt = block.timestamp;

        emit DisputeResolved(disputeId, outcome, dispute.resolutionChainId);
    }

    /**
     * @notice Get dispute info
     * @param disputeId Dispute ID
     * @return info Dispute information
     */
    function getDispute(bytes32 disputeId)
        external
        view
        returns (CrossChainDisputeInfo memory info)
    {
        return disputes[disputeId];
    }

    /**
     * @notice Get dispute by task ID
     * @param taskId Task ID
     * @return disputeId Dispute ID
     * @return info Dispute information
     */
    function getDisputeByTask(uint256 taskId)
        external
        view
        returns (bytes32 disputeId, CrossChainDisputeInfo memory info)
    {
        disputeId = taskToDispute[taskId];
        info = disputes[disputeId];
    }

    /**
     * @notice Check if task has active cross-chain dispute
     * @param taskId Task ID
     * @return hasDispute True if active dispute exists
     */
    function hasActiveDispute(uint256 taskId) external view returns (bool) {
        bytes32 disputeId = taskToDispute[taskId];
        if (disputeId == bytes32(0)) return false;

        DisputeStatus status = disputes[disputeId].status;
        return status == DisputeStatus.Pending || status == DisputeStatus.Active;
    }

    /**
     * @notice Internal function to propagate resolution
     * @param disputeId Dispute ID
     * @param targetChainId Target chain
     * @param outcome Outcome
     */
    function _propagateResolution(
        bytes32 disputeId,
        uint16 targetChainId,
        uint256 outcome
    ) internal {
        // In production, this would use LayerZero to send message
        // For now, emit event for off-chain relayer
        emit DisputePropagated(disputeId, targetChainId, outcome);
    }
}
