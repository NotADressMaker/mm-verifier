// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title TruthChain
 * @notice Append-only hash chain for finalized verification receipts.
 */
contract TruthChain {
    bytes32 public truthHead;
    mapping(bytes32 => bytes32) public prevByBlock; // blockHash -> prevHash
    mapping(uint256 => bytes32) public taskToBlock; // taskId -> blockHash

    address public marketplace;

    event TruthBlockAppended(
        uint256 indexed taskId,
        bytes32 indexed blockHash,
        bytes32 prevHash,
        bytes32 claimHash
    );
    event TruthHeadUpdated(bytes32 oldHead, bytes32 newHead);
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

    function appendTruthBlock(
        uint256 taskId,
        bytes32 claimHash,
        bytes32 outcomeHash,
        bytes32 evidenceBundleHash,
        bytes32 programHash
    ) external onlyMarketplace returns (bytes32 blockHash) {
        require(taskToBlock[taskId] == bytes32(0), "task already recorded");

        bytes32 prevHash = truthHead;
        blockHash = keccak256(
            abi.encode(
                bytes32("MMV_TRUTH_BLOCK_V1"),
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
        truthHead = blockHash;

        emit TruthBlockAppended(taskId, blockHash, prevHash, claimHash);
        emit TruthHeadUpdated(prevHash, blockHash);
    }
}
