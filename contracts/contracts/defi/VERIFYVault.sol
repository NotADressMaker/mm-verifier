// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title VERIFYVault
 * @notice Auto-compounding yield vault for VERIFY token
 * @dev ERC4626-inspired vault that auto-compounds staking rewards
 *
 * How it works:
 * 1. Users deposit VERIFY, receive vVERIFY (vault shares)
 * 2. Vault stakes VERIFY in VerifyStaking contract
 * 3. Harvest WETH rewards periodically
 * 4. Swap WETH → VERIFY on DEX
 * 5. Re-stake VERIFY (compounding)
 * 6. Share price increases over time
 *
 * Benefits:
 * - Set-and-forget yield optimization
 * - Gas-efficient (shared harvest costs)
 * - Auto-compound staking rewards
 * - Liquid vault shares (vVERIFY)
 *
 * Example:
 * ```
 * // Alice deposits 1000 VERIFY
 * vault.deposit(1000e18);
 * // Receives 1000 vVERIFY (1:1 initially)
 *
 * // After 1 year of compounding...
 * // 1 vVERIFY = 1.2 VERIFY (20% APY)
 * vault.withdraw(1000e18); // Gets 1200 VERIFY
 * ```
 *
 * Performance Fees:
 * - 10% of yield goes to protocol treasury
 * - 90% auto-compounded for depositors
 */
