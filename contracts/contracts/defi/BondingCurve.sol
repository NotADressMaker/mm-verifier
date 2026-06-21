// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title BondingCurve
 * @notice Algorithmic price discovery for MAMV token
 * @dev Bonding curve AMM with linear price function
 *
 * Price Function:
 * price = basePrice + (supply * slope)
 *
 * Example:
 * - basePrice = 0.01 WETH
 * - slope = 0.000001
 * - At 0 supply: price = 0.01 WETH
 * - At 10K supply: price = 0.02 WETH
 * - At 100K supply: price = 0.11 WETH
 *
 * Benefits:
 * - Always available liquidity
 * - Predictable pricing
 * - No impermanent loss (for protocol)
 * - Price discovery via market forces
 *
 * Use Cases:
 * 1. Early token distribution
 * 2. Price floor mechanism
 * 3. Treasury buyback/sell
 * 4. Liquidity bootstrapping
 *
 * Example Usage:
 * ```
 * // Buy 100 MAMV
 * uint256 cost = bondingCurve.getBuyPrice(100e18);
 * bondingCurve.buy{value: cost}(100e18);
 *
 * // Sell 50 MAMV
 * verifyToken.approve(bondingCurve, 50e18);
 * bondingCurve.sell(50e18);
 * ```
 */
