// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IIdentityRegistry.sol";

contract MockIdentityRegistry is IIdentityRegistry {
    struct AgentInfo {
        address owner;
        string uri;
        address wallet;
    }

    mapping(uint256 => AgentInfo) private agents;

    function setAgent(
        uint256 agentId,
        address owner,
        string calldata uri
    ) external {
        agents[agentId].owner = owner;
        agents[agentId].uri = uri;
    }

    function setAgentWallet(uint256 agentId, address wallet) external {
        agents[agentId].wallet = wallet;
    }

    function ownerOf(uint256 agentId) external view override returns (address) {
        return agents[agentId].owner;
    }

    function getAgentURI(uint256 agentId) external view override returns (string memory) {
        return agents[agentId].uri;
    }

    function agentWallet(uint256 agentId) external view override returns (address) {
        return agents[agentId].wallet;
    }
}
