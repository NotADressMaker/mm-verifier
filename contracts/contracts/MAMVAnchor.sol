// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MAMVAnchor
 * @notice Optional onchain receipt anchoring for MAMV Receipt v1.
 * @dev Stores compact, non-sensitive proof metadata only. Raw prompts, model
 * outputs, evidence documents, provider traces, secrets, and PII must remain
 * offchain and may be referenced via a URI/CID when appropriate.
 */
contract MAMVAnchor is Ownable {
    struct AnchorRecord {
        bytes32 receiptHash;
        bytes32 evidenceHash;
        bytes32 programHash;
        bytes32 subjectHash;
        uint16 scoreBps;
        address issuer;
        uint64 anchoredAt;
        string uri;
    }

    bytes32 public constant ANCHORER_ROLE = keccak256("MAMV_ANCHORER_ROLE");
    uint16 public constant MAX_SCORE_BPS = 10_000;

    bytes32 public verificationHead;
    mapping(bytes32 => bytes32) public prevByBlock; // blockHash -> prevHash; legacy hash-chain compatibility
    mapping(uint256 => bytes32) public taskToBlock; // taskId -> blockHash; legacy marketplace compatibility

    mapping(address => bool) public anchorers;
    mapping(bytes32 => AnchorRecord) private anchors;

    event ReceiptAnchored(
        bytes32 indexed receiptHash,
        bytes32 indexed evidenceHash,
        bytes32 indexed programHash,
        bytes32 subjectHash,
        uint16 scoreBps,
        address indexed issuer,
        string uri
    );
    event AnchorerSet(address indexed anchorer, bool allowed);
    event VerificationBlockAppended(
        uint256 indexed taskId,
        bytes32 indexed blockHash,
        bytes32 prevHash,
        bytes32 claimHash
    );
    event VerificationHeadUpdated(bytes32 oldHead, bytes32 newHead);

    error NotAnchorer(address caller);
    error EmptyReceiptHash();
    error ReceiptAlreadyAnchored(bytes32 receiptHash);
    error ReceiptNotAnchored(bytes32 receiptHash);
    error InvalidScore(uint16 scoreBps);
    error InvalidAnchorer(address anchorer);
    error TaskAlreadyRecorded(uint256 taskId);

    modifier onlyAnchorer() {
        if (!anchorers[msg.sender]) revert NotAnchorer(msg.sender);
        _;
    }

    constructor(address initialAnchorer) Ownable(msg.sender) {
        anchorers[msg.sender] = true;
        emit AnchorerSet(msg.sender, true);

        if (initialAnchorer != address(0) && initialAnchorer != msg.sender) {
            anchorers[initialAnchorer] = true;
            emit AnchorerSet(initialAnchorer, true);
        }
    }

    function setAnchorer(address anchorer, bool allowed) external onlyOwner {
        if (anchorer == address(0)) revert InvalidAnchorer(anchorer);
        anchorers[anchorer] = allowed;
        emit AnchorerSet(anchorer, allowed);
    }

    function anchorReceipt(
        bytes32 receiptHash,
        bytes32 evidenceHash,
        bytes32 programHash,
        bytes32 subjectHash,
        uint16 scoreBps,
        string calldata uri
    ) external onlyAnchorer {
        _anchorReceipt(receiptHash, evidenceHash, programHash, subjectHash, scoreBps, msg.sender, uri);
    }

    function isAnchored(bytes32 receiptHash) external view returns (bool) {
        return anchors[receiptHash].anchoredAt != 0;
    }

    function getAnchor(bytes32 receiptHash) external view returns (AnchorRecord memory) {
        AnchorRecord memory record = anchors[receiptHash];
        if (record.anchoredAt == 0) revert ReceiptNotAnchored(receiptHash);
        return record;
    }

    /**
     * @notice Backwards-compatible adapter for the existing marketplace hash-chain flow.
     * @dev New integrations should call anchorReceipt with an offchain MAMV Receipt v1 hash.
     */
    function appendVerificationBlock(
        uint256 taskId,
        bytes32 claimHash,
        bytes32 outcomeHash,
        bytes32 evidenceBundleHash,
        bytes32 programHash
    ) external onlyAnchorer returns (bytes32 blockHash) {
        if (taskToBlock[taskId] != bytes32(0)) revert TaskAlreadyRecorded(taskId);

        bytes32 prevHash = verificationHead;
        blockHash = keccak256(
            abi.encode(
                bytes32("MAMV_VERIFICATION_BLOCK_V1"),
                taskId,
                prevHash,
                claimHash,
                outcomeHash,
                evidenceBundleHash,
                programHash,
                block.timestamp
            )
        );

        prevByBlock[blockHash] = prevHash;
        taskToBlock[taskId] = blockHash;
        verificationHead = blockHash;

        _anchorReceipt(blockHash, evidenceBundleHash, programHash, claimHash, 0, msg.sender, "");

        emit VerificationBlockAppended(taskId, blockHash, prevHash, claimHash);
        emit VerificationHeadUpdated(prevHash, blockHash);
    }

    function _anchorReceipt(
        bytes32 receiptHash,
        bytes32 evidenceHash,
        bytes32 programHash,
        bytes32 subjectHash,
        uint16 scoreBps,
        address issuer,
        string memory uri
    ) internal {
        if (receiptHash == bytes32(0)) revert EmptyReceiptHash();
        if (anchors[receiptHash].anchoredAt != 0) revert ReceiptAlreadyAnchored(receiptHash);
        if (scoreBps > MAX_SCORE_BPS) revert InvalidScore(scoreBps);

        anchors[receiptHash] = AnchorRecord({
            receiptHash: receiptHash,
            evidenceHash: evidenceHash,
            programHash: programHash,
            subjectHash: subjectHash,
            scoreBps: scoreBps,
            issuer: issuer,
            anchoredAt: uint64(block.timestamp),
            uri: uri
        });

        emit ReceiptAnchored(receiptHash, evidenceHash, programHash, subjectHash, scoreBps, issuer, uri);
    }
}
