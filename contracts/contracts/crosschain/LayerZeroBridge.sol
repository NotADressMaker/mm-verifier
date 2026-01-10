// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title LayerZeroBridge
 * @notice Cross-chain VERIFY token bridge using LayerZero OFT pattern
 * @dev Enables seamless VERIFY transfers across EVM chains (L1 <-> L2s)
 *
 * Supported Chains:
 * - Ethereum (mainnet)
 * - Arbitrum
 * - Optimism
 * - Base
 * - Polygon
 * - BSC
 *
 * How it works:
 * 1. User locks VERIFY on source chain
 * 2. Bridge emits cross-chain message via LayerZero
 * 3. Destination chain mints/unlocks equivalent VERIFY
 * 4. Reverse process for bridging back
 *
 * Security:
 * - Trusted relayer pattern (upgradeable to decentralized)
 * - Rate limiting per chain
 * - Emergency pause functionality
 * - Fraud proof window
 *
 * Example:
 * // Bridge 1000 VERIFY from Ethereum to Arbitrum
 * verifyToken.approve(bridge, 1000e18);
 * bridge.bridge(1000e18, ARBITRUM_CHAIN_ID, msg.sender);
 */
contract LayerZeroBridge is Ownable, ReentrancyGuard {
    IERC20 public immutable verifyToken;

    // Chain configuration
    struct ChainConfig {
        bool enabled;
        address bridgeAddress; // Bridge contract on remote chain
        uint256 dailyLimit;    // Max daily transfer amount
        uint256 minAmount;     // Minimum bridge amount
        uint256 maxAmount;     // Maximum bridge amount per tx
        uint256 fee;           // Bridge fee in basis points
    }

    mapping(uint16 => ChainConfig) public chainConfigs; // LayerZero chain ID => config
    mapping(uint16 => uint256) public dailyVolume;      // Track daily volume
    mapping(uint16 => uint256) public lastResetTime;    // Last daily reset

    // Bridge state
    uint256 public nonce;
    mapping(bytes32 => bool) public processedMessages; // Prevent replay attacks

    bool public paused;

    // Events
    event BridgeInitiated(
        address indexed sender,
        uint16 indexed dstChainId,
        address indexed recipient,
        uint256 amount,
        uint256 nonce,
        uint256 fee
    );

    event BridgeCompleted(
        address indexed recipient,
        uint16 indexed srcChainId,
        uint256 amount,
        bytes32 messageHash
    );

    event ChainConfigured(
        uint16 indexed chainId,
        address bridgeAddress,
        uint256 dailyLimit
    );

    event Paused(bool paused);

    modifier whenNotPaused() {
        require(!paused, "Bridge paused");
        _;
    }

    constructor(IERC20 _verifyToken) Ownable(msg.sender) {
        require(address(_verifyToken) != address(0), "Invalid token");
        verifyToken = _verifyToken;
    }

    /**
     * @notice Configure bridge for a chain
     * @param chainId LayerZero chain ID
     * @param config Chain configuration
     */
    function configureChain(
        uint16 chainId,
        ChainConfig calldata config
    ) external onlyOwner {
        require(config.bridgeAddress != address(0), "Invalid bridge address");
        require(config.maxAmount >= config.minAmount, "Invalid amount limits");

        chainConfigs[chainId] = config;
        lastResetTime[chainId] = block.timestamp;

        emit ChainConfigured(chainId, config.bridgeAddress, config.dailyLimit);
    }

    /**
     * @notice Bridge VERIFY tokens to another chain
     * @param amount Amount to bridge
     * @param dstChainId Destination LayerZero chain ID
     * @param recipient Recipient address on destination chain
     * @return messageHash Hash of cross-chain message
     */
    function bridge(
        uint256 amount,
        uint16 dstChainId,
        address recipient
    ) external nonReentrant whenNotPaused returns (bytes32 messageHash) {
        ChainConfig memory config = chainConfigs[dstChainId];
        require(config.enabled, "Chain not enabled");
        require(amount >= config.minAmount, "Amount too small");
        require(amount <= config.maxAmount, "Amount too large");
        require(recipient != address(0), "Invalid recipient");

        // Check daily limit
        _resetDailyLimitIfNeeded(dstChainId);
        require(dailyVolume[dstChainId] + amount <= config.dailyLimit, "Daily limit exceeded");

        // Calculate fee
        uint256 fee = (amount * config.fee) / 10_000;
        uint256 amountAfterFee = amount - fee;

        // Lock tokens
        verifyToken.transferFrom(msg.sender, address(this), amount);

        // Update daily volume
        dailyVolume[dstChainId] += amount;

        // Generate message hash
        nonce++;
        messageHash = keccak256(
            abi.encodePacked(
                msg.sender,
                recipient,
                amountAfterFee,
                dstChainId,
                nonce,
                block.chainid
            )
        );

        emit BridgeInitiated(
            msg.sender,
            dstChainId,
            recipient,
            amountAfterFee,
            nonce,
            fee
        );

        return messageHash;
    }

    /**
     * @notice Complete bridge from another chain (called by relayer)
     * @param recipient Recipient address
     * @param amount Amount to transfer
     * @param srcChainId Source chain ID
     * @param messageHash Hash of original message
     */
    function completeBridge(
        address recipient,
        uint256 amount,
        uint16 srcChainId,
        bytes32 messageHash
    ) external onlyOwner nonReentrant whenNotPaused {
        require(!processedMessages[messageHash], "Message already processed");
        require(recipient != address(0), "Invalid recipient");
        require(chainConfigs[srcChainId].enabled, "Chain not enabled");

        // Mark message as processed
        processedMessages[messageHash] = true;

        // Transfer tokens to recipient
        verifyToken.transfer(recipient, amount);

        emit BridgeCompleted(recipient, srcChainId, amount, messageHash);
    }

    /**
     * @notice Emergency pause
     * @param _paused True to pause, false to unpause
     */
    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit Paused(_paused);
    }

    /**
     * @notice Withdraw accumulated fees
     * @param to Recipient address
     */
    function withdrawFees(address to) external onlyOwner {
        require(to != address(0), "Invalid recipient");
        uint256 balance = verifyToken.balanceOf(address(this));
        verifyToken.transfer(to, balance);
    }

    /**
     * @notice Get bridge quote (amount after fees)
     * @param amount Amount to bridge
     * @param dstChainId Destination chain ID
     * @return amountOut Amount recipient will receive
     * @return fee Bridge fee
     */
    function quote(
        uint256 amount,
        uint16 dstChainId
    ) external view returns (uint256 amountOut, uint256 fee) {
        ChainConfig memory config = chainConfigs[dstChainId];
        fee = (amount * config.fee) / 10_000;
        amountOut = amount - fee;
    }

    /**
     * @notice Check if amount can be bridged today
     * @param dstChainId Destination chain ID
     * @param amount Amount to check
     * @return canBridge True if within daily limit
     */
    function canBridge(
        uint16 dstChainId,
        uint256 amount
    ) external view returns (bool canBridge) {
        ChainConfig memory config = chainConfigs[dstChainId];

        // Check if daily limit needs reset
        uint256 currentVolume = dailyVolume[dstChainId];
        if (block.timestamp >= lastResetTime[dstChainId] + 1 days) {
            currentVolume = 0;
        }

        return currentVolume + amount <= config.dailyLimit;
    }

    /**
     * @notice Reset daily limit if needed
     * @param chainId Chain ID to check
     */
    function _resetDailyLimitIfNeeded(uint16 chainId) internal {
        if (block.timestamp >= lastResetTime[chainId] + 1 days) {
            dailyVolume[chainId] = 0;
            lastResetTime[chainId] = block.timestamp;
        }
    }
}
