// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/Base64.sol";

/**
 * @title ReputationBadges
 * @notice Soulbound NFT badges for verifier achievements
 * @dev Non-transferable NFTs that represent milestones and expertise
 *
 * Badge Types:
 * - EXPERT_VERIFIED: Governance-verified human expert
 * - ACCURACY_GOLD: 95%+ accuracy, 100+ evaluations
 * - ACCURACY_SILVER: 90%+ accuracy, 50+ evaluations
 * - DISPUTE_MASTER: 90%+ dispute win rate, 20+ disputes
 * - EARLY_ADOPTER: First 100 experts to register
 * - DOMAIN_SPECIALIST: Domain-specific expert certification
 *
 * Features:
 * - Soulbound: Cannot be transferred (except burns)
 * - On-chain metadata: SVG generated on-chain
 * - Multi-badge: Users can earn multiple badges
 * - Revokable: Owner can revoke badges if needed
 */
contract ReputationBadges is ERC721, Ownable {
    using Strings for uint256;

    enum BadgeType {
        EXPERT_VERIFIED,     // 0
        ACCURACY_GOLD,       // 1
        ACCURACY_SILVER,     // 2
        DISPUTE_MASTER,      // 3
        EARLY_ADOPTER,       // 4
        DOMAIN_SPECIALIST    // 5
    }

    // Badge metadata
    struct Badge {
        BadgeType badgeType;
        address recipient;
        uint256 mintedAt;
        string metadata; // Optional: domain for DOMAIN_SPECIALIST, etc.
    }

    uint256 public tokenIdCounter;
    mapping(uint256 => Badge) public badges;
    mapping(address => mapping(BadgeType => bool)) public hasBadgeType;
    mapping(address => uint256[]) public userBadges; // All badge token IDs for user

    // Authorized minters (marketplace, registry, etc.)
    mapping(address => bool) public isMinter;

    // Badge colors (for SVG generation)
    mapping(BadgeType => string) public badgeColors;
    mapping(BadgeType => string) public badgeNames;

    event BadgeMinted(
        address indexed recipient,
        BadgeType indexed badgeType,
        uint256 tokenId,
        string metadata
    );
    event BadgeRevoked(uint256 indexed tokenId, address indexed recipient);
    event MinterSet(address indexed minter, bool authorized);

    constructor() ERC721("MM Verify Badges", "MAMV-BADGE") Ownable(msg.sender) {
        // Initialize badge colors and names
        badgeColors[BadgeType.EXPERT_VERIFIED] = "#FFD700";      // Gold
        badgeColors[BadgeType.ACCURACY_GOLD] = "#FFD700";        // Gold
        badgeColors[BadgeType.ACCURACY_SILVER] = "#C0C0C0";      // Silver
        badgeColors[BadgeType.DISPUTE_MASTER] = "#8B00FF";       // Purple
        badgeColors[BadgeType.EARLY_ADOPTER] = "#00D4FF";        // Cyan
        badgeColors[BadgeType.DOMAIN_SPECIALIST] = "#00FF00";    // Green

        badgeNames[BadgeType.EXPERT_VERIFIED] = "Expert Verified";
        badgeNames[BadgeType.ACCURACY_GOLD] = "Gold Accuracy";
        badgeNames[BadgeType.ACCURACY_SILVER] = "Silver Accuracy";
        badgeNames[BadgeType.DISPUTE_MASTER] = "Dispute Master";
        badgeNames[BadgeType.EARLY_ADOPTER] = "Early Adopter";
        badgeNames[BadgeType.DOMAIN_SPECIALIST] = "Domain Specialist";
    }

    /**
     * @notice Authorize address to mint badges
     * @param minter Address to authorize (e.g., marketplace)
     * @param authorized True to authorize, false to revoke
     */
    function setMinter(address minter, bool authorized) external onlyOwner {
        isMinter[minter] = authorized;
        emit MinterSet(minter, authorized);
    }

    /**
     * @notice Mint badge to recipient
     * @param recipient Address receiving badge
     * @param badgeType Type of badge
     * @param metadata Optional metadata string
     */
    function mint(
        address recipient,
        BadgeType badgeType,
        string calldata metadata
    ) external returns (uint256) {
        require(isMinter[msg.sender] || msg.sender == owner(), "Not authorized minter");
        require(!hasBadgeType[recipient][badgeType], "Already has this badge type");

        uint256 tokenId = tokenIdCounter++;

        badges[tokenId] = Badge({
            badgeType: badgeType,
            recipient: recipient,
            mintedAt: block.timestamp,
            metadata: metadata
        });

        hasBadgeType[recipient][badgeType] = true;
        userBadges[recipient].push(tokenId);

        _safeMint(recipient, tokenId);

        emit BadgeMinted(recipient, badgeType, tokenId, metadata);

        return tokenId;
    }

    /**
     * @notice Revoke badge (burn)
     * @param tokenId Token ID to revoke
     */
    function revoke(uint256 tokenId) external onlyOwner {
        require(tokenId < tokenIdCounter, "Invalid token ID");

        Badge memory badge = badges[tokenId];
        address recipient = badge.recipient;

        hasBadgeType[recipient][badge.badgeType] = false;

        // Remove from userBadges array
        uint256[] storage userTokens = userBadges[recipient];
        for (uint256 i = 0; i < userTokens.length; i++) {
            if (userTokens[i] == tokenId) {
                userTokens[i] = userTokens[userTokens.length - 1];
                userTokens.pop();
                break;
            }
        }

        delete badges[tokenId];
        _burn(tokenId);

        emit BadgeRevoked(tokenId, recipient);
    }

    /**
     * @notice Generate on-chain SVG for badge
     * @param tokenId Token ID
     * @return SVG string
     */
    function generateSVG(uint256 tokenId) public view returns (string memory) {
        require(tokenId < tokenIdCounter, "Invalid token ID");

        Badge memory badge = badges[tokenId];
        string memory color = badgeColors[badge.badgeType];
        string memory name = badgeNames[badge.badgeType];

        return string(abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" width="350" height="350" viewBox="0 0 350 350">',
            '<rect width="350" height="350" fill="#1a1a2e"/>',
            '<circle cx="175" cy="120" r="60" fill="', color, '" opacity="0.3"/>',
            '<circle cx="175" cy="120" r="50" fill="', color, '"/>',
            '<text x="175" y="130" text-anchor="middle" fill="white" font-size="40" font-weight="bold">✓</text>',
            '<text x="175" y="220" text-anchor="middle" fill="white" font-size="24" font-weight="bold">',
            name,
            '</text>',
            '<text x="175" y="260" text-anchor="middle" fill="#aaa" font-size="14">MM Verify Protocol</text>',
            '<text x="175" y="290" text-anchor="middle" fill="#888" font-size="12">#', tokenId.toString(), '</text>',
            '</svg>'
        ));
    }

    /**
     * @notice Generate token URI with on-chain metadata
     * @param tokenId Token ID
     * @return Base64-encoded JSON metadata
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(tokenId < tokenIdCounter, "Invalid token ID");

        Badge memory badge = badges[tokenId];
        string memory name = badgeNames[badge.badgeType];
        string memory svg = generateSVG(tokenId);

        string memory json = Base64.encode(bytes(string(abi.encodePacked(
            '{"name": "', name, ' #', tokenId.toString(), '",',
            '"description": "MM Verify Protocol achievement badge - soulbound and non-transferable",',
            '"image": "data:image/svg+xml;base64,', Base64.encode(bytes(svg)), '",',
            '"attributes": [',
            '{"trait_type": "Badge Type", "value": "', name, '"},',
            '{"trait_type": "Minted", "value": "', badge.mintedAt.toString(), '"},',
            '{"trait_type": "Soulbound", "value": "true"}',
            ']}'
        ))));

        return string(abi.encodePacked('data:application/json;base64,', json));
    }

    /**
     * @notice Get all badges for user
     * @param user Address to query
     * @return Array of token IDs
     */
    function getUserBadges(address user) external view returns (uint256[] memory) {
        return userBadges[user];
    }

    /**
     * @notice Soulbound: Block transfers (except mint/burn)
     */
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);

        // Allow minting (from == 0) and burning (to == 0)
        if (from != address(0) && to != address(0)) {
            revert("Soulbound: non-transferable");
        }

        return super._update(to, tokenId, auth);
    }
}