contract BondingCurve is Ownable, ReentrancyGuard {
    IERC20 public immutable verifyToken;

    // Curve parameters
    uint256 public basePrice;     // Base price in wei (e.g., 0.01 ETH)
    uint256 public slope;         // Price increase per token
    uint256 public supply;        // Tokens sold via curve

    // Fee configuration
    uint256 public buyFeeBps = 200;   // 2% buy fee
    uint256 public sellFeeBps = 200;  // 2% sell fee
    address public treasury;

    // Limits
    uint256 public maxSupply;         // Max tokens to sell
    bool public buyEnabled = true;
    bool public sellEnabled = true;

    // Events
    event TokensBought(
        address indexed buyer,
        uint256 amount,
        uint256 cost,
        uint256 fee,
        uint256 newSupply
    );

    event TokensSold(
        address indexed seller,
        uint256 amount,
        uint256 proceeds,
        uint256 fee,
        uint256 newSupply
    );

    event CurveParametersUpdated(
        uint256 basePrice,
        uint256 slope,
        uint256 maxSupply
    );

    event FeesUpdated(uint256 buyFeeBps, uint256 sellFeeBps);
    event TradingToggled(bool buyEnabled, bool sellEnabled);

    constructor(
        IERC20 _verifyToken,
        uint256 _basePrice,
        uint256 _slope,
        uint256 _maxSupply,
        address _treasury
    ) Ownable(msg.sender) {
        require(address(_verifyToken) != address(0), "Invalid token");
        require(_treasury != address(0), "Invalid treasury");

        verifyToken = _verifyToken;
        basePrice = _basePrice;
        slope = _slope;
        maxSupply = _maxSupply;
        treasury = _treasury;
    }

    /**
     * @notice Buy MAMV tokens
     * @param amount Amount of MAMV to buy
     * @return cost Total cost in WETH
     */
    function buy(uint256 amount) external payable nonReentrant returns (uint256 cost) {
        require(buyEnabled, "Buying disabled");
        require(amount > 0, "Cannot buy 0");
        require(supply + amount <= maxSupply, "Exceeds max supply");

        // Calculate cost
        cost = getBuyPrice(amount);
        require(msg.value >= cost, "Insufficient payment");

        // Calculate fee
        uint256 fee = (cost * buyFeeBps) / 10_000;
        uint256 netCost = cost - fee;

        // Update supply
        supply += amount;

        // Transfer tokens to buyer
        verifyToken.transfer(msg.sender, amount);

        // Send fee to treasury
        if (fee > 0) {
            payable(treasury).transfer(fee);
        }

        // Refund excess
        if (msg.value > cost) {
            payable(msg.sender).transfer(msg.value - cost);
        }

        emit TokensBought(msg.sender, amount, cost, fee, supply);

        return cost;
    }

    /**
     * @notice Sell MAMV tokens
     * @param amount Amount of MAMV to sell
     * @return proceeds Amount of WETH received
     */
    function sell(uint256 amount) external nonReentrant returns (uint256 proceeds) {
        require(sellEnabled, "Selling disabled");
        require(amount > 0, "Cannot sell 0");
        require(amount <= supply, "Exceeds circulating supply");

        // Calculate proceeds
        proceeds = getSellPrice(amount);
        require(address(this).balance >= proceeds, "Insufficient liquidity");

        // Calculate fee
        uint256 fee = (proceeds * sellFeeBps) / 10_000;
        uint256 netProceeds = proceeds - fee;

        // Update supply
        supply -= amount;

        // Transfer tokens from seller
        verifyToken.transferFrom(msg.sender, address(this), amount);

        // Transfer WETH to seller
        payable(msg.sender).transfer(netProceeds);

        // Send fee to treasury
        if (fee > 0) {
            payable(treasury).transfer(fee);
        }

        emit TokensSold(msg.sender, amount, netProceeds, fee, supply);

        return netProceeds;
    }

    /**
     * @notice Get buy price for amount
     * @param amount Amount of MAMV tokens
     * @return price Total cost in wei
     */
    function getBuyPrice(uint256 amount) public view returns (uint256 price) {
        // Integral of price function from supply to supply + amount
        // price = basePrice * amount + slope * (supply * amount + amount^2 / 2)

        uint256 s0 = supply;
        uint256 s1 = supply + amount;

        price = (basePrice * amount) +
                (slope * (s0 * amount + (amount * amount) / 2)) / 1e18;

        return price;
    }

    /**
     * @notice Get sell price for amount
     * @param amount Amount of MAMV tokens
     * @return price Total proceeds in wei
     */
    function getSellPrice(uint256 amount) public view returns (uint256 price) {
        // Same as buy price but in reverse
        require(amount <= supply, "Amount exceeds supply");

        uint256 s0 = supply - amount;
        uint256 s1 = supply;

        price = (basePrice * amount) +
                (slope * (s0 * amount + (amount * amount) / 2)) / 1e18;

        return price;
    }

    /**
     * @notice Get current spot price
     * @return spotPrice Current price per token in wei
     */
    function getSpotPrice() external view returns (uint256 spotPrice) {
        return basePrice + (slope * supply) / 1e18;
    }

    /**
     * @notice Get price for buy and sell
     * @param amount Amount to quote
     * @return buyPrice Price to buy amount
     * @return sellPrice Price to sell amount
     * @return buyAfterFee Buy price after fees
     * @return sellAfterFee Sell price after fees
     */
    function getQuote(uint256 amount) external view returns (
        uint256 buyPrice,
        uint256 sellPrice,
        uint256 buyAfterFee,
        uint256 sellAfterFee
    ) {
        buyPrice = getBuyPrice(amount);
        sellPrice = getSellPrice(amount);

        buyAfterFee = buyPrice + (buyPrice * buyFeeBps) / 10_000;
        sellAfterFee = sellPrice - (sellPrice * sellFeeBps) / 10_000;
    }

    /**
     * @notice Update curve parameters
     * @param _basePrice New base price
     * @param _slope New slope
     * @param _maxSupply New max supply
     */
    function setCurveParameters(
        uint256 _basePrice,
        uint256 _slope,
        uint256 _maxSupply
    ) external onlyOwner {
        require(_maxSupply >= supply, "Max supply below current");

        basePrice = _basePrice;
        slope = _slope;
        maxSupply = _maxSupply;

        emit CurveParametersUpdated(_basePrice, _slope, _maxSupply);
    }

    /**
     * @notice Update fees
     * @param _buyFeeBps New buy fee (max 10%)
     * @param _sellFeeBps New sell fee (max 10%)
     */
    function setFees(uint256 _buyFeeBps, uint256 _sellFeeBps) external onlyOwner {
        require(_buyFeeBps <= 1000, "Buy fee too high");
        require(_sellFeeBps <= 1000, "Sell fee too high");

        buyFeeBps = _buyFeeBps;
        sellFeeBps = _sellFeeBps;

        emit FeesUpdated(_buyFeeBps, _sellFeeBps);
    }

    /**
     * @notice Toggle buy/sell
     * @param _buyEnabled Enable buying
     * @param _sellEnabled Enable selling
     */
    function setTradingEnabled(bool _buyEnabled, bool _sellEnabled) external onlyOwner {
        buyEnabled = _buyEnabled;
        sellEnabled = _sellEnabled;
        emit TradingToggled(_buyEnabled, _sellEnabled);
    }

    /**
     * @notice Update treasury address
     * @param _treasury New treasury
     */
    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
    }

    /**
     * @notice Add liquidity (WETH) to curve
     */
    function addLiquidity() external payable onlyOwner {
        require(msg.value > 0, "No liquidity added");
    }

    /**
     * @notice Remove liquidity (WETH) from curve
     * @param amount Amount to remove
     */
    function removeLiquidity(uint256 amount) external onlyOwner {
        require(amount <= address(this).balance, "Insufficient balance");
        payable(treasury).transfer(amount);
    }

    /**
     * @notice Deposit MAMV tokens to curve
     * @param amount Amount of tokens
     */
    function depositTokens(uint256 amount) external onlyOwner {
        verifyToken.transferFrom(msg.sender, address(this), amount);
    }

    /**
     * @notice Withdraw MAMV tokens from curve
     * @param amount Amount of tokens
     */
    function withdrawTokens(uint256 amount) external onlyOwner {
        verifyToken.transfer(treasury, amount);
    }

    receive() external payable {}
}
