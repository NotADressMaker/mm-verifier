// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IValidationRegistry {
    function validationRequest(
        address validator,
        uint256 agentId,
        string calldata requestURI,
        bytes32 requestHash
    ) external;

    function getValidationResponse(bytes32 requestHash)
        external
        view
        returns (
            uint8 score,
            string memory responseURI,
            bytes32 responseHash,
            string memory tag,
            bool exists
        );
}
