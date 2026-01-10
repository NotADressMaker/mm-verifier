// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IWETH.sol";
import "./AuditorRegistry.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title BLSSlashingManager
 * @notice Branch Legitimacy Scoring (BLS) based slashing for evaluators
 * @dev Implements sophisticated fault classification and slashing calculation:
 *      - Ordinary disagreement (D): gentle quadratic penalty (a * D^2)
 *      - Unjustified branching (U): aggressive superlinear penalty (b * U^gamma)
 *      - Hard triggers for proven bad faith (fabricated quotes, spam, etc.)
 */
contract BLSSlashingManager is Ownable, ReentrancyGuard {
    IWETH public immutable WETH;
    AuditorRegistry public immutable auditorRegistry;

    // ========================================================================
    // Configuration Parameters
    // ========================================================================

    // Slashing coefficients (scaled by 1e18 for precision)
    uint256 public a = 100_000_000_000_000_000; // 0.10 * 1e18 (ordinary disagreement)
    uint256 public b = 600_000_000_000_000_000; // 0.60 * 1e18 (unjustified branching)
    uint256 public gamma = 2700;                // 2.7 * 1000 (exponent scaled by 1000)
    uint256 public c = 50_000_000_000_000_000;  // 0.05 * 1e18 (overlap bonus)

    // Legitimacy threshold (scaled by 1e18)
    uint256 public legitThreshold = 650_000_000_000_000_000; // 0.65 * 1e18

    // Hard trigger thresholds (basis points: 0-10000)
    uint256 public minSlashFabricatedQuote = 8000;      // 80%
    uint256 public minSlashNoSupport = 5000;            // 50%
    uint256 public minSlashSpam = 4000;                 // 40%
    uint256 public highConfidenceThreshold = 7500;      // 75%
    uint256 public spamRedundancyThreshold = 3000;      // 30%

    // Lambda for excess branching weight (scaled by 1e18)
    uint256 public lambdaExcessWeight = 2_000_000_000_000_000_000; // 2.0 * 1e18

    // ========================================================================
    // Data Structures
    // ========================================================================

    struct FaultData {
        uint256 D;              // Ordinary disagreement rate (0-1e18)
        uint256 U;              // Unjustified branching severity (0-1e18)
        bool fabricatedQuote;
        bool highConfidenceNoSupport;
        bool spamRedundancy;
    }

    struct SlashingResult {
        uint256 sD;             // Ordinary disagreement penalty
        uint256 sU;             // Unjustified branching penalty
        uint256 overlapBonus;   // Overlap correction
        uint256 slashRate;      // Final slash rate (0-10000 bps)
        uint256 slashAmount;    // WETH amount to slash
    }

    // ========================================================================
    // Events
    // ========================================================================

    event Slashed(
        address indexed evaluator,
        uint256 taskId,
        uint256 slashRate,      // Basis points (0-10000)
        uint256 slashAmount,    // WETH wei
        uint256 D,              // Ordinary disagreement
        uint256 U               // Unjustified branching
    );

    event ParametersUpdated(
        uint256 a,
        uint256 b,
        uint256 gamma,
        uint256 c,
        uint256 legitThreshold
    );

    event HardTriggerThresholdsUpdated(
        uint256 minSlashFabricatedQuote,
        uint256 minSlashNoSupport,
        uint256 minSlashSpam
    );

    // ========================================================================
    // Constructor
    // ========================================================================

    constructor(IWETH _weth, AuditorRegistry _auditorRegistry) Ownable(msg.sender) {
        WETH = _weth;
        auditorRegistry = _auditorRegistry;
    }

    // ========================================================================
    // Configuration
    // ========================================================================

    /**
     * @notice Update slashing parameters
     * @param _a Ordinary disagreement coefficient (scaled by 1e18)
     * @param _b Unjustified branching coefficient (scaled by 1e18)
     * @param _gamma Unjustified branching exponent (scaled by 1000)
     * @param _c Overlap bonus coefficient (scaled by 1e18)
     * @param _legitThreshold Legitimacy threshold (scaled by 1e18)
     */
    function setSlashingParams(
        uint256 _a,
        uint256 _b,
        uint256 _gamma,
        uint256 _c,
        uint256 _legitThreshold
    ) external onlyOwner {
        require(_a <= 1e18, "a too high");
        require(_b <= 1e18, "b too high");
        require(_gamma <= 10000, "gamma too high");
        require(_c <= 1e18, "c too high");
        require(_legitThreshold <= 1e18, "threshold too high");

        a = _a;
        b = _b;
        gamma = _gamma;
        c = _c;
        legitThreshold = _legitThreshold;

        emit ParametersUpdated(_a, _b, _gamma, _c, _legitThreshold);
    }

    /**
     * @notice Update hard trigger thresholds
     * @param _minSlashFabricatedQuote Minimum slash for fabricated quotes (bps)
     * @param _minSlashNoSupport Minimum slash for no support (bps)
     * @param _minSlashSpam Minimum slash for spam redundancy (bps)
     */
    function setHardTriggerThresholds(
        uint256 _minSlashFabricatedQuote,
        uint256 _minSlashNoSupport,
        uint256 _minSlashSpam
    ) external onlyOwner {
        require(_minSlashFabricatedQuote <= 10000, "too high");
        require(_minSlashNoSupport <= 10000, "too high");
        require(_minSlashSpam <= 10000, "too high");

        minSlashFabricatedQuote = _minSlashFabricatedQuote;
        minSlashNoSupport = _minSlashNoSupport;
        minSlashSpam = _minSlashSpam;

        emit HardTriggerThresholdsUpdated(
            _minSlashFabricatedQuote,
            _minSlashNoSupport,
            _minSlashSpam
        );
    }

    // ========================================================================
    // Slashing Calculation
    // ========================================================================

    /**
     * @notice Calculate slashing amount based on BLS fault classification
     * @param stake Evaluator stake (WETH wei)
     * @param faults Fault data (D, U, hard triggers)
     * @return result Slashing calculation result
     */
    function calculateSlashing(
        uint256 stake,
        FaultData memory faults
    ) public view returns (SlashingResult memory result) {
        // sD(D) = a * D^2
        result.sD = (a * faults.D * faults.D) / 1e36; // Divide by 1e36 to normalize

        // sU(U) = b * U^gamma
        // Compute U^gamma (with gamma scaled by 1000)
        uint256 UPowGamma = _powScaled(faults.U, gamma, 1000, 1e18);
        result.sU = (b * UPowGamma) / 1e18;

        // Overlap bonus = c * D * U
        result.overlapBonus = (c * faults.D * faults.U) / 1e36;

        // Base slash rate (scaled to 0-10000 bps)
        uint256 baseSlashScaled = result.sD + result.sU;
        if (baseSlashScaled > result.overlapBonus) {
            baseSlashScaled -= result.overlapBonus;
        } else {
            baseSlashScaled = 0;
        }

        // Convert to basis points (0-10000)
        result.slashRate = (baseSlashScaled * 10000) / 1e18;

        // Apply hard triggers
        if (faults.fabricatedQuote && result.slashRate < minSlashFabricatedQuote) {
            result.slashRate = minSlashFabricatedQuote;
        }
        if (faults.highConfidenceNoSupport && result.slashRate < minSlashNoSupport) {
            result.slashRate = minSlashNoSupport;
        }
        if (faults.spamRedundancy && result.slashRate < minSlashSpam) {
            result.slashRate = minSlashSpam;
        }

        // Cap at 100%
        if (result.slashRate > 10000) {
            result.slashRate = 10000;
        }

        // Calculate slash amount
        result.slashAmount = (stake * result.slashRate) / 10000;
    }

    /**
     * @notice Execute BLS-based slashing
     * @param evaluator Evaluator address
     * @param taskId Task identifier
     * @param stake Evaluator stake (WETH wei)
     * @param faults Fault data
     * @param recipient Recipient of slashed funds
     */
    function slash(
        address evaluator,
        uint256 taskId,
        uint256 stake,
        FaultData memory faults,
        address recipient
    ) external onlyOwner nonReentrant returns (uint256 slashAmount) {
        // Calculate slashing
        SlashingResult memory result = calculateSlashing(stake, faults);

        // Execute slash via AuditorRegistry
        // Note: This assumes evaluator stake is in AuditorRegistry
        // For VerifierMarketplace evaluators, use a different mechanism
        auditorRegistry.slash(evaluator, result.slashAmount, recipient);

        emit Slashed(
            evaluator,
            taskId,
            result.slashRate,
            result.slashAmount,
            faults.D,
            faults.U
        );

        return result.slashAmount;
    }

    /**
     * @notice Compute power with scaled exponent: base^(exp/scale)
     * @param base Base value (scaled by baseScale)
     * @param exp Exponent (scaled by expScale)
     * @param expScale Exponent scale factor
     * @param baseScale Base scale factor
     * @return result base^(exp/expScale) scaled by baseScale
     */
    function _powScaled(
        uint256 base,
        uint256 exp,
        uint256 expScale,
        uint256 baseScale
    ) internal pure returns (uint256) {
        if (base == 0) return 0;
        if (exp == 0) return baseScale;

        // Convert to integer and fractional parts
        uint256 intExp = exp / expScale;
        uint256 fracExp = exp % expScale;

        // Compute integer part: base^intExp
        uint256 result = baseScale;
        uint256 tempBase = base;

        for (uint256 i = 0; i < intExp; i++) {
            result = (result * tempBase) / baseScale;
        }

        // Approximate fractional part using Taylor series
        // (1 + x)^frac ≈ 1 + frac*x (first-order approximation)
        if (fracExp > 0) {
            uint256 x = base > baseScale ? base - baseScale : baseScale - base;
            uint256 fracContribution = (x * fracExp) / expScale;

            if (base > baseScale) {
                result = result + (result * fracContribution) / baseScale;
            } else {
                result = result - (result * fracContribution) / baseScale;
            }
        }

        return result;
    }

    // ========================================================================
    // View Functions
    // ========================================================================

    /**
     * @notice Get current slashing parameters
     */
    function getSlashingParams() external view returns (
        uint256 _a,
        uint256 _b,
        uint256 _gamma,
        uint256 _c,
        uint256 _legitThreshold
    ) {
        return (a, b, gamma, c, legitThreshold);
    }

    /**
     * @notice Get hard trigger thresholds
     */
    function getHardTriggerThresholds() external view returns (
        uint256 _minSlashFabricatedQuote,
        uint256 _minSlashNoSupport,
        uint256 _minSlashSpam,
        uint256 _highConfidenceThreshold,
        uint256 _spamRedundancyThreshold
    ) {
        return (
            minSlashFabricatedQuote,
            minSlashNoSupport,
            minSlashSpam,
            highConfidenceThreshold,
            spamRedundancyThreshold
        );
    }

    /**
     * @notice Simulate slashing calculation (view function)
     * @param stake Stake amount
     * @param D Ordinary disagreement rate (scaled by 1e18)
     * @param U Unjustified branching severity (scaled by 1e18)
     * @param hardTriggers Hard trigger flags (3-bit packed: fabricated|noSupport|spam)
     * @return slashRate Slash rate in basis points (0-10000)
     * @return slashAmount Slash amount in WETH wei
     */
    function simulateSlashing(
        uint256 stake,
        uint256 D,
        uint256 U,
        uint8 hardTriggers
    ) external view returns (uint256 slashRate, uint256 slashAmount) {
        FaultData memory faults = FaultData({
            D: D,
            U: U,
            fabricatedQuote: (hardTriggers & 0x01) != 0,
            highConfidenceNoSupport: (hardTriggers & 0x02) != 0,
            spamRedundancy: (hardTriggers & 0x04) != 0
        });

        SlashingResult memory result = calculateSlashing(stake, faults);
        return (result.slashRate, result.slashAmount);
    }
}
