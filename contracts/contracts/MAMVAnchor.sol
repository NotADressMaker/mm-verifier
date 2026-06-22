// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title MAMVAnchor
 * @notice Public receipt verification and onchain receipt anchoring for MAMV receipts.
 * @dev Stores compact tamper-evident verification records only. Do not store raw prompts,
 * raw AI outputs, private evidence, user identifiers, API keys, or secrets. MAMV checks AI
 * outputs offchain; blockchain verifies the record, not the truth of the claim.
 */
contract MAMVAnchor is AccessControl {
    struct AnchorRecord {
        bytes32 receiptHash;
        bytes32 evidenceHash;
        bytes32 programHash;
        bytes32 subjectHash;
        uint16 scoreBps;
        uint8 status;
        address issuer;
        uint64 anchoredAt;
        string uri;
    }

    bytes32 public constant ANCHORER_ROLE = keccak256("MAMV_ANCHORER_ROLE");
    uint16 public constant MAX_SCORE_BPS = 10_000;

    bytes32 public verificationHead;
    mapping(bytes32 => bytes32) public prevByBlock; // blockHash -> prevHash; legacy hash-chain compatibility
    mapping(uint256 => bytes32) public taskToBlock; // taskId -> blockHash; legacy marketplace compatibility

    mapping(bytes32 => AnchorRecord) private anchors;

    event ReceiptAnchored(
        bytes32 indexed receiptHash,
        bytes32 indexed evidenceHash,
        bytes32 programHash,
        bytes32 subjectHash,
        uint16 scoreBps,
        uint8 status,
        address indexed issuer,
        uint64 anchoredAt,
        string uri
    );
    event VerificationBlockAppended(
        uint256 indexed taskId,
        bytes32 indexed blockHash,
        bytes32 prevHash,
        bytes32 claimHash
    );
    event VerificationHeadUpdated(bytes32 oldHead, bytes32 newHead);

    error EmptyReceiptHash();
    error ReceiptAlreadyAnchored(bytes32 receiptHash);
    error ReceiptNotAnchored(bytes32 receiptHash);
    error InvalidScore(uint16 scoreBps);
    error InvalidAnchorer(address anchorer);
    error TaskAlreadyRecorded(uint256 taskId);

    constructor(address initialAnchorer) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ANCHORER_ROLE, msg.sender);

        if (initialAnchorer != address(0) && initialAnchorer != msg.sender) {
            _grantRole(ANCHORER_ROLE, initialAnchorer);
        }
    }

    /**
     * @notice Convenience admin wrapper for legacy callers that previously used owner-based anchorer management.
     */
    function setAnchorer(address anchorer, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (anchorer == address(0)) revert InvalidAnchorer(anchorer);
        if (allowed) {
            _grantRole(ANCHORER_ROLE, anchorer);
        } else {
            _revokeRole(ANCHORER_ROLE, anchorer);
        }
    }

    function anchorReceipt(
        bytes32 receiptHash,
        bytes32 evidenceHash,
        bytes32 programHash,
        bytes32 subjectHash,
        uint16 scoreBps,
        uint8 status,
        string calldata uri
    ) external onlyRole(ANCHORER_ROLE) {
        _anchorReceipt(receiptHash, evidenceHash, programHash, subjectHash, scoreBps, status, msg.sender, uri);
    }

    function isAnchored(bytes32 receiptHash) external view returns (bool) {
        return anchors[receiptHash].anchoredAt != 0;
    }

    function getAnchor(bytes32 receiptHash) external view returns (AnchorRecord memory) {
        AnchorRecord memory record = anchors[receiptHash];
        if (record.anchoredAt == 0) revert ReceiptNotAnchored(receiptHash);
        return record;
    }

    function verifyAnchor(
        bytes32 receiptHash,
        bytes32 evidenceHash,
        bytes32 programHash,
        bytes32 subjectHash,
        uint16 scoreBps,
        uint8 status,
        address issuer
    ) external view returns (bool) {
        AnchorRecord memory record = anchors[receiptHash];
        return record.anchoredAt != 0 && record.evidenceHash == evidenceHash && record.programHash == programHash
            && record.subjectHash == subjectHash && record.scoreBps == scoreBps && record.status == status
            && record.issuer == issuer;
    }

    /**
     * @notice Backwards-compatible adapter for the existing marketplace hash-chain flow.
     * @dev New integrations should call anchorReceipt with an offchain MAMV receipt hash.
     */
    function appendVerificationBlock(
        uint256 taskId,
        bytes32 claimHash,
        bytes32 outcomeHash,
        bytes32 evidenceBundleHash,
        bytes32 programHash
    ) external onlyRole(ANCHORER_ROLE) returns (bytes32 blockHash) {
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

        _anchorReceipt(blockHash, evidenceBundleHash, programHash, claimHash, 0, 0, msg.sender, "");

        emit VerificationBlockAppended(taskId, blockHash, prevHash, claimHash);
        emit VerificationHeadUpdated(prevHash, blockHash);
    }

    function _anchorReceipt(
        bytes32 receiptHash,
        bytes32 evidenceHash,
        bytes32 programHash,
        bytes32 subjectHash,
        uint16 scoreBps,
        uint8 status,
        address issuer,
        string memory uri
    ) internal {
        if (receiptHash == bytes32(0)) revert EmptyReceiptHash();
        if (anchors[receiptHash].anchoredAt != 0) revert ReceiptAlreadyAnchored(receiptHash);
        if (scoreBps > MAX_SCORE_BPS) revert InvalidScore(scoreBps);

        uint64 anchoredAt = uint64(block.timestamp);
        anchors[receiptHash] = AnchorRecord({
            receiptHash: receiptHash,
            evidenceHash: evidenceHash,
            programHash: programHash,
            subjectHash: subjectHash,
            scoreBps: scoreBps,
            status: status,
            issuer: issuer,
            anchoredAt: anchoredAt,
            uri: uri
        });

        emit ReceiptAnchored(receiptHash, evidenceHash, programHash, subjectHash, scoreBps, status, issuer, anchoredAt, uri);
    }
}
