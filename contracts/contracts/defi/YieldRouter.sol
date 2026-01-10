// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title YieldRouter
 * @notice Route staking rewards to external DeFi protocols
 * @dev Automatically deploy earned WETH into yield strategies
 *
 * Supported Strategies:
 * 1. Aave - Lend WETH for interest
 * 2. Compound - Supply WETH to money market
 * 3. Curve - LP in WETH pools
 * 4. Yearn - Deposit into WETH vault
 * 5. Lido - Stake ETH for stETH
 *
 * How it works:
 * 1. User stakes VERIFY in VerifyStaking
 * 2. Instead of claiming WETH directly, route to YieldRouter
 * 3. YieldRouter deploys WETH into best-yielding strategy
 * 4. User can withdraw principal + DeFi yield anytime
 *
 * Benefits:
 * - Maximize yields on staking rewards
 * - Automated strategy selection
 * - Gas-efficient batch operations
 * - Diversified DeFi exposure
 *
 * Example:
 * ```
 * // Enable auto-routing for your rewards
 * yieldRouter.enableAutoRoute(Strategy.AAVE);
 *
 * // Rewards automatically deposited to Aave
 * staking.claimRewards(); // Goes to YieldRouter
 *
 * // Withdraw anytime
 * yieldRouter.withdraw(Strategy.AAVE, amount);
 * ```
 */
