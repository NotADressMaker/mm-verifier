// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title VerifierTypes
 * @notice Canonical type library for LLM Verifier system
 * @dev Shared structs and enums used across all contracts
 *
 * This library provides a single source of truth for all data structures,
 * ensuring consistency across VerifierMarketplace, DisputeLadder, BondVault,
 * and other system components.
 */
library VerifierTypes {
    // ========================================================================
    // Enums
    // ========================================================================

    /**
     * @notice Task lifecycle states
     * @dev NONE: Not initialized
     *      OPEN: Accepting verifier commits
     *      COMMIT: Commit phase active
     *      REVEAL: Reveal phase active
     *      FINALIZED: Task completed, rewards distributed
     *      DISPUTED: Under dispute resolution
     *      RESOLVED: Dispute resolved
     */
    enum TaskStatus {
        NONE,
        OPEN,
        COMMIT,
        REVEAL,
        FINALIZED,
        DISPUTED,
        RESOLVED
    }

    /**
     * @notice Dispute resolution states
     * @dev NONE: No dispute
     *      OPENED: Challenger submitted claim
     *      RESPONDED: Defender submitted response
     *      AUDITOR_SELECTION: Selecting jury via VRF
     *      AUDITOR_COMMIT: Auditors committing votes
     *      AUDITOR_REVEAL: Auditors revealing votes
     *      DECIDED: Verdict reached
     *      EXECUTED: Rewards/slashing executed
     */
    enum DisputeStatus {
        NONE,
        OPENED,
        RESPONDED,
        AUDITOR_SELECTION,
        AUDITOR_COMMIT,
        AUDITOR_REVEAL,
        DECIDED,
        EXECUTED
    }

    // ========================================================================
    // Core Structs
    // ========================================================================

    /**
     * @notice Single branch in a decision tree
     * @dev Represents an IF-THEN rule with evidence support
     * @param conditionHash Hash of the IF condition
     * @param answerHash Hash of the THEN verdict
     * @param evidenceRoot Merkle root of supporting evidence
     * @param confidenceBps Confidence level (0-10000 basis points)
     * @param branchScoreBps BLS legitimacy score (0-10000 basis points)
     */
    struct Branch {
        bytes32 conditionHash;
        bytes32 answerHash;
        bytes32 evidenceRoot;
        uint16 confidenceBps;
        uint16 branchScoreBps;
    }

    /**
     * @notice Complete reveal bundle for a verifier
     * @dev Submitted during reveal phase to open commitments
     * @param modelId Identifier for the model used
     * @param overallScoreBps Overall quality score (0-10000 basis points)
     * @param branches Array of decision branches
     * @param salt Random salt used in commit hash
     */
    struct RevealBundle {
        bytes32 modelId;
        uint16 overallScoreBps;
        Branch[] branches;
        bytes32 salt;
    }

    /**
     * @notice Commit-reveal tracking for a verifier
     * @dev Tracks commitment and reveal status
     * @param commitHash Hash of the commitment
     * @param commitTime Timestamp of commitment
     * @param revealed Whether commitment has been revealed
     */
    struct CommitInfo {
        bytes32 commitHash;
        uint40 commitTime;
        bool revealed;
    }

    /**
     * @notice Task metadata and state
     * @dev Core task structure for marketplace
     * @param creator Address that created the task
     * @param reward Total reward pool in WETH
     * @param createdAt Task creation timestamp
     * @param commitDeadline Deadline for verifier commits
     * @param revealDeadline Deadline for reveals
     * @param maxVerifiers Maximum number of verifiers
     * @param minVerifiers Minimum required verifiers
     * @param promptHash Hash of the evaluation prompt
     * @param policyHash Hash of the evaluation policy
     * @param status Current task status
     * @param verifierCount Number of committed verifiers
     * @param lockedBondTotal Total bonds locked for this task
     */
    struct TaskMeta {
        address creator;
        uint96 reward;
        uint40 createdAt;
        uint40 commitDeadline;
        uint40 revealDeadline;
        uint16 maxVerifiers;
        uint16 minVerifiers;
        bytes32 promptHash;
        bytes32 policyHash;
        TaskStatus status;
        uint16 verifierCount;
        uint96 lockedBondTotal;
    }

    /**
     * @notice Dispute metadata and state
     * @dev Tracks dispute lifecycle and participants
     * @param taskId Associated task identifier
     * @param challenger Address initiating dispute
     * @param defender Address being challenged
     * @param openedAt Dispute opening timestamp
     * @param respondDeadline Deadline for defender response
     * @param auditorCommitDeadline Deadline for auditor commits
     * @param auditorRevealDeadline Deadline for auditor reveals
     * @param challengerBond Challenger's staked bond
     * @param defenderBond Defender's staked bond
     * @param status Current dispute status
     * @param claimHash Hash of challenger's claim
     * @param evidenceRoot Merkle root of challenger's evidence
     * @param defenseRoot Merkle root of defender's defense
     */
    struct DisputeMeta {
        bytes32 taskId;
        address challenger;
        address defender;
        uint40 openedAt;
        uint40 respondDeadline;
        uint40 auditorCommitDeadline;
        uint40 auditorRevealDeadline;
        uint96 challengerBond;
        uint96 defenderBond;
        DisputeStatus status;
        bytes32 claimHash;
        bytes32 evidenceRoot;
        bytes32 defenseRoot;
    }

    /**
     * @notice Auditor's revealed vote in dispute
     * @dev Opened after commit phase to prevent collusion
     * @param challengerWins True if auditor votes for challenger
     * @param branchLegitimacyBps BLS score justification (0-10000)
     * @param justificationRoot Merkle root of auditor's reasoning
     * @param salt Random salt used in commit hash
     */
    struct AuditorReveal {
        bool challengerWins;
        uint16 branchLegitimacyBps;
        bytes32 justificationRoot;
        bytes32 salt;
    }

    // ========================================================================
    // Helper Structs for Complex Operations
    // ========================================================================

    /**
     * @notice Verifier participation record
     * @dev Tracks individual verifier's contribution to a task
     * @param verifier Address of the verifier
     * @param commitHash Their commitment hash
     * @param commitTime When they committed
     * @param revealed Whether they revealed
     * @param revealBundle Their revealed data (if revealed)
     * @param bondLocked Amount of bond locked
     */
    struct VerifierRecord {
        address verifier;
        bytes32 commitHash;
        uint40 commitTime;
        bool revealed;
        RevealBundle revealBundle;
        uint96 bondLocked;
    }

    /**
     * @notice Dispute round configuration
     * @dev Parameters for a single dispute ladder tier
     * @param level Tier level (L1, L2, L3)
     * @param jurorCount Number of jurors for this tier
     * @param bondRequired Bond required to escalate to this tier
     * @param commitWindow Time window for commits (seconds)
     * @param revealWindow Time window for reveals (seconds)
     */
    struct DisputeRound {
        uint8 level;
        uint16 jurorCount;
        uint96 bondRequired;
        uint40 commitWindow;
        uint40 revealWindow;
    }

    /**
     * @notice Slashing calculation result
     * @dev Output from BLS-based slashing computation
     * @param ordinaryDisagreement Fraction of honest disagreement
     * @param unjustifiedBranching Fraction of illegitimate branching
     * @param totalSlash Total amount to slash (wei)
     * @param slashBps Slash percentage (0-10000 basis points)
     * @param hardTrigger Whether hard slashing was triggered
     */
    struct SlashingResult {
        uint16 ordinaryDisagreement;
        uint16 unjustifiedBranching;
        uint96 totalSlash;
        uint16 slashBps;
        bool hardTrigger;
    }
}
