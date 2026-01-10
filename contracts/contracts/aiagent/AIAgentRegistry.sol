// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IWETH.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title AIAgentRegistry
 * @notice Register and manage autonomous AI agents as verifiers
 * @dev Enables AI agents to participate in verification tasks
 *
 * Agent Types:
 * 1. GPT-4 / Claude / Gemini (Commercial APIs)
 * 2. Open-source models (Llama, Mistral)
 * 3. Custom fine-tuned models
 * 4. Multi-model ensembles
 * 5. Specialized domain models
 *
 * Registration Requirements:
 * - Model attestation (hash + version)
 * - Economic stake (WETH bond)
 * - Performance history
 * - Operator EOA/contract
 *
 * How it works:
 * 1. Agent operator stakes WETH + provides model details
 * 2. Agent gets whitelisted for tasks
 * 3. Agent evaluates tasks autonomously
 * 4. Performance tracked on-chain
 * 5. Slashing for malicious behavior
 *
 * Benefits:
 * - Scale verification with AI
 * - 24/7 autonomous operation
 * - Lower costs than human verifiers
 * - Diverse model coverage
 *
 * Example:
 * ```
 * // Register GPT-4 agent
 * registry.registerAgent(
 *     "GPT-4-Turbo",
 *     "0x1234...abcd", // Model hash
 *     "1.0.0",
 *     AgentType.COMMERCIAL_API,
 *     ["coding", "math", "reasoning"]
 * );
 * ```
 */