contract YieldRouter is Ownable, ReentrancyGuard {
    IERC20 public immutable weth;

    // Strategy types
    enum Strategy {
        NONE,           // 0 - No routing, direct claim
        AAVE,           // 1 - Aave lending
        COMPOUND,       // 2 - Compound supply
        CURVE,          // 3 - Curve LP
        YEARN,          // 4 - Yearn vault
        LIDO            // 5 - Lido staking
    }

    // Strategy configuration
    struct StrategyConfig {
        address protocol;       // Protocol contract address
        bool active;           // Strategy enabled
        uint256 minAmount;     // Minimum deposit amount
        uint256 totalDeposited; // Total deposited to strategy
        uint256 currentAPY;    // Current APY (basis points)
        string name;           // Strategy name
    }

    // User position
    struct UserPosition {
        Strategy strategy;      // Active strategy
        uint256 deposited;     // Amount deposited
        uint256 shares;        // Strategy-specific shares
        uint256 lastUpdate;    // Last deposit/withdrawal
        bool autoRoute;        // Auto-route new rewards
    }

    // State
    mapping(Strategy => StrategyConfig) public strategies;
    mapping(address => mapping(Strategy => UserPosition)) public positions;

    // Strategy addresses (interfaces would be imported in production)
    address public aavePool;
    address public compoundCToken;
    address public curvePool;
    address public yearnVault;
    address public lidoStaking;

    // Events
    event StrategyConfigured(
        Strategy indexed strategy,
        address protocol,
        bool active,
        string name
    );

    event Deposited(
        address indexed user,
        Strategy indexed strategy,
        uint256 amount,
        uint256 shares
    );

    event Withdrawn(
        address indexed user,
        Strategy indexed strategy,
        uint256 amount,
        uint256 shares
    );

    event AutoRouteToggled(
        address indexed user,
        Strategy indexed strategy,
        bool enabled
    );

    event StrategyHarvested(
        Strategy indexed strategy,
        uint256 rewards,
        uint256 newAPY
    );

    constructor(IERC20 _weth) Ownable(msg.sender) {
        require(address(_weth) != address(0), "Invalid WETH");
        weth = _weth;
    }

    /**
     * @notice Configure strategy
     * @param strategy Strategy type
     * @param protocol Protocol address
     * @param active Enable/disable
     * @param minAmount Minimum deposit
     * @param name Strategy name
     */
    function configureStrategy(
        Strategy strategy,
        address protocol,
        bool active,
        uint256 minAmount,
        string calldata name
    ) external onlyOwner {
        require(strategy != Strategy.NONE, "Invalid strategy");
        require(protocol != address(0), "Invalid protocol");

        strategies[strategy] = StrategyConfig({
            protocol: protocol,
            active: active,
            minAmount: minAmount,
            totalDeposited: strategies[strategy].totalDeposited,
            currentAPY: 0,
            name: name
        });

        // Set protocol-specific addresses
        if (strategy == Strategy.AAVE) aavePool = protocol;
        else if (strategy == Strategy.COMPOUND) compoundCToken = protocol;
        else if (strategy == Strategy.CURVE) curvePool = protocol;
        else if (strategy == Strategy.YEARN) yearnVault = protocol;
        else if (strategy == Strategy.LIDO) lidoStaking = protocol;

        emit StrategyConfigured(strategy, protocol, active, name);
    }

    /**
     * @notice Deposit WETH into strategy
     * @param strategy Strategy to use
     * @param amount Amount of WETH
     * @return shares Shares received
     */
    function deposit(Strategy strategy, uint256 amount)
        external
        nonReentrant
        returns (uint256 shares)
    {
        require(strategy != Strategy.NONE, "Invalid strategy");
        require(amount > 0, "Cannot deposit 0");

        StrategyConfig storage config = strategies[strategy];
        require(config.active, "Strategy inactive");
        require(amount >= config.minAmount, "Below minimum");

        // Transfer WETH from user
        weth.transferFrom(msg.sender, address(this), amount);

        // Deploy to strategy
        shares = _deployToStrategy(strategy, amount);

        // Update user position
        UserPosition storage pos = positions[msg.sender][strategy];
        pos.strategy = strategy;
        pos.deposited += amount;
        pos.shares += shares;
        pos.lastUpdate = block.timestamp;

        // Update strategy totals
        config.totalDeposited += amount;

        emit Deposited(msg.sender, strategy, amount, shares);

        return shares;
    }

    /**
     * @notice Withdraw from strategy
     * @param strategy Strategy to withdraw from
     * @param amount Amount of WETH
     * @return withdrawn Actual amount withdrawn
     */
    function withdraw(Strategy strategy, uint256 amount)
        external
        nonReentrant
        returns (uint256 withdrawn)
    {
        require(strategy != Strategy.NONE, "Invalid strategy");
        require(amount > 0, "Cannot withdraw 0");

        UserPosition storage pos = positions[msg.sender][strategy];
        require(pos.deposited >= amount, "Insufficient balance");

        // Calculate shares to redeem
        uint256 sharesToRedeem = (pos.shares * amount) / pos.deposited;

        // Withdraw from strategy
        withdrawn = _withdrawFromStrategy(strategy, sharesToRedeem);

        // Update user position
        pos.deposited -= amount;
        pos.shares -= sharesToRedeem;
        pos.lastUpdate = block.timestamp;

        // Update strategy totals
        strategies[strategy].totalDeposited -= amount;

        // Transfer WETH to user
        weth.transfer(msg.sender, withdrawn);

        emit Withdrawn(msg.sender, strategy, withdrawn, sharesToRedeem);

        return withdrawn;
    }

    /**
     * @notice Enable auto-routing of rewards
     * @param strategy Strategy to route to
     * @param enabled Enable/disable
     */
    function setAutoRoute(Strategy strategy, bool enabled) external {
        require(strategy != Strategy.NONE, "Invalid strategy");
        require(strategies[strategy].active, "Strategy inactive");

        positions[msg.sender][strategy].autoRoute = enabled;

        emit AutoRouteToggled(msg.sender, strategy, enabled);
    }

    /**
     * @notice Receive and route rewards (called by staking contract)
     * @param user User address
     * @param amount Reward amount
     */
    function receiveRewards(address user, uint256 amount)
        external
        nonReentrant
        onlyOwner
    {
        require(amount > 0, "No rewards");

        // Find user's preferred strategy
        Strategy userStrategy = _getUserPreferredStrategy(user);

        if (userStrategy != Strategy.NONE) {
            // Transfer WETH from staking contract
            weth.transferFrom(msg.sender, address(this), amount);

            // Deploy to strategy
            uint256 shares = _deployToStrategy(userStrategy, amount);

            // Update position
            UserPosition storage pos = positions[user][userStrategy];
            pos.deposited += amount;
            pos.shares += shares;
            pos.lastUpdate = block.timestamp;

            strategies[userStrategy].totalDeposited += amount;

            emit Deposited(user, userStrategy, amount, shares);
        }
    }

    /**
     * @notice Get user's total deposited across all strategies
     * @param user User address
     * @return total Total deposited
     * @return active Active strategies
     */
    function getUserTotalDeposited(address user)
        external
        view
        returns (uint256 total, Strategy[] memory active)
    {
        uint256 count = 0;
        for (uint256 i = 1; i <= 5; i++) {
            Strategy strat = Strategy(i);
            if (positions[user][strat].deposited > 0) {
                total += positions[user][strat].deposited;
                count++;
            }
        }

        active = new Strategy[](count);
        uint256 idx = 0;
        for (uint256 i = 1; i <= 5; i++) {
            Strategy strat = Strategy(i);
            if (positions[user][strat].deposited > 0) {
                active[idx] = strat;
                idx++;
            }
        }
    }

    /**
     * @notice Get best strategy by APY
     * @return bestStrategy Strategy with highest APY
     * @return apy APY in basis points
     */
    function getBestStrategy()
        external
        view
        returns (Strategy bestStrategy, uint256 apy)
    {
        for (uint256 i = 1; i <= 5; i++) {
            Strategy strat = Strategy(i);
            StrategyConfig memory config = strategies[strat];

            if (config.active && config.currentAPY > apy) {
                apy = config.currentAPY;
                bestStrategy = strat;
            }
        }
    }

    /**
     * @notice Internal: Deploy to strategy
     * @param strategy Strategy type
     * @param amount Amount to deploy
     * @return shares Shares received
     */
    function _deployToStrategy(Strategy strategy, uint256 amount)
        internal
        returns (uint256 shares)
    {
        StrategyConfig memory config = strategies[strategy];

        weth.approve(config.protocol, amount);

        // In production, would call actual protocol contracts
        // For now, simplified: 1:1 shares
        shares = amount;

        /* Example production code:
        if (strategy == Strategy.AAVE) {
            IAavePool(aavePool).supply(address(weth), amount, address(this), 0);
        } else if (strategy == Strategy.COMPOUND) {
            ICToken(compoundCToken).mint(amount);
        } else if (strategy == Strategy.YEARN) {
            IYearnVault(yearnVault).deposit(amount);
        }
        */

        return shares;
    }

    /**
     * @notice Internal: Withdraw from strategy
     * @param strategy Strategy type
     * @param shares Shares to redeem
     * @return amount Amount withdrawn
     */
    function _withdrawFromStrategy(Strategy strategy, uint256 shares)
        internal
        returns (uint256 amount)
    {
        // In production, would call actual protocol contracts
        // For now, simplified: 1:1 shares
        amount = shares;

        /* Example production code:
        if (strategy == Strategy.AAVE) {
            amount = IAavePool(aavePool).withdraw(address(weth), shares, address(this));
        } else if (strategy == Strategy.COMPOUND) {
            ICToken(compoundCToken).redeem(shares);
        } else if (strategy == Strategy.YEARN) {
            amount = IYearnVault(yearnVault).withdraw(shares);
        }
        */

        return amount;
    }

    /**
     * @notice Internal: Get user's preferred strategy
     * @param user User address
     * @return strategy Preferred strategy
     */
    function _getUserPreferredStrategy(address user)
        internal
        view
        returns (Strategy)
    {
        // Find first active auto-route strategy
        for (uint256 i = 1; i <= 5; i++) {
            Strategy strat = Strategy(i);
            if (positions[user][strat].autoRoute) {
                return strat;
            }
        }
        return Strategy.NONE;
    }

    /**
     * @notice Update strategy APY (called by keeper/oracle)
     * @param strategy Strategy to update
     * @param newAPY New APY in basis points
     */
    function updateStrategyAPY(Strategy strategy, uint256 newAPY)
        external
        onlyOwner
    {
        require(strategy != Strategy.NONE, "Invalid strategy");
        strategies[strategy].currentAPY = newAPY;
    }
}
