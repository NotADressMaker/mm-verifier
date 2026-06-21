// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/**
 * @title MAMVAttestation
 * @notice Verifies off-chain Multi-Agent Model Verification attestations (EIP-712)
 */
contract MAMVAttestation is Ownable, EIP712 {
    using ECDSA for bytes32;

    struct Attestation {
        bytes32 taskId;
        bytes32 inputHash;
        bytes32 selectedOutputHash;
        bytes32 verifierVersionHash;
        bytes32 configHash;
        uint256 timestamp;
        uint256 expiresAt;
        uint256 score;
        bool passed;
    }

    bytes32 public constant ATTESTATION_TYPEHASH =
        keccak256(
            "Attestation(bytes32 taskId,bytes32 inputHash,bytes32 selectedOutputHash,bytes32 verifierVersionHash,bytes32 configHash,uint256 timestamp,uint256 expiresAt,uint256 score,bool passed)"
        );

    mapping(address => bool) public trustedSigners;
    mapping(bytes32 => bool) public usedTaskIds;
    uint256 public quorum;

    event SignerAdded(address indexed signer);
    event SignerRemoved(address indexed signer);
    event QuorumUpdated(uint256 quorum);
    event AttestationConsumed(bytes32 indexed taskId, bytes32 indexed inputHash, bytes32 selectedOutputHash);

    constructor(uint256 initialQuorum) EIP712("MMVVerifier", "1") Ownable(msg.sender) {
        require(initialQuorum > 0, "Quorum must be > 0");
        quorum = initialQuorum;
    }

    function addSigner(address signer) external onlyOwner {
        require(signer != address(0), "Invalid signer");
        require(!trustedSigners[signer], "Signer already trusted");
        trustedSigners[signer] = true;
        emit SignerAdded(signer);
    }

    function removeSigner(address signer) external onlyOwner {
        require(trustedSigners[signer], "Signer not trusted");
        trustedSigners[signer] = false;
        emit SignerRemoved(signer);
    }

    function updateQuorum(uint256 newQuorum) external onlyOwner {
        require(newQuorum > 0, "Quorum must be > 0");
        quorum = newQuorum;
        emit QuorumUpdated(newQuorum);
    }

    function _hashAttestation(Attestation calldata attestation) internal view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    ATTESTATION_TYPEHASH,
                    attestation.taskId,
                    attestation.inputHash,
                    attestation.selectedOutputHash,
                    attestation.verifierVersionHash,
                    attestation.configHash,
                    attestation.timestamp,
                    attestation.expiresAt,
                    attestation.score,
                    attestation.passed
                )
            )
        );
    }

    function verifyAttestation(
        Attestation calldata attestation,
        bytes[] calldata signatures
    ) public view returns (bool) {
        if (usedTaskIds[attestation.taskId]) {
            return false;
        }
        if (attestation.expiresAt < block.timestamp) {
            return false;
        }
        if (!attestation.passed) {
            return false;
        }

        bytes32 digest = _hashAttestation(attestation);
        uint256 validSigners = 0;

        for (uint256 i = 0; i < signatures.length; i++) {
            address signer = digest.recover(signatures[i]);
            if (!trustedSigners[signer]) {
                continue;
            }
            bool duplicate = false;
            for (uint256 j = 0; j < i; j++) {
                if (signer == digest.recover(signatures[j])) {
                    duplicate = true;
                    break;
                }
            }
            if (!duplicate) {
                validSigners++;
            }
        }

        return validSigners >= quorum;
    }

    function consumeAttestation(
        Attestation calldata attestation,
        bytes[] calldata signatures
    ) external {
        require(verifyAttestation(attestation, signatures), "Invalid attestation");
        usedTaskIds[attestation.taskId] = true;
        emit AttestationConsumed(
            attestation.taskId,
            attestation.inputHash,
            attestation.selectedOutputHash
        );
    }
}
