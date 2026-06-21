// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/Base64.sol";

/**
 * @title DynamicExpertNFT
 * @notice Dynamic NFT that updates with expert's reputation
 * @dev NFT image/metadata updates automatically based on marketplace stats
 *
 * Features:
 * - Dynamic SVG: Updates with real-time stats
 * - Soulbound option: Can be made non-transferable
 * - On-chain metadata: No IPFS dependency
 * - Stats displayed: Accuracy, total evals, disputes won
 *
 * Example display:
 * ┌─────────────────────┐
 * │   Expert #123       │
 * │                     │
 * │   Accuracy: 95%     │
 * │   Evals: 150        │
 * │   Disputes: 45/50   │
 * │   Active: Yes       │
 * └─────────────────────┘
 */
contract DynamicExpertNFT is ERC721, Ownable {
    using Strings for uint256;

    // Reference to marketplace for stats
    address public marketplace;
    address public auditorRegistry;

    // NFT state
    uint256 public tokenIdCounter;
    mapping(uint256 => address) public tokenToExpert; // tokenId => expert address
    mapping(address => uint256) public expertToToken; // expert => tokenId

    bool public isSoulbound; // If true, NFTs are non-transferable

    event ExpertNFTMinted(address indexed expert, uint256 tokenId);
    event MarketplaceSet(address indexed marketplace);
    event RegistrySet(address indexed registry);
    event SoulboundToggled(bool isSoulbound);

    constructor(
        address _marketplace,
        address _auditorRegistry
    ) ERC721("MM Verify Expert", "MAMV-EXPERT") Ownable(msg.sender) {
        marketplace = _marketplace;
        auditorRegistry = _auditorRegistry;
        isSoulbound = true; // Default to soulbound
    }

    /**
     * @notice Set marketplace address
     * @param _marketplace New marketplace address
     */
    function setMarketplace(address _marketplace) external onlyOwner {
        marketplace = _marketplace;
        emit MarketplaceSet(_marketplace);
    }

    /**
     * @notice Set auditor registry address
     * @param _auditorRegistry New registry address
     */
    function setAuditorRegistry(address _auditorRegistry) external onlyOwner {
        auditorRegistry = _auditorRegistry;
        emit RegistrySet(_auditorRegistry);
    }

    /**
     * @notice Toggle soulbound status
     * @param _isSoulbound True for soulbound, false for transferable
     */
    function setSoulbound(bool _isSoulbound) external onlyOwner {
        isSoulbound = _isSoulbound;
        emit SoulboundToggled(_isSoulbound);
    }

    /**
     * @notice Mint expert NFT
     * @param expert Address of expert
     */
    function mint(address expert) external returns (uint256) {
        require(msg.sender == owner() || msg.sender == auditorRegistry, "Not authorized");
        require(expertToToken[expert] == 0, "Expert already has NFT");

        uint256 tokenId = ++tokenIdCounter;

        tokenToExpert[tokenId] = expert;
        expertToToken[expert] = tokenId;

        _safeMint(expert, tokenId);

        emit ExpertNFTMinted(expert, tokenId);

        return tokenId;
    }

    /**
     * @notice Generate dynamic SVG based on expert stats
     * @param tokenId Token ID
     * @return SVG string
     */
    function generateSVG(uint256 tokenId) public view returns (string memory) {
        require(tokenId > 0 && tokenId <= tokenIdCounter, "Invalid token ID");

        address expert = tokenToExpert[tokenId];

        // Get stats from marketplace (if available)
        uint256 totalEvals;
        uint256 accuracyBps;
        uint256 disputes;
        uint256 disputeWins;

        // Try to get stats (using low-level call to handle missing functions gracefully)
        if (marketplace != address(0)) {
            (bool success, bytes memory data) = marketplace.staticcall(
                abi.encodeWithSignature("getVerifierReputation(address)", expert)
            );

            if (success && data.length >= 32 * 7) {
                (totalEvals, , accuracyBps, , disputes, disputeWins, , ,) = abi.decode(
                    data,
                    (uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256)
                );
            }
        }

        // Determine status color
        string memory statusColor = "#00FF00"; // Green (active)
        if (accuracyBps < 8000) {
            statusColor = "#FFD700"; // Yellow (warning)
        }
        if (accuracyBps < 6000) {
            statusColor = "#FF0000"; // Red (low performance)
        }

        return string(abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" width="350" height="450" viewBox="0 0 350 450">',
            '<rect width="350" height="450" fill="#1a1a2e"/>',
            '<rect x="20" y="20" width="310" height="410" rx="15" fill="#2a2a4e" stroke="', statusColor, '" stroke-width="3"/>',
            '<text x="175" y="70" text-anchor="middle" fill="white" font-size="28" font-weight="bold">Expert #', tokenId.toString(), '</text>',
            '<line x1="40" y1="90" x2="310" y2="90" stroke="', statusColor, '" stroke-width="2"/>',
            '<text x="60" y="140" fill="#00D4FF" font-size="18" font-weight="bold">Accuracy:</text>',
            '<text x="290" y="140" text-anchor="end" fill="white" font-size="20" font-weight="bold">',
            (accuracyBps / 100).toString(), '%</text>',
            '<text x="60" y="190" fill="#00D4FF" font-size="18" font-weight="bold">Evaluations:</text>',
            '<text x="290" y="190" text-anchor="end" fill="white" font-size="20" font-weight="bold">',
            totalEvals.toString(), '</text>',
            '<text x="60" y="240" fill="#00D4FF" font-size="18" font-weight="bold">Disputes Won:</text>',
            '<text x="290" y="240" text-anchor="end" fill="white" font-size="20" font-weight="bold">',
            disputeWins.toString(), '/', disputes.toString(), '</text>',
            '<text x="60" y="290" fill="#00D4FF" font-size="18" font-weight="bold">Status:</text>',
            '<circle cx="275" cy="283" r="8" fill="', statusColor, '"/>',
            '<text x="175" y="370" text-anchor="middle" fill="#888" font-size="14">MM Verify Protocol</text>',
            '<text x="175" y="395" text-anchor="middle" fill="#666" font-size="12">Dynamic Expert Profile</text>',
            '</svg>'
        ));
    }

    /**
     * @notice Generate token URI with dynamic metadata
     * @param tokenId Token ID
     * @return Base64-encoded JSON metadata
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(tokenId > 0 && tokenId <= tokenIdCounter, "Invalid token ID");

        address expert = tokenToExpert[tokenId];
        string memory svg = generateSVG(tokenId);

        // Get accuracy for name
        uint256 accuracyBps = 0;
        if (marketplace != address(0)) {
            (bool success, bytes memory data) = marketplace.staticcall(
                abi.encodeWithSignature("getVerifierReputation(address)", expert)
            );
            if (success && data.length >= 32 * 3) {
                (, , accuracyBps, , , , , ,) = abi.decode(
                    data,
                    (uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256)
                );
            }
        }

        string memory json = Base64.encode(bytes(string(abi.encodePacked(
            '{"name": "Expert #', tokenId.toString(), ' (', (accuracyBps / 100).toString(), '% Accuracy)",',
            '"description": "Dynamic MM Verify expert profile - updates automatically with performance",',
            '"image": "data:image/svg+xml;base64,', Base64.encode(bytes(svg)), '",',
            '"attributes": [',
            '{"trait_type": "Expert ID", "value": "', tokenId.toString(), '"},',
            '{"trait_type": "Dynamic", "value": "true"},',
            '{"trait_type": "Soulbound", "value": "', isSoulbound ? 'true' : 'false', '"}',
            ']}'
        ))));

        return string(abi.encodePacked('data:application/json;base64,', json));
    }

    /**
     * @notice Soulbound: Block transfers if enabled
     */
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);

        // If soulbound, only allow minting (from == 0) and burning (to == 0)
        if (isSoulbound && from != address(0) && to != address(0)) {
            revert("Soulbound: non-transferable");
        }

        return super._update(to, tokenId, auth);
    }
}
