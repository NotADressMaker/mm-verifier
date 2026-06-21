// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MAMVAnchor
 * @notice Append-only hash chain for finalized verification receipts.
 */
contract MAMVAnchor {
    bytes32 public verificationHead;
    mapping(bytes32 => bytes32) public prevByBlock; // blockHash -> prevHash
    mapping(uint256 => bytes32) public taskToBlock; // taskId -> blockHash

    address public marketplace;

    event VerificationBlockAppended(
        uint256 indexed taskId,
        bytes32 indexed blockHash,
        bytes32 prevHash,
        bytes32 claimHash
    );
    event VerificationHeadUpdated(bytes32 oldHead, bytes32 newHead);
    event MarketplaceSet(address indexed marketplace);

    modifier onlyMarketplace() {
        require(msg.sender == marketplace, "only marketplace");
        _;
    }

    constructor(address _marketplace) {
        require(_marketplace != address(0), "marketplace=0");
        marketplace = _marketplace;
        emit MarketplaceSet(_marketplace);
    }

    function appendVerificationBlock(
        uint256 taskId,
        bytes32 claimHash,
        bytes32 outcomeHash,
        bytes32 evidenceBundleHash,
        bytes32 programHash
    ) external onlyMarketplace returns (bytes32 blockHash) {
        require(taskToBlock[taskId] == bytes32(0), "task already recorded");

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

        emit VerificationBlockAppended(taskId, blockHash, prevHash, claimHash);
        emit VerificationHeadUpdated(prevHash, blockHash);
    }
}
