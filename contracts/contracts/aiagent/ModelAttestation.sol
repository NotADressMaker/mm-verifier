// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title ModelAttestation
 * @notice Verify and attest to AI model weights, versions, and behavior
 * @dev On-chain registry of verified model hashes and capabilities
 *
 * Attestation Types:
 * 1. Model Weights Hash (SHA256 of weights file)
 * 2. Model Version (semantic versioning)
 * 3. Training Data Hash (provenance)
 * 4. Capability Attestation (domain expertise)
 * 5. Behavioral Guarantees (safety, alignment)
 *
 * Attestation Authority:
 * - Protocol governance
 * - Third-party auditors (e.g., Trail of Bits)
 * - Academic institutions
 * - Model providers (OpenAI, Anthropic, etc.)
 *
 * Use Cases:
 * 1. Verify agent is running claimed model
 * 2. Prove model hasn't been tampered with
 * 3. Track model lineage/provenance
 * 4. Certify safety properties
 * 5. Enable reproducible evaluations
 *
 * Example:
 * ```
 * // Attest to GPT-4 model
 * attestation.attestModel(
 *     "GPT-4-Turbo",
 *     0x1234...abcd,  // Model hash
 *     "1.106",
 *     AttestationType.COMMERCIAL_API,
 *     proof
 * );
 * ```
 */