contract VERIFYVault is ERC20, Ownable, ReentrancyGuard {
    IERC20 public immutable verifyToken;

    // External contracts
    address public staking;    // VerifyStaking contract
    address public router;     // DEX router for swaps
    address public treasury;   // Fee recipient

    // Vault configuration
    uint256 public performanceFeeBps = 1000; // 10% of yield
    uint256 public lastHarvest;
    uint256 public totalDeposits;

    // Harvest configuration
    uint256 public minHarvestAmount = 1e18;  // Min 1 WETH to harvest
    uint256 public harvestCooldown = 1 days; // Min time between harvests

    // Events
    event Deposited(address indexed user, uint256 assets, uint256 shares);
    event Withdrawn(address indexed user, uint256 assets, uint256 shares);
    event Harvested(uint256 wethAmount, uint256 verifyBought, uint256 fee);
    event StrategyUpdated(address indexed staking, address indexed router);

    constructor(
        IERC20 _verifyToken,
        address _staking,
        address _router,
        address _treasury
    ) ERC20("Vaulted VERIFY", "vVERIFY") Ownable(msg.sender) {
        verifyToken = _verifyToken;
        staking = _staking;
        router = _router;
        treasury = _treasury;
        lastHarvest = block.timestamp;
    }

    /**
     * @notice Deposit VERIFY tokens
     * @param assets Amount of VERIFY to deposit
     * @return shares Amount of vVERIFY minted
     */
    function deposit(uint256 assets) external nonReentrant returns (uint256 shares) {
        require(assets > 0, "Cannot deposit 0");

        // Calculate shares
        shares = convertToShares(assets);
        require(shares > 0, "Invalid shares");

        // Transfer tokens
        verifyToken.transferFrom(msg.sender, address(this), assets);

        // Mint vault shares
        _mint(msg.sender, shares);

        // Update state
        totalDeposits += assets;

        // Stake in VerifyStaking
        if (staking != address(0)) {
            verifyToken.approve(staking, assets);
            (bool success,) = staking.call(
                abi.encodeWithSignature("stake(uint256)", assets)
            );
            require(success, "Stake failed");
        }

        emit Deposited(msg.sender, assets, shares);

        return shares;
    }

    /**
     * @notice Withdraw VERIFY tokens
     * @param shares Amount of vVERIFY to burn
     * @return assets Amount of VERIFY withdrawn
     */
    function withdraw(uint256 shares) external nonReentrant returns (uint256 assets) {
        require(shares > 0, "Cannot withdraw 0");
        require(balanceOf(msg.sender) >= shares, "Insufficient shares");

        // Calculate assets
        assets = convertToAssets(shares);
        require(assets > 0, "Invalid assets");

        // Burn vault shares
        _burn(msg.sender, shares);

        // Update state
        totalDeposits -= assets;

        // Unstake from VerifyStaking if needed
        uint256 balance = verifyToken.balanceOf(address(this));
        if (balance < assets && staking != address(0)) {
            uint256 toUnstake = assets - balance;
            (bool success,) = staking.call(
                abi.encodeWithSignature("unstake(uint256)", toUnstake)
            );
            require(success, "Unstake failed");
        }

        // Transfer tokens
        verifyToken.transfer(msg.sender, assets);

        emit Withdrawn(msg.sender, assets, shares);

        return assets;
    }

    /**
     * @notice Harvest and compound rewards
     * @dev Anyone can call, but cooldown prevents spam
     * @return wethHarvested Amount of WETH harvested
     * @return verifyBought Amount of VERIFY bought and compounded
     */
    function harvest() external nonReentrant returns (
        uint256 wethHarvested,
        uint256 verifyBought
    ) {
        require(block.timestamp >= lastHarvest + harvestCooldown, "Cooldown active");
        require(staking != address(0), "No staking contract");

        // Claim WETH rewards from staking
        (bool success, bytes memory data) = staking.call(
            abi.encodeWithSignature("claimRewards()")
        );
        require(success, "Claim failed");

        // Get WETH balance
        // Note: In production, would import IWETH interface
        wethHarvested = address(this).balance; // Simplified

        require(wethHarvested >= minHarvestAmount, "Harvest too small");

        // Calculate performance fee
        uint256 fee = (wethHarvested * performanceFeeBps) / 10_000;
        uint256 toCompound = wethHarvested - fee;

        // Swap WETH → VERIFY via router
        if (router != address(0) && toCompound > 0) {
            // In production, would call router.swapExactETHForTokens()
            // For now, simplified: assume 1:1 for demonstration
            verifyBought = toCompound; // Placeholder
        }

        // Re-stake VERIFY
        if (verifyBought > 0) {
            verifyToken.approve(staking, verifyBought);
            (success,) = staking.call(
                abi.encodeWithSignature("stake(uint256)", verifyBought)
            );
            require(success, "Re-stake failed");

            totalDeposits += verifyBought;
        }

        // Send fee to treasury
        if (fee > 0 && treasury != address(0)) {
            payable(treasury).transfer(fee);
        }

        lastHarvest = block.timestamp;

        emit Harvested(wethHarvested, verifyBought, fee);

        return (wethHarvested, verifyBought);
    }

    /**
     * @notice Convert assets to shares
     * @param assets Amount of VERIFY
     * @return shares Amount of vVERIFY
     */
    function convertToShares(uint256 assets) public view returns (uint256 shares) {
        uint256 supply = totalSupply();

        if (supply == 0) {
            return assets; // 1:1 for first deposit
        }

        return (assets * supply) / totalAssets();
    }

    /**
     * @notice Convert shares to assets
     * @param shares Amount of vVERIFY
     * @return assets Amount of VERIFY
     */
    function convertToAssets(uint256 shares) public view returns (uint256 assets) {
        uint256 supply = totalSupply();

        if (supply == 0) {
            return 0;
        }

        return (shares * totalAssets()) / supply;
    }

    /**
     * @notice Get total assets under management
     * @return total Total VERIFY in vault + staked
     */
    function totalAssets() public view returns (uint256 total) {
        // Vault balance
        total = verifyToken.balanceOf(address(this));

        // Staked balance
        if (staking != address(0)) {
            (bool success, bytes memory data) = staking.staticcall(
                abi.encodeWithSignature("stakedAmount(address)", address(this))
            );
            if (success && data.length >= 32) {
                total += abi.decode(data, (uint256));
            }
        }

        return total;
    }

    /**
     * @notice Get user's share of vault
     * @param user User address
     * @return assets User's VERIFY balance
     * @return shares User's vVERIFY balance
     * @return percentage Share of vault (bps)
     */
    function getUserInfo(address user) external view returns (
        uint256 assets,
        uint256 shares,
        uint256 percentage
    ) {
        shares = balanceOf(user);
        assets = convertToAssets(shares);

        uint256 supply = totalSupply();
        if (supply > 0) {
            percentage = (shares * 10000) / supply;
        }
    }

    /**
     * @notice Update strategy contracts
     * @param _staking New staking contract
     * @param _router New router contract
     */
    function setStrategy(address _staking, address _router) external onlyOwner {
        staking = _staking;
        router = _router;
        emit StrategyUpdated(_staking, _router);
    }

    /**
     * @notice Update performance fee
     * @param _feeBps New fee in basis points (max 20%)
     */
    function setPerformanceFee(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= 2000, "Fee too high");
        performanceFeeBps = _feeBps;
    }

    /**
     * @notice Update harvest parameters
     * @param _minAmount Min WETH to harvest
     * @param _cooldown Cooldown between harvests
     */
    function setHarvestParams(uint256 _minAmount, uint256 _cooldown) external onlyOwner {
        minHarvestAmount = _minAmount;
        harvestCooldown = _cooldown;
    }

    /**
     * @notice Update treasury address
     * @param _treasury New treasury
     */
    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
    }

    receive() external payable {}
}
