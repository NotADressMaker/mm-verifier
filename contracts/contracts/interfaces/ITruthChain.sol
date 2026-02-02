// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ITruthChain {
    function appendTruthBlock(
        uint256 taskId,
        bytes32 claimHash,
        bytes32 outcomeHash,
        bytes32 evidenceBundleHash,
        bytes32 programHash
    ) external returns (bytes32 blockHash);
}