contract AIAgentRegistry is Ownable, ReentrancyGuard {
    IWETH public immutable WETH;

    // Agent types
    enum AgentType {
        COMMERCIAL_API,     // 0 - GPT-4, Claude, etc.
        OPEN_SOURCE,        // 1 - Llama, Mistral, etc.
        CUSTOM_FINETUNED,   // 2 - Custom models
        ENSEMBLE,           // 3 - Multi-model ensemble
        SPECIALIZED         // 4 - Domain-specific
    }

    // Agent status
    enum AgentStatus {
        Pending,            // 0 - Awaiting approval
        Active,             // 1 - Actively verifying
        Paused,             // 2 - Temporarily inactive
        Slashed,            // 3 - Slashed for misbehavior
        Retired             // 4 - Permanently retired
    }

    // Agent info
    struct AgentInfo {
        string name;                    // Agent name
        bytes32 modelHash;              // Model hash/identifier
        string version;                 // Model version
        AgentType agentType;            // Type of agent
        AgentStatus status;             // Current status
        address operator;               // Operator address
        uint256 stake;                  // WETH stake
        uint256 minStake;               // Minimum required stake
        string[] capabilities;          // Supported domains
        uint256 totalEvaluations;       // Total evals performed
        uint256 accurateEvaluations;    // Accurate evals
        uint256 slashCount;             // Times slashed
        uint256 registeredAt;           // Registration timestamp
        uint256 lastActiveAt;           // Last evaluation timestamp
        string apiEndpoint;             // API endpoint (if applicable)
    }

    // State
    mapping(address => AgentInfo) public agents;
    address[] public agentList;
    mapping(address => bool) public isRegistered;

    // Configuration
    uint256 public minAgentStake = 5 ether;          // Min 5 WETH
    uint256 public slashAmount = 1 ether;            // Slash 1 WETH per violation
    uint256 public minAccuracyBps = 7000;            // Min 70% accuracy

    // Approval system
    mapping(address => bool) public approvedOperators; // Pre-approved operators
    bool public requiresApproval = true;

    // Events
    event AgentRegistered(
        address indexed agent,
        string name,
        AgentType agentType,
        address indexed operator,
        uint256 stake
    );

    event AgentUpdated(
        address indexed agent,
        AgentStatus status,
        uint256 stake
    );

    event AgentSlashed(
        address indexed agent,
        uint256 amount,
        string reason
    );

    event EvaluationRecorded(
        address indexed agent,
        uint256 taskId,
        bool accurate,
        uint256 totalEvals,
        uint256 accurateEvals
    );

    event OperatorApproved(address indexed operator, bool approved);

    constructor(IWETH _weth) Ownable(msg.sender) {
        require(address(_weth) != address(0), "Invalid WETH");
        WETH = _weth;
    }

    /**
     * @notice Register new AI agent
     * @param name Agent name
     * @param modelHash Model identifier hash
     * @param version Model version
     * @param agentType Type of agent
     * @param capabilities Supported domains
     * @param apiEndpoint API endpoint (optional)
     */
    function registerAgent(
        string calldata name,
        bytes32 modelHash,
        string calldata version,
        AgentType agentType,
        string[] calldata capabilities,
        string calldata apiEndpoint
    ) external nonReentrant {
        require(!isRegistered[msg.sender], "Already registered");
        require(bytes(name).length > 0, "Name required");
        require(modelHash != bytes32(0), "Model hash required");
        require(capabilities.length > 0, "Capabilities required");

        // Check approval if required
        if (requiresApproval) {
            require(approvedOperators[msg.sender], "Not approved");
        }

        // Stake requirement
        uint256 requiredStake = minAgentStake;
        WETH.transferFrom(msg.sender, address(this), requiredStake);

        // Create agent
        agents[msg.sender] = AgentInfo({
            name: name,
            modelHash: modelHash,
            version: version,
            agentType: agentType,
            status: AgentStatus.Active,
            operator: msg.sender,
            stake: requiredStake,
            minStake: requiredStake,
            capabilities: capabilities,
            totalEvaluations: 0,
            accurateEvaluations: 0,
            slashCount: 0,
            registeredAt: block.timestamp,
            lastActiveAt: block.timestamp,
            apiEndpoint: apiEndpoint
        });

        agentList.push(msg.sender);
        isRegistered[msg.sender] = true;

        emit AgentRegistered(
            msg.sender,
            name,
            agentType,
            msg.sender,
            requiredStake
        );
    }

    /**
     * @notice Add stake to agent
     * @param amount Amount of WETH to add
     */
    function addStake(uint256 amount) external nonReentrant {
        require(isRegistered[msg.sender], "Not registered");
        require(amount > 0, "Amount must be > 0");

        WETH.transferFrom(msg.sender, address(this), amount);

        AgentInfo storage agent = agents[msg.sender];
        agent.stake += amount;

        // Reactive if was slashed
        if (agent.status == AgentStatus.Slashed && agent.stake >= agent.minStake) {
            agent.status = AgentStatus.Active;
        }

        emit AgentUpdated(msg.sender, agent.status, agent.stake);
    }

    /**
     * @notice Withdraw stake
     * @param amount Amount to withdraw
     */
    function withdrawStake(uint256 amount) external nonReentrant {
        require(isRegistered[msg.sender], "Not registered");

        AgentInfo storage agent = agents[msg.sender];
        require(agent.stake >= amount, "Insufficient stake");
        require(agent.stake - amount >= agent.minStake, "Below minimum stake");

        agent.stake -= amount;
        WETH.transfer(msg.sender, amount);

        emit AgentUpdated(msg.sender, agent.status, agent.stake);
    }

    /**
     * @notice Record evaluation (called by marketplace)
     * @param agent Agent address
     * @param taskId Task ID
     * @param accurate Was evaluation accurate
     */
    function recordEvaluation(
        address agent,
        uint256 taskId,
        bool accurate
    ) external onlyOwner {
        require(isRegistered[agent], "Agent not registered");

        AgentInfo storage agentInfo = agents[agent];
        agentInfo.totalEvaluations++;

        if (accurate) {
            agentInfo.accurateEvaluations++;
        }

        agentInfo.lastActiveAt = block.timestamp;

        // Check if below minimum accuracy
        if (agentInfo.totalEvaluations >= 10) {
            uint256 accuracyBps = (agentInfo.accurateEvaluations * 10000) / agentInfo.totalEvaluations;

            if (accuracyBps < minAccuracyBps) {
                _slashAgent(agent, "Low accuracy");
            }
        }

        emit EvaluationRecorded(
            agent,
            taskId,
            accurate,
            agentInfo.totalEvaluations,
            agentInfo.accurateEvaluations
        );
    }

    /**
     * @notice Slash agent for misbehavior
     * @param agent Agent to slash
     * @param reason Reason for slashing
     */
    function slashAgent(address agent, string calldata reason) external onlyOwner {
        _slashAgent(agent, reason);
    }

    /**
     * @notice Update agent status
     * @param agent Agent address
     * @param status New status
     */
    function setAgentStatus(address agent, AgentStatus status) external onlyOwner {
        require(isRegistered[agent], "Agent not registered");

        agents[agent].status = status;

        emit AgentUpdated(agent, status, agents[agent].stake);
    }

    /**
     * @notice Approve operator
     * @param operator Operator address
     * @param approved Approval status
     */
    function approveOperator(address operator, bool approved) external onlyOwner {
        approvedOperators[operator] = approved;
        emit OperatorApproved(operator, approved);
    }

    /**
     * @notice Toggle approval requirement
     * @param required Require approval
     */
    function setRequiresApproval(bool required) external onlyOwner {
        requiresApproval = required;
    }

    /**
     * @notice Update minimum stake
     * @param _minStake New minimum stake
     */
    function setMinStake(uint256 _minStake) external onlyOwner {
        minAgentStake = _minStake;
    }

    /**
     * @notice Update slash amount
     * @param _slashAmount New slash amount
     */
    function setSlashAmount(uint256 _slashAmount) external onlyOwner {
        slashAmount = _slashAmount;
    }

    /**
     * @notice Update minimum accuracy
     * @param _minAccuracyBps New minimum accuracy (bps)
     */
    function setMinAccuracy(uint256 _minAccuracyBps) external onlyOwner {
        require(_minAccuracyBps <= 10000, "Invalid accuracy");
        minAccuracyBps = _minAccuracyBps;
    }

    /**
     * @notice Get active agents
     * @return activeAgents Array of active agent addresses
     */
    function getActiveAgents() external view returns (address[] memory activeAgents) {
        uint256 count = 0;
        for (uint256 i = 0; i < agentList.length; i++) {
            if (agents[agentList[i]].status == AgentStatus.Active) {
                count++;
            }
        }

        activeAgents = new address[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < agentList.length; i++) {
            if (agents[agentList[i]].status == AgentStatus.Active) {
                activeAgents[idx] = agentList[i];
                idx++;
            }
        }
    }

    /**
     * @notice Get agent accuracy
     * @param agent Agent address
     * @return accuracyBps Accuracy in basis points
     */
    function getAgentAccuracy(address agent) external view returns (uint256 accuracyBps) {
        AgentInfo memory agentInfo = agents[agent];

        if (agentInfo.totalEvaluations == 0) {
            return 0;
        }

        return (agentInfo.accurateEvaluations * 10000) / agentInfo.totalEvaluations;
    }

    /**
     * @notice Get agents by type
     * @param agentType Type to filter
     * @return filtered Array of agents of that type
     */
    function getAgentsByType(AgentType agentType)
        external
        view
        returns (address[] memory filtered)
    {
        uint256 count = 0;
        for (uint256 i = 0; i < agentList.length; i++) {
            if (agents[agentList[i]].agentType == agentType &&
                agents[agentList[i]].status == AgentStatus.Active) {
                count++;
            }
        }

        filtered = new address[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < agentList.length; i++) {
            address agent = agentList[i];
            if (agents[agent].agentType == agentType &&
                agents[agent].status == AgentStatus.Active) {
                filtered[idx] = agent;
                idx++;
            }
        }
    }

    /**
     * @notice Internal slash function
     * @param agent Agent to slash
     * @param reason Reason
     */
    function _slashAgent(address agent, string memory reason) internal {
        require(isRegistered[agent], "Agent not registered");

        AgentInfo storage agentInfo = agents[agent];

        uint256 slashAmt = slashAmount;
        if (agentInfo.stake < slashAmt) {
            slashAmt = agentInfo.stake;
        }

        agentInfo.stake -= slashAmt;
        agentInfo.slashCount++;

        // If below minimum stake, pause
        if (agentInfo.stake < agentInfo.minStake) {
            agentInfo.status = AgentStatus.Slashed;
        }

        // Send slashed amount to treasury
        WETH.transfer(owner(), slashAmt);

        emit AgentSlashed(agent, slashAmt, reason);
        emit AgentUpdated(agent, agentInfo.status, agentInfo.stake);
    }

    /**
     * @notice Get total registered agents
     * @return count Agent count
     */
    function getAgentCount() external view returns (uint256) {
        return agentList.length;
    }
}
