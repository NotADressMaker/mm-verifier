// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IMAMVAnchor {
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

    function anchorReceipt(
        bytes32 receiptHash,
        bytes32 evidenceHash,
        bytes32 programHash,
        bytes32 subjectHash,
        uint16 scoreBps,
        string calldata uri
    ) external;

    function isAnchored(bytes32 receiptHash) external view returns (bool);

    function getAnchor(bytes32 receiptHash) external view returns (AnchorRecord memory);

    function appendVerificationBlock(
        uint256 taskId,
        bytes32 claimHash,
        bytes32 outcomeHash,
        bytes32 evidenceBundleHash,
        bytes32 programHash
    ) external returns (bytes32 blockHash);
}
