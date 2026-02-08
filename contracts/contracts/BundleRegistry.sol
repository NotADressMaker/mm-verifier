// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IDisputeInterfaces.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title BundleRegistry
 * @notice On-chain registry for evidence bundle commitments
 * @dev Stores Merkle roots and metadata for evidence bundles and branches
 *
 * Evaluators submit bundle commitments (not full bundles) on-chain to enable:
 * 1. L0 auto-checks in dispute ladder (branch budget, support requirements)
 * 2. Tamper-proof timestamps for bundle submission
 * 3. Ownership verification
 *
 * Full bundle data lives off-chain (IPFS/Arweave)
 */
contract BundleRegistry is IBundleRegistry, Ownable, ReentrancyGuard {
    // ========================================================================
    // Structs
    // ========================================================================

    struct BundleMeta {
        address owner;              // Verifier who submitted
        uint16 branchCount;         // Number of branches
        uint16 declaredBudget;      // Declared branch budget
        bytes32 branchesRoot;       // Merkle root of all branch objects
        bytes32 evidenceBundleHash; // Hash of full evidence bundle (JSON)
        string bundleURI;           // IPFS/Arweave URI
        uint64 submittedAt;         // Timestamp
    }

    struct BranchMeta {
        uint16 confidenceBps;       // Confidence in basis points (0-10000)
        bool requiresSupport;       // Whether branch requires evidence
        bytes32 supportRoot;        // Merkle root of support evidence
        bytes32 conditionHash;      // Hash of IF condition
        bytes32 verdictHash;        // Hash of THEN verdict
    }

    // ========================================================================
    // State
    // ========================================================================

    // Bundle storage
    mapping(bytes32 => BundleMeta) public bundles;

    // Branch storage: bundleId => branchId => BranchMeta
    mapping(bytes32 => mapping(uint32 => BranchMeta)) public branches;

    // Bundle ID generator
    uint256 public nextBundleNonce = 1;

    // Configuration
    uint16 public constant HIGH_CONFIDENCE_THRESHOLD = 7500; // 75% requires support

    // ========================================================================
    // Events
    // ========================================================================

    event BundleRegistered(
        bytes32 indexed bundleId,
        address indexed owner,
        uint16 branchCount,
        uint16 declaredBudget,
        bytes32 branchesRoot,
        string bundleURI
    );

    event BranchRegistered(
        bytes32 indexed bundleId,
        uint32 indexed branchId,
        uint16 confidenceBps,
        bytes32 supportRoot
    );

    // ========================================================================
    // Constructor
    // ========================================================================

    constructor() Ownable(msg.sender) {}

    // ========================================================================
    // Registration
    // ========================================================================

    /**
     * @notice Register a new evidence bundle commitment
     * @param branchCount Number of branches in bundle
     * @param declaredBudget Declared branch budget
     * @param branchesRoot Merkle root of branch objects
     * @param evidenceBundleHash Hash of full evidence bundle
     * @param bundleURI IPFS/Arweave URI
     * @return bundleId Generated bundle ID
     */
    function registerBundle(
        uint16 branchCount,
        uint16 declaredBudget,
        bytes32 branchesRoot,
        bytes32 evidenceBundleHash,
        string calldata bundleURI
    ) external nonReentrant returns (bytes32 bundleId) {
        require(branchCount > 0, "Branch count must be > 0");
        require(declaredBudget >= branchCount, "Budget < branch count");
        require(branchesRoot != bytes32(0), "Invalid branches root");
        require(evidenceBundleHash != bytes32(0), "Invalid bundle hash");

        // Generate unique bundle ID
        bundleId = keccak256(abi.encodePacked(
            msg.sender,
            block.timestamp,
            nextBundleNonce++
        ));

        bundles[bundleId] = BundleMeta({
            owner: msg.sender,
            branchCount: branchCount,
            declaredBudget: declaredBudget,
            branchesRoot: branchesRoot,
            evidenceBundleHash: evidenceBundleHash,
            bundleURI: bundleURI,
            submittedAt: uint64(block.timestamp)
        });

        emit BundleRegistered(
            bundleId,
            msg.sender,
            branchCount,
            declaredBudget,
            branchesRoot,
            bundleURI
        );
    }

    /**
     * @notice Register branch metadata
     * @param bundleId Bundle identifier
     * @param branchId Branch index (1-based)
     * @param confidenceBps Confidence in basis points
     * @param supportRoot Merkle root of support evidence
     * @param conditionHash Hash of IF condition
     * @param verdictHash Hash of THEN verdict
     */
    function registerBranch(
        bytes32 bundleId,
        uint32 branchId,
        uint16 confidenceBps,
        bytes32 supportRoot,
        bytes32 conditionHash,
        bytes32 verdictHash
    ) external nonReentrant {
        BundleMeta storage bundle = bundles[bundleId];
        require(bundle.owner == msg.sender, "Not bundle owner");
        require(branchId > 0 && branchId <= bundle.branchCount, "Invalid branch ID");
        require(confidenceBps <= 10000, "Confidence > 100%");

        bool requiresSupport = (confidenceBps >= HIGH_CONFIDENCE_THRESHOLD) || (supportRoot != bytes32(0));

        branches[bundleId][branchId] = BranchMeta({
            confidenceBps: confidenceBps,
            requiresSupport: requiresSupport,
            supportRoot: supportRoot,
            conditionHash: conditionHash,
            verdictHash: verdictHash
        });

        emit BranchRegistered(bundleId, branchId, confidenceBps, supportRoot);
    }

    /**
     * @notice Batch register multiple branches
     * @param bundleId Bundle identifier
     * @param branchIds Array of branch IDs
     * @param confidences Array of confidence values
     * @param supportRoots Array of support roots
     * @param conditionHashes Array of condition hashes
     * @param verdictHashes Array of verdict hashes
     */
    function registerBranchesBatch(
        bytes32 bundleId,
        uint32[] calldata branchIds,
        uint16[] calldata confidences,
        bytes32[] calldata supportRoots,
        bytes32[] calldata conditionHashes,
        bytes32[] calldata verdictHashes
    ) external nonReentrant {
        require(
            branchIds.length == confidences.length &&
            branchIds.length == supportRoots.length &&
            branchIds.length == conditionHashes.length &&
            branchIds.length == verdictHashes.length,
            "Array length mismatch"
        );

        BundleMeta storage bundle = bundles[bundleId];
        require(bundle.owner == msg.sender, "Not bundle owner");

        for (uint256 i = 0; i < branchIds.length; i++) {
            uint32 branchId = branchIds[i];
            require(branchId > 0 && branchId <= bundle.branchCount, "Invalid branch ID");
            require(confidences[i] <= 10000, "Confidence > 100%");

            bool requiresSupport = (confidences[i] >= HIGH_CONFIDENCE_THRESHOLD) || (supportRoots[i] != bytes32(0));

            branches[bundleId][branchId] = BranchMeta({
                confidenceBps: confidences[i],
                requiresSupport: requiresSupport,
                supportRoot: supportRoots[i],
                conditionHash: conditionHashes[i],
                verdictHash: verdictHashes[i]
            });

            emit BranchRegistered(bundleId, branchId, confidences[i], supportRoots[i]);
        }
    }

    // ========================================================================
    // IBundleRegistry Implementation
    // ========================================================================

    function getBundleOwner(bytes32 bundleId) external view override returns (address) {
        return bundles[bundleId].owner;
    }

    function getBundleMeta(bytes32 bundleId) external view override returns (
        uint16 branchCount,
        bytes32 branchesRoot,
        uint64 submittedAt
    ) {
        BundleMeta storage bundle = bundles[bundleId];
        return (bundle.branchCount, bundle.branchesRoot, bundle.submittedAt);
    }

    function getBundleEvidence(bytes32 bundleId) external view override returns (
        bytes32 evidenceBundleHash,
        string memory bundleURI,
        uint64 submittedAt
    ) {
        BundleMeta storage bundle = bundles[bundleId];
        return (bundle.evidenceBundleHash, bundle.bundleURI, bundle.submittedAt);
    }

    function getBranchMeta(bytes32 bundleId, uint32 branchId) external view override returns (
        uint16 confidenceBps,
        bool requiresSupport
    ) {
        BranchMeta storage branch = branches[bundleId][branchId];
        return (branch.confidenceBps, branch.requiresSupport);
    }

    function getSupportCommitment(bytes32 bundleId, uint32 branchId) external view override returns (
        bytes32 supportRoot
    ) {
        return branches[bundleId][branchId].supportRoot;
    }

    function getDeclaredBudget(bytes32 bundleId) external view override returns (uint16 budget) {
        return bundles[bundleId].declaredBudget;
    }

    // ========================================================================
    // Additional View Functions
    // ========================================================================

    /**
     * @notice Get complete bundle metadata
     * @param bundleId Bundle identifier
     */
    function getBundle(bytes32 bundleId) external view returns (BundleMeta memory) {
        return bundles[bundleId];
    }

    /**
     * @notice Get complete branch metadata
     * @param bundleId Bundle identifier
     * @param branchId Branch index
     */
    function getBranch(bytes32 bundleId, uint32 branchId) external view returns (BranchMeta memory) {
        return branches[bundleId][branchId];
    }

    /**
     * @notice Check if bundle exists
     * @param bundleId Bundle identifier
     */
    function bundleExists(bytes32 bundleId) external view returns (bool) {
        return bundles[bundleId].owner != address(0);
    }

    /**
     * @notice Check if branch exists
     * @param bundleId Bundle identifier
     * @param branchId Branch index
     */
    function branchExists(bytes32 bundleId, uint32 branchId) external view returns (bool) {
        return branches[bundleId][branchId].conditionHash != bytes32(0);
    }
}
