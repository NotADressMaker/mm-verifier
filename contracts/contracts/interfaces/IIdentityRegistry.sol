// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IIdentityRegistry {
    function ownerOf(uint256 agentId) external view returns (address);

    function getAgentURI(uint256 agentId) external view returns (string memory);

    function agentWallet(uint256 agentId) external view returns (address);
}
