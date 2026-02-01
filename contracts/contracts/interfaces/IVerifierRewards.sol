// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IVerifierRewards {
    function onTaskFinalized(uint256 taskId) external;
}
