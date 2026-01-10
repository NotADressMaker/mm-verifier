// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title AutomatedEvaluator
 * @notice Coordinate autonomous AI agent evaluations
 * @dev Manages task assignment, result submission, and validation for AI agents
 *
 * Evaluation Flow:
 * 1. Task created in marketplace
 * 2. AutomatedEvaluator assigns task to eligible AI agents
 * 3. Agents evaluate off-chain, submit results on-chain
 * 4. Results validated and aggregated
 * 5. Rewards distributed to agents
 *
 * Agent Selection Criteria:
 * - Model attestation (verified)
 * - Sufficient stake
 * - Capability match (domain expertise)
 * - Performance history
 * - Availability status
 *
 * Result Validation:
 * - Commitment-reveal scheme (prevent copying)
 * - Outlier detection (statistical)
 * - Cross-validation with other agents
 * - Human expert oversight (if needed)
 *
 * Example:
 * ```
 * // Assign task to agents
 * evaluator.assignTask(taskId, 5); // Select 5 agents
 *
 * // Agents submit evaluations
 * evaluator.submitEvaluation(taskId, commitmentHash);
 * evaluator.revealEvaluation(taskId, score, salt);
 *
 * // Finalize and distribute rewards
 * evaluator.finalizeTask(taskId);
 * ```
 */