contract ModelAttestation is Ownable {
    using ECDSA for bytes32;

    // Attestation types
    enum AttestationType {
        WEIGHTS_HASH,       // 0 - Hash of model weights
        VERSION,            // 1 - Version number
        TRAINING_DATA,      // 2 - Training data hash
        CAPABILITY,         // 3 - Capability certification
        SAFETY,             // 4 - Safety properties
        COMMERCIAL_API      // 5 - Commercial API endpoint
    }

    // Attestation status
    enum AttestationStatus {
        Pending,            // 0 - Awaiting verification
        Verified,           // 1 - Verified by authority
        Disputed,           // 2 - Under dispute
        Revoked             // 3 - Revoked (compromised)
    }

    // Attestation record
    struct Attestation {
        string modelName;              // Model name
        bytes32 modelHash;             // Model identifier hash
        string version;                // Model version
        AttestationType attestationType;
        AttestationStatus status;
        address attester;              // Who attested
        uint256 timestamp;             // Attestation time
        string metadataURI;            // IPFS/Arweave link
        bytes signature;               // Cryptographic signature
        string[] capabilities;         // Claimed capabilities
        uint256 expiresAt;             // Expiration (0 = never)
    }

    // Trusted attesters
    mapping(address => bool) public trustedAttesters;
    mapping(address => string) public attesterNames; // Attester identity

    // Attestations
    mapping(bytes32 => Attestation) public attestations; // attestationId => Attestation
    mapping(bytes32 => bytes32[]) public modelAttestations; // modelHash => attestationIds
    bytes32[] public attestationList;

    // Model registry
    mapping(bytes32 => bool) public verifiedModels;
    mapping(string => bytes32) public modelNameToHash;

    // Events
    event AttesterAdded(address indexed attester, string name);
    event AttesterRemoved(address indexed attester);

    event ModelAttested(
        bytes32 indexed attestationId,
        bytes32 indexed modelHash,
        string modelName,
        AttestationType attestationType,
        address indexed attester
    );

    event AttestationUpdated(
        bytes32 indexed attestationId,
        AttestationStatus status
    );

    event AttestationRevoked(
        bytes32 indexed attestationId,
        string reason
    );

    constructor() Ownable(msg.sender) {
        // Owner is trusted attester by default
        trustedAttesters[msg.sender] = true;
        attesterNames[msg.sender] = "Protocol Governance";
    }

    /**
     * @notice Add trusted attester
     * @param attester Attester address
     * @param name Attester name
     */
    function addAttester(address attester, string calldata name) external onlyOwner {
        require(attester != address(0), "Invalid attester");
        require(!trustedAttesters[attester], "Already attester");

        trustedAttesters[attester] = true;
        attesterNames[attester] = name;

        emit AttesterAdded(attester, name);
    }

    /**
     * @notice Remove trusted attester
     * @param attester Attester address
     */
    function removeAttester(address attester) external onlyOwner {
        require(trustedAttesters[attester], "Not attester");

        trustedAttesters[attester] = false;
        delete attesterNames[attester];

        emit AttesterRemoved(attester);
    }

    /**
     * @notice Attest to model
     * @param modelName Model name
     * @param modelHash Model hash
     * @param version Model version
     * @param attestationType Type of attestation
     * @param metadataURI Metadata URI
     * @param capabilities Array of capabilities
     * @param expiresAt Expiration timestamp (0 = never)
     * @param signature Cryptographic signature
     * @return attestationId Generated attestation ID
     */
    function attestModel(
        string calldata modelName,
        bytes32 modelHash,
        string calldata version,
        AttestationType attestationType,
        string calldata metadataURI,
        string[] calldata capabilities,
        uint256 expiresAt,
        bytes calldata signature
    ) external returns (bytes32 attestationId) {
        require(trustedAttesters[msg.sender], "Not trusted attester");
        require(modelHash != bytes32(0), "Invalid model hash");
        require(bytes(modelName).length > 0, "Name required");

        // Generate attestation ID
        attestationId = keccak256(
            abi.encodePacked(
                modelHash,
                version,
                attestationType,
                msg.sender,
                block.timestamp
            )
        );

        // Create attestation
        attestations[attestationId] = Attestation({
            modelName: modelName,
            modelHash: modelHash,
            version: version,
            attestationType: attestationType,
            status: AttestationStatus.Verified, // Trusted attester = auto-verify
            attester: msg.sender,
            timestamp: block.timestamp,
            metadataURI: metadataURI,
            signature: signature,
            capabilities: capabilities,
            expiresAt: expiresAt
        });

        // Add to indices
        attestationList.push(attestationId);
        modelAttestations[modelHash].push(attestationId);
        verifiedModels[modelHash] = true;
        modelNameToHash[modelName] = modelHash;

        emit ModelAttested(
            attestationId,
            modelHash,
            modelName,
            attestationType,
            msg.sender
        );

        return attestationId;
    }

    /**
     * @notice Update attestation status
     * @param attestationId Attestation ID
     * @param status New status
     */
    function updateAttestationStatus(
        bytes32 attestationId,
        AttestationStatus status
    ) external onlyOwner {
        require(attestations[attestationId].timestamp > 0, "Attestation not found");

        attestations[attestationId].status = status;

        // If revoked, mark model as unverified if no other valid attestations
        if (status == AttestationStatus.Revoked) {
            bytes32 modelHash = attestations[attestationId].modelHash;
            if (!_hasValidAttestation(modelHash)) {
                verifiedModels[modelHash] = false;
            }
        }

        emit AttestationUpdated(attestationId, status);
    }

    /**
     * @notice Revoke attestation
     * @param attestationId Attestation ID
     * @param reason Reason for revocation
     */
    function revokeAttestation(
        bytes32 attestationId,
        string calldata reason
    ) external onlyOwner {
        require(attestations[attestationId].timestamp > 0, "Attestation not found");

        attestations[attestationId].status = AttestationStatus.Revoked;

        bytes32 modelHash = attestations[attestationId].modelHash;
        if (!_hasValidAttestation(modelHash)) {
            verifiedModels[modelHash] = false;
        }

        emit AttestationRevoked(attestationId, reason);
    }

    /**
     * @notice Verify model is attested
     * @param modelHash Model hash
     * @return verified True if model has valid attestation
     */
    function isModelVerified(bytes32 modelHash) external view returns (bool) {
        return verifiedModels[modelHash] && _hasValidAttestation(modelHash);
    }

    /**
     * @notice Get attestations for model
     * @param modelHash Model hash
     * @return attestationIds Array of attestation IDs
     */
    function getModelAttestations(bytes32 modelHash)
        external
        view
        returns (bytes32[] memory)
    {
        return modelAttestations[modelHash];
    }

    /**
     * @notice Get attestation details
     * @param attestationId Attestation ID
     * @return attestation Attestation struct
     */
    function getAttestation(bytes32 attestationId)
        external
        view
        returns (Attestation memory)
    {
        return attestations[attestationId];
    }

    /**
     * @notice Get model hash by name
     * @param modelName Model name
     * @return modelHash Model hash
     */
    function getModelHashByName(string calldata modelName)
        external
        view
        returns (bytes32)
    {
        return modelNameToHash[modelName];
    }

    /**
     * @notice Verify attestation signature
     * @param attestationId Attestation ID
     * @param message Message that was signed
     * @return valid True if signature valid
     */
    function verifySignature(
        bytes32 attestationId,
        bytes32 message
    ) external view returns (bool valid) {
        Attestation memory att = attestations[attestationId];

        if (att.signature.length == 0) return false;

        address recovered = message.toEthSignedMessageHash().recover(att.signature);
        return recovered == att.attester;
    }

    /**
     * @notice Get all attestations (paginated)
     * @param offset Start index
     * @param limit Max results
     * @return attestationIds Array of attestation IDs
     */
    function getAllAttestations(uint256 offset, uint256 limit)
        external
        view
        returns (bytes32[] memory attestationIds)
    {
        uint256 total = attestationList.length;
        if (offset >= total) {
            return new bytes32[](0);
        }

        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }

        uint256 count = end - offset;
        attestationIds = new bytes32[](count);

        for (uint256 i = 0; i < count; i++) {
            attestationIds[i] = attestationList[offset + i];
        }
    }

    /**
     * @notice Get verified models with capabilities
     * @param capability Capability to filter by
     * @return models Array of model hashes
     */
    function getVerifiedModelsByCapability(string calldata capability)
        external
        view
        returns (bytes32[] memory models)
    {
        uint256 count = 0;

        // Count matching models
        for (uint256 i = 0; i < attestationList.length; i++) {
            Attestation memory att = attestations[attestationList[i]];
            if (att.status == AttestationStatus.Verified &&
                _hasCapability(att.capabilities, capability)) {
                count++;
            }
        }

        // Build array
        models = new bytes32[](count);
        uint256 idx = 0;

        for (uint256 i = 0; i < attestationList.length; i++) {
            Attestation memory att = attestations[attestationList[i]];
            if (att.status == AttestationStatus.Verified &&
                _hasCapability(att.capabilities, capability)) {
                models[idx] = att.modelHash;
                idx++;
            }
        }
    }

    /**
     * @notice Check if model has valid attestation
     * @param modelHash Model hash
     * @return hasValid True if has valid attestation
     */
    function _hasValidAttestation(bytes32 modelHash) internal view returns (bool) {
        bytes32[] memory attestationIds = modelAttestations[modelHash];

        for (uint256 i = 0; i < attestationIds.length; i++) {
            Attestation memory att = attestations[attestationIds[i]];

            if (att.status == AttestationStatus.Verified) {
                // Check expiration
                if (att.expiresAt == 0 || att.expiresAt > block.timestamp) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * @notice Check if capability is in array
     * @param capabilities Array of capabilities
     * @param capability Capability to check
     * @return hasIt True if found
     */
    function _hasCapability(
        string[] memory capabilities,
        string calldata capability
    ) internal pure returns (bool) {
        for (uint256 i = 0; i < capabilities.length; i++) {
            if (keccak256(bytes(capabilities[i])) == keccak256(bytes(capability))) {
                return true;
            }
        }
        return false;
    }

    /**
     * @notice Get total attestation count
     * @return count Total attestations
     */
    function getAttestationCount() external view returns (uint256) {
        return attestationList.length;
    }
}
