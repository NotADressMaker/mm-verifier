// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IValidationRegistry.sol";

contract MockValidationRegistry is IValidationRegistry {
    struct Response {
        uint8 score;
        string responseURI;
        bytes32 responseHash;
        string tag;
        bool exists;
    }

    mapping(bytes32 => Response) private responses;

    event ValidationRequested(
        address indexed validator,
        uint256 indexed agentId,
        string requestURI,
        bytes32 requestHash
    );

    event ValidationResponded(
        bytes32 indexed requestHash,
        uint8 score,
        string responseURI,
        bytes32 responseHash,
        string tag
    );

    function validationRequest(
        address validator,
        uint256 agentId,
        string calldata requestURI,
        bytes32 requestHash
    ) external override {
        emit ValidationRequested(validator, agentId, requestURI, requestHash);
    }

    function submitResponse(
        bytes32 requestHash,
        uint8 score,
        string calldata responseURI,
        bytes32 responseHash,
        string calldata tag
    ) external {
        responses[requestHash] = Response({
            score: score,
            responseURI: responseURI,
            responseHash: responseHash,
            tag: tag,
            exists: true
        });

        emit ValidationResponded(requestHash, score, responseURI, responseHash, tag);
    }

    function getValidationResponse(bytes32 requestHash)
        external
        view
        override
        returns (
            uint8 score,
            string memory responseURI,
            bytes32 responseHash,
            string memory tag,
            bool exists
        )
    {
        Response memory response = responses[requestHash];
        return (
            response.score,
            response.responseURI,
            response.responseHash,
            response.tag,
            response.exists
        );
    }
}