contract AutomatedEvaluator is Ownable, ReentrancyGuard {
    // External contracts
    address public marketplace;
    address public agentRegistry;
    address public modelAttestation;

    // Task assignment
    struct TaskAssignment {
        uint256 taskId;                     // Marketplace task ID
        address[] assignedAgents;           // Agents assigned
        mapping(address => bool) isAssigned;
        uint256 requiredEvaluations;        // Min evaluations needed
        uint256 submittedEvaluations;       // Evals submitted
        uint256 deadline;                   // Submission deadline
        bool finalized;                     // Task finalized
        uint256 rewardPool;                 // Total rewards
        string requiredCapability;          // Required domain
    }

    // Agent evaluation
    struct AgentEvaluation {
        address agent;                      // Agent address
        bytes32 commitmentHash;             // Commitment hash
        uint256 score;                      // Revealed score (0-10000 bps)
        bool committed;                     // Commitment submitted
        bool revealed;                      // Score revealed
        uint256 submittedAt;                // Submission timestamp
        bool rewarded;                      // Reward claimed
    }

    // State
    mapping(uint256 => TaskAssignment) public taskAssignments;
    mapping(uint256 => mapping(address => AgentEvaluation)) public evaluations;
    uint256[] public activeTasks;

    // Configuration
    uint256 public minAgents = 3;                       // Min agents per task
    uint256 public maxAgents = 10;                      // Max agents per task
    uint256 public commitmentWindow = 1 hours;          // Time to commit
    uint256 public revealWindow = 1 hours;              // Time to reveal
    uint256 public outlierThreshold = 2000;             // 20% deviation = outlier

    // Events
    event TaskAssigned(
        uint256 indexed taskId,
        address[] agents,
        uint256 deadline,
        uint256 rewardPool
    );

    event EvaluationCommitted(
        uint256 indexed taskId,
        address indexed agent,
        bytes32 commitmentHash
    );

    event EvaluationRevealed(
        uint256 indexed taskId,
        address indexed agent,
        uint256 score
    );

    event TaskFinalized(
        uint256 indexed taskId,
        uint256 medianScore,
        uint256 rewardsDistributed
    );

    event AgentRewarded(
        uint256 indexed taskId,
        address indexed agent,
        uint256 reward,
        bool wasAccurate
    );

    constructor(
        address _marketplace,
        address _agentRegistry,
        address _modelAttestation
    ) Ownable(msg.sender) {
        require(_marketplace != address(0), "Invalid marketplace");
        require(_agentRegistry != address(0), "Invalid registry");
        require(_modelAttestation != address(0), "Invalid attestation");

        marketplace = _marketplace;
        agentRegistry = _agentRegistry;
        modelAttestation = _modelAttestation;
    }

    /**
     * @notice Assign task to AI agents
     * @param taskId Task ID
     * @param numAgents Number of agents to assign
     * @param requiredCapability Required capability
     * @param rewardPool Total reward pool
     * @return assignedAgents Array of assigned agent addresses
     */
    function assignTask(
        uint256 taskId,
        uint256 numAgents,
        string calldata requiredCapability,
        uint256 rewardPool
    ) external onlyOwner nonReentrant returns (address[] memory assignedAgents) {
        require(numAgents >= minAgents, "Too few agents");
        require(numAgents <= maxAgents, "Too many agents");
        require(!taskAssignments[taskId].finalized, "Task already assigned");

        // Select agents (simplified - production would use VRF + scoring)
        assignedAgents = _selectAgents(numAgents, requiredCapability);
        require(assignedAgents.length >= minAgents, "Insufficient eligible agents");

        // Create assignment
        TaskAssignment storage assignment = taskAssignments[taskId];
        assignment.taskId = taskId;
        assignment.assignedAgents = assignedAgents;
        assignment.requiredEvaluations = numAgents;
        assignment.deadline = block.timestamp + commitmentWindow + revealWindow;
        assignment.rewardPool = rewardPool;
        assignment.requiredCapability = requiredCapability;

        for (uint256 i = 0; i < assignedAgents.length; i++) {
            assignment.isAssigned[assignedAgents[i]] = true;
        }

        activeTasks.push(taskId);

        emit TaskAssigned(taskId, assignedAgents, assignment.deadline, rewardPool);

        return assignedAgents;
    }

    /**
     * @notice Submit evaluation commitment
     * @param taskId Task ID
     * @param commitmentHash Hash of (score + salt)
     */
    function submitEvaluation(
        uint256 taskId,
        bytes32 commitmentHash
    ) external nonReentrant {
        TaskAssignment storage assignment = taskAssignments[taskId];
        require(assignment.isAssigned[msg.sender], "Not assigned");
        require(!assignment.finalized, "Task finalized");
        require(block.timestamp < assignment.deadline, "Past deadline");

        AgentEvaluation storage eval = evaluations[taskId][msg.sender];
        require(!eval.committed, "Already committed");

        eval.agent = msg.sender;
        eval.commitmentHash = commitmentHash;
        eval.committed = true;
        eval.submittedAt = block.timestamp;

        assignment.submittedEvaluations++;

        emit EvaluationCommitted(taskId, msg.sender, commitmentHash);
    }

    /**
     * @notice Reveal evaluation score
     * @param taskId Task ID
     * @param score Score (0-10000 bps)
     * @param salt Random salt used in commitment
     */
    function revealEvaluation(
        uint256 taskId,
        uint256 score,
        bytes32 salt
    ) external nonReentrant {
        TaskAssignment storage assignment = taskAssignments[taskId];
        AgentEvaluation storage eval = evaluations[taskId][msg.sender];

        require(eval.committed, "Not committed");
        require(!eval.revealed, "Already revealed");
        require(score <= 10000, "Invalid score");

        // Verify commitment
        bytes32 computedHash = keccak256(abi.encodePacked(score, salt));
        require(computedHash == eval.commitmentHash, "Invalid reveal");

        eval.score = score;
        eval.revealed = true;

        emit EvaluationRevealed(taskId, msg.sender, score);
    }

    /**
     * @notice Finalize task and distribute rewards
     * @param taskId Task ID
     * @return medianScore Median score from agents
     */
    function finalizeTask(uint256 taskId)
        external
        onlyOwner
        nonReentrant
        returns (uint256 medianScore)
    {
        TaskAssignment storage assignment = taskAssignments[taskId];
        require(!assignment.finalized, "Already finalized");

        // Collect revealed scores
        uint256[] memory scores = new uint256[](assignment.assignedAgents.length);
        uint256 revealedCount = 0;

        for (uint256 i = 0; i < assignment.assignedAgents.length; i++) {
            address agent = assignment.assignedAgents[i];
            AgentEvaluation storage eval = evaluations[taskId][agent];

            if (eval.revealed) {
                scores[revealedCount] = eval.score;
                revealedCount++;
            }
        }

        require(revealedCount >= minAgents, "Insufficient reveals");

        // Calculate median
        medianScore = _calculateMedian(scores, revealedCount);

        // Distribute rewards
        uint256 totalDistributed = _distributeRewards(
            taskId,
            assignment,
            medianScore
        );

        assignment.finalized = true;

        emit TaskFinalized(taskId, medianScore, totalDistributed);

        return medianScore;
    }

    /**
     * @notice Get task assignment info
     * @param taskId Task ID
     * @return agents Assigned agents
     * @return submitted Number of submissions
     * @return required Required evaluations
     * @return finalized Is finalized
     */
    function getTaskAssignment(uint256 taskId)
        external
        view
        returns (
            address[] memory agents,
            uint256 submitted,
            uint256 required,
            bool finalized
        )
    {
        TaskAssignment storage assignment = taskAssignments[taskId];
        return (
            assignment.assignedAgents,
            assignment.submittedEvaluations,
            assignment.requiredEvaluations,
            assignment.finalized
        );
    }

    /**
     * @notice Get agent's evaluation for task
     * @param taskId Task ID
     * @param agent Agent address
     * @return evaluation Evaluation struct
     */
    function getEvaluation(uint256 taskId, address agent)
        external
        view
        returns (AgentEvaluation memory)
    {
        return evaluations[taskId][agent];
    }

    /**
     * @notice Select agents for task
     * @param numAgents Number to select
     * @param capability Required capability
     * @return selected Selected agent addresses
     */
    function _selectAgents(
        uint256 numAgents,
        string memory capability
    ) internal view returns (address[] memory selected) {
        // In production, would call agentRegistry.getActiveAgents()
        // and filter by capability, stake, performance
        // For now, simplified placeholder
        selected = new address[](numAgents);

        // Placeholder: would implement proper agent selection
        // Based on: attestation, stake, performance history

        return selected;
    }

    /**
     * @notice Calculate median of scores
     * @param scores Array of scores
     * @param count Number of valid scores
     * @return median Median score
     */
    function _calculateMedian(
        uint256[] memory scores,
        uint256 count
    ) internal pure returns (uint256 median) {
        require(count > 0, "No scores");

        // Sort scores (bubble sort - production would use quicksort)
        for (uint256 i = 0; i < count - 1; i++) {
            for (uint256 j = 0; j < count - i - 1; j++) {
                if (scores[j] > scores[j + 1]) {
                    uint256 temp = scores[j];
                    scores[j] = scores[j + 1];
                    scores[j + 1] = temp;
                }
            }
        }

        // Calculate median
        if (count % 2 == 0) {
            median = (scores[count / 2 - 1] + scores[count / 2]) / 2;
        } else {
            median = scores[count / 2];
        }

        return median;
    }

    /**
     * @notice Distribute rewards to agents
     * @param taskId Task ID
     * @param assignment Task assignment
     * @param medianScore Median score
     * @return totalDistributed Total rewards distributed
     */
    function _distributeRewards(
        uint256 taskId,
        TaskAssignment storage assignment,
        uint256 medianScore
    ) internal returns (uint256 totalDistributed) {
        uint256 baseReward = assignment.rewardPool / assignment.assignedAgents.length;

        for (uint256 i = 0; i < assignment.assignedAgents.length; i++) {
            address agent = assignment.assignedAgents[i];
            AgentEvaluation storage eval = evaluations[taskId][agent];

            if (!eval.revealed || eval.rewarded) continue;

            // Check if within outlier threshold
            uint256 diff = eval.score > medianScore
                ? eval.score - medianScore
                : medianScore - eval.score;

            bool isAccurate = diff <= outlierThreshold;

            // Accurate agents get full reward, outliers get partial
            uint256 reward = isAccurate ? baseReward : baseReward / 2;

            eval.rewarded = true;
            totalDistributed += reward;

            emit AgentRewarded(taskId, agent, reward, isAccurate);

            // In production, would transfer tokens to agent
            // agentStaking.distributeRewards(agent, reward);
        }

        return totalDistributed;
    }

    /**
     * @notice Update configuration
     * @param _minAgents New min agents
     * @param _maxAgents New max agents
     * @param _commitmentWindow New commitment window
     * @param _revealWindow New reveal window
     */
    function setConfig(
        uint256 _minAgents,
        uint256 _maxAgents,
        uint256 _commitmentWindow,
        uint256 _revealWindow
    ) external onlyOwner {
        require(_minAgents <= _maxAgents, "Invalid agent range");

        minAgents = _minAgents;
        maxAgents = _maxAgents;
        commitmentWindow = _commitmentWindow;
        revealWindow = _revealWindow;
    }

    /**
     * @notice Update outlier threshold
     * @param _threshold New threshold (bps)
     */
    function setOutlierThreshold(uint256 _threshold) external onlyOwner {
        require(_threshold <= 5000, "Threshold too high");
        outlierThreshold = _threshold;
    }

    /**
     * @notice Get active task count
     * @return count Number of active tasks
     */
    function getActiveTaskCount() external view returns (uint256) {
        return activeTasks.length;
    }
}
