// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IMAMVAnchor {
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

    function anchorReceipt(
        bytes32 receiptHash,
        bytes32 evidenceHash,
        bytes32 programHash,
        bytes32 subjectHash,
        uint16 scoreBps,
        uint8 status,
        string calldata uri
    ) external;

    function isAnchored(bytes32 receiptHash) external view returns (bool);

    function getAnchor(bytes32 receiptHash) external view returns (AnchorRecord memory);

    function verifyAnchor(
        bytes32 receiptHash,
        bytes32 evidenceHash,
        bytes32 programHash,
        bytes32 subjectHash,
        uint16 scoreBps,
        uint8 status,
        address issuer
    ) external view returns (bool);

    function appendVerificationBlock(
        uint256 taskId,
        bytes32 claimHash,
        bytes32 outcomeHash,
        bytes32 evidenceBundleHash,
        bytes32 programHash
    ) external returns (bytes32 blockHash);
}
