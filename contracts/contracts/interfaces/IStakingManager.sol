// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IStakingManager {
    function hasVerifierStake(address staker) external view returns (bool);
    function lockStake(address staker, uint256 amount, bytes32 jobId) external;
    function unlockStake(address staker, uint256 amount, bytes32 jobId) external;
    function slash(address staker, string calldata reason) external returns (uint256);
}
