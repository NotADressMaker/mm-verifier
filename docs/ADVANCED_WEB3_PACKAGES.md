# Advanced Web3 Packages Integration Guide

Complete deployment and integration guide for MAMV's advanced Web3 packages.

---

## 📦 Packages Overview

This guide covers three major expansion packages:

1. **Package 4: Cross-Chain Expansion** - Multi-chain operations
2. **Package 5: DeFi Integration** - Liquidity and yield strategies
3. **Package 6: AI Agent Integration** - Autonomous AI verifiers

---

## 🌉 PACKAGE 4: CROSS-CHAIN EXPANSION

### Overview

Enable MAMV to operate across multiple blockchains with unified liquidity and state.

**Contracts:**
- `LayerZeroBridge.sol` - Cross-chain MAMV token bridge
- `OmniChainStaking.sol` - Stake on any chain, earn everywhere
- `CrossChainDispute.sol` - Multi-chain dispute resolution

### Deployment

#### Step 1: Deploy LayerZeroBridge

```solidity
// Deploy on each supported chain
LayerZeroBridge bridge = new LayerZeroBridge(
    IERC20(verifyToken)
);

// Configure chains
bridge.configureChain(
    ARBITRUM_CHAIN_ID,
    arbBridgeAddress,
    true,                    // enabled
    1000000e18,             // 1M MAMV daily limit
    10e18,                  // Min 10 MAMV
    100000e18,              // Max 100K MAMV per tx
    50                      // 0.5% fee
);
```

#### Step 2: Deploy OmniChainStaking

```solidity
// Deploy on each chain
OmniChainStaking omniStaking = new OmniChainStaking(
    IERC20(verifyToken),
    CHAIN_ID,
    IS_MAIN_CHAIN           // true for mainnet, false for L2s
);

// Configure trusted chains
omniStaking.setTrustedChain(
    ETHEREUM_CHAIN_ID,
    ethStakingAddress,
    true
);

// Set main chain contract (for L2s only)
if (!IS_MAIN_CHAIN) {
    omniStaking.setMainChainContract(mainnetStakingAddress);
}
```

#### Step 3: Deploy CrossChainDispute

```solidity
CrossChainDispute crossDispute = new CrossChainDispute(
    CHAIN_ID,
    MAINNET_CHAIN_ID,
    IS_MAINNET
);

// Configure chains
crossDispute.configureChain(
    ARB_CHAIN_ID,
    arbDisputeAddress,
    true
);
```

### Integration Examples

#### Example 1: Bridge MAMV to Arbitrum

```javascript
// On Ethereum
const amount = ethers.parseEther("1000");
await verifyToken.approve(bridge.address, amount);

const tx = await bridge.bridge(
    amount,
    ARBITRUM_CHAIN_ID,
    recipientAddress
);

// Wait for cross-chain message (off-chain relayer)
// On Arbitrum, recipient receives 995 MAMV (after 0.5% fee)
```

#### Example 2: Cross-Chain Staking

```javascript
// Stake on Arbitrum (low fees)
await verifyToken.approve(omniStaking.address, ethers.parseEther("1000"));
await omniStaking.stake(ethers.parseEther("1000"));

// Earn rewards from all chains
const info = await omniStaking.getStakingInfo(myAddress);
console.log(`Share of global pool: ${info.shareOfGlobal / 100}%`);
```

#### Example 3: Escalate Dispute to Mainnet

```javascript
// Task on Arbitrum needs more experts
const disputeId = await crossDispute.escalateDispute(
    taskId,
    ETHEREUM_CHAIN_ID,
    bondAmount
);

// Mainnet jury resolves
// Resolution sent back to Arbitrum automatically
```

### Architecture Diagram

```
┌─────────────┐
│  Ethereum   │  Main Chain
│  (Mainnet)  │  - Most liquidity
│             │  - Largest expert pool
└──────┬──────┘  - Final dispute resolution
       │
       ├──────────────┬──────────────┬──────────────┐
       │              │              │              │
┌──────▼──────┐ ┌────▼─────┐ ┌─────▼──────┐ ┌─────▼──────┐
│  Arbitrum   │ │ Optimism │ │    Base    │ │  Polygon   │
│  Low Fees   │ │ Low Fees │ │  Low Fees  │ │ Low Fees   │
│ Task Submit │ │Task Submit│ │Task Submit │ │Task Submit │
└─────────────┘ └──────────┘ └────────────┘ └────────────┘
```

---

## 💰 PACKAGE 5: DEFI INTEGRATION

### Overview

Integrate with DeFi protocols for liquidity provision and yield optimization.

**Contracts:**
- `MAMVVault.sol` - Auto-compounding yield vault
- `LiquidityIncentives.sol` - LP rewards
- `BondingCurve.sol` - Algorithmic price discovery
- `YieldRouter.sol` - Route rewards to DeFi protocols

### Deployment

#### Step 1: Deploy MAMVVault

```solidity
MAMVVault vault = new MAMVVault(
    IERC20(verifyToken),
    verifyStakingAddress,
    uniswapRouterAddress,
    treasuryAddress
);

// Configure strategy
vault.setStrategy(verifyStakingAddress, uniswapRouterAddress);
vault.setPerformanceFee(1000); // 10%
vault.setHarvestParams(
    1e18,      // Min 1 WETH to harvest
    1 days     // Daily harvests
);
```

#### Step 2: Deploy LiquidityIncentives

```solidity
LiquidityIncentives incentives = new LiquidityIncentives(
    IERC20(verifyToken),
    block.number // Start immediately
);

// Add Uniswap V2 MAMV/WETH pool
incentives.addPool(
    IERC20(uniV2PairAddress),
    1000,                           // Allocation points
    "Uniswap V2 MAMV/WETH",
    false
);

// Add Curve MAMV pool
incentives.addPool(
    IERC20(curveLPToken),
    500,                            // Half allocation
    "Curve MAMV Pool",
    false
);

// Set emission rate
incentives.setRewardPerBlock(10e18); // 10 MAMV per block
```

#### Step 3: Deploy BondingCurve

```solidity
BondingCurve curve = new BondingCurve(
    IERC20(verifyToken),
    0.01 ether,                    // Base price: 0.01 ETH
    0.000001 ether,                // Slope: 0.000001 ETH per token
    1000000e18,                    // Max 1M tokens
    treasuryAddress
);

// Set fees
curve.setFees(
    200,  // 2% buy fee
    200   // 2% sell fee
);

// Deposit initial liquidity
curve.addLiquidity{value: 100 ether}();
curve.depositTokens(50000e18);
```

#### Step 4: Deploy YieldRouter

```solidity
YieldRouter router = new YieldRouter(
    IERC20(weth)
);

// Configure Aave strategy
router.configureStrategy(
    YieldRouter.Strategy.AAVE,
    aavePoolAddress,
    true,                          // Active
    1e18,                          // Min 1 WETH
    "Aave WETH Lending"
);

// Configure other strategies...
```

### Integration Examples

#### Example 1: Auto-Compounding Vault

```javascript
// Deposit to vault
await verifyToken.approve(vault.address, ethers.parseEther("1000"));
const shares = await vault.deposit(ethers.parseEther("1000"));

// Vault auto-compounds rewards
// After 1 year at 20% APY:
const assets = await vault.convertToAssets(shares);
// assets = 1200 MAMV (20% gain from compounding)

// Withdraw anytime
await vault.withdraw(shares);
```

#### Example 2: Liquidity Mining

```javascript
// Add liquidity on Uniswap
const pair = await uniswapFactory.createPair(verify, weth);
await addLiquidity(pair, verifyAmount, wethAmount);

// Stake LP tokens
await pair.approve(incentives.address, lpAmount);
await incentives.stake(0, lpAmount); // Pool 0

// Harvest rewards weekly
const pending = await incentives.pendingRewards(0, myAddress);
await incentives.harvest(0);
```

#### Example 3: Bonding Curve Trading

```javascript
// Buy 100 MAMV
const cost = await curve.getBuyPrice(ethers.parseEther("100"));
await curve.buy(ethers.parseEther("100"), { value: cost });

// Sell 50 MAMV
await verifyToken.approve(curve.address, ethers.parseEther("50"));
const proceeds = await curve.sell(ethers.parseEther("50"));
```

#### Example 4: Yield Routing

```javascript
// Enable auto-routing to Aave
await router.setAutoRoute(YieldRouter.Strategy.AAVE, true);

// Claim staking rewards (automatically routed to Aave)
await verifyStaking.claimRewards();

// Rewards now earning interest in Aave
const deposited = await router.getUserTotalDeposited(myAddress);
```

### DeFi Architecture

```
┌──────────────────────────────────────────┐
│          MAMV Protocol           │
│                                          │
│  ┌────────────┐      ┌────────────┐     │
│  │  Staking   │──────│   Mining   │     │
│  └──────┬─────┘      └──────┬─────┘     │
│         │                   │            │
└─────────┼───────────────────┼────────────┘
          │ WETH              │ MAMV
          │ Rewards           │ Rewards
          ▼                   ▼
┌─────────────────────────────────────────┐
│           DeFi Integration              │
│                                         │
│  ┌──────────┐  ┌──────────┐  ┌────────┐│
│  │  Vault   │  │ LP Farms │  │ Curve  ││
│  │  (Auto-  │  │ (Uniswap)│  │ (Price)││
│  │Compound) │  │          │  │        ││
│  └────┬─────┘  └────┬─────┘  └───┬────┘│
└───────┼─────────────┼────────────┼──────┘
        │             │            │
        ▼             ▼            ▼
┌───────────────────────────────────────────┐
│        External DeFi Protocols           │
│  Aave │ Compound │ Curve │ Yearn │ Lido │
└───────────────────────────────────────────┘
```

---

## 🤖 PACKAGE 6: AI AGENT INTEGRATION

### Overview

Enable autonomous AI agents to participate in verification tasks.

**Contracts:**
- `AIAgentRegistry.sol` - Register AI agents
- `AgentStaking.sol` - Delegate to agents
- `ModelAttestation.sol` - Verify model hashes
- `AutomatedEvaluator.sol` - Coordinate AI evaluations

### Deployment

#### Step 1: Deploy AIAgentRegistry

```solidity
AIAgentRegistry registry = new AIAgentRegistry(
    IWETH(wethAddress)
);

// Configure
registry.setMinStake(5 ether);              // 5 WETH minimum
registry.setSlashAmount(1 ether);           // 1 WETH per violation
registry.setMinAccuracy(7000);              // 70% minimum

// Approve operators
registry.approveOperator(openAIOperator, true);
registry.approveOperator(anthropicOperator, true);
```

#### Step 2: Deploy ModelAttestation

```solidity
ModelAttestation attestation = new ModelAttestation();

// Add trusted attesters
attestation.addAttester(
    auditorAddress,
    "Trail of Bits"
);

attestation.addAttester(
    academicAddress,
    "Stanford AI Lab"
);
```

#### Step 3: Deploy AgentStaking

```solidity
AgentStaking agentStaking = new AgentStaking(
    IERC20(verifyToken),
    address(registry)
);

// Configure
agentStaking.setConfig(
    10e18,      // Min 10 MAMV delegation
    7 days      // 7 day unstake cooldown
);
```

#### Step 4: Deploy AutomatedEvaluator

```solidity
AutomatedEvaluator evaluator = new AutomatedEvaluator(
    marketplaceAddress,
    address(registry),
    address(attestation)
);

// Configure
evaluator.setConfig(
    3,          // Min 3 agents
    10,         // Max 10 agents
    1 hours,    // 1 hour commitment window
    1 hours     // 1 hour reveal window
);
```

### Integration Examples

#### Example 1: Register AI Agent

```javascript
// Attest to GPT-4 model first
const modelHash = ethers.keccak256(
    ethers.toUtf8Bytes("gpt-4-turbo-2024-04-09")
);

await attestation.attestModel(
    "GPT-4 Turbo",
    modelHash,
    "1.106",
    ModelAttestation.AttestationType.COMMERCIAL_API,
    "ipfs://Qm...",                    // Metadata
    ["coding", "math", "reasoning"],   // Capabilities
    0,                                 // Never expires
    signature
);

// Register agent
await weth.approve(registry.address, ethers.parseEther("5"));
await registry.registerAgent(
    "GPT-4 Agent",
    modelHash,
    "1.106",
    AIAgentRegistry.AgentType.COMMERCIAL_API,
    ["coding", "math", "reasoning"],
    "https://api.openai.com/v1/chat/completions"
);
```

#### Example 2: Delegate to AI Agent

```javascript
// Create agent pool
await agentStaking.createAgentPool(
    gpt4AgentAddress,
    3000  // 30% to operator, 70% to delegators
);

// Stake to agent
await verifyToken.approve(agentStaking.address, ethers.parseEther("1000"));
await agentStaking.stake(gpt4AgentAddress, ethers.parseEther("1000"));

// Agent earns rewards, you earn 70% share
const pending = await agentStaking.pendingRewards(myAddress, gpt4AgentAddress);
await agentStaking.claimRewards(gpt4AgentAddress);
```

#### Example 3: Automated Task Evaluation

```javascript
// Assign task to AI agents
const assignedAgents = await evaluator.assignTask(
    taskId,
    5,                                    // 5 agents
    "coding",                             // Required capability
    ethers.parseEther("100")              // 100 MAMV reward pool
);

// Agents evaluate off-chain and submit commitments
const commitment = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "bytes32"],
        [score, salt]
    )
);

await evaluator.submitEvaluation(taskId, commitment);

// Reveal phase
await evaluator.revealEvaluation(taskId, score, salt);

// Finalize and distribute rewards
const medianScore = await evaluator.finalizeTask(taskId);
```

### AI Agent Architecture

```
┌──────────────────────────────────────────────┐
│         MAMV Protocol                │
│                                              │
│  ┌─────────────────────────────────────┐    │
│  │    AutomatedEvaluator               │    │
│  │  - Task assignment                  │    │
│  │  - Result aggregation               │    │
│  │  - Reward distribution              │    │
│  └──────────┬──────────────────────────┘    │
└─────────────┼───────────────────────────────┘
              │
     ┌────────┼────────┐
     │        │        │
     ▼        ▼        ▼
┌─────────┐┌─────────┐┌─────────┐
│ GPT-4   ││ Claude  ││ Llama   │  AI Agents
│ Agent   ││ Agent   ││ Agent   │  (Off-chain)
└────┬────┘└────┬────┘└────┬────┘
     │          │          │
     │    ┌─────▼──────┐   │
     └────►AI Registry │◄──┘
          │& Staking   │
          └────────────┘
```

### Agent Operator Bot Example

```javascript
// Listen for task assignments
evaluator.on("TaskAssigned", async (taskId, agents) => {
    if (!agents.includes(myAgentAddress)) return;

    // Fetch task data
    const task = await marketplace.getTask(taskId);

    // Evaluate using AI model
    const score = await evaluateWithAI(task.prompt);

    // Generate commitment
    const salt = ethers.randomBytes(32);
    const commitment = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
            ["uint256", "bytes32"],
            [score, salt]
        )
    );

    // Submit commitment
    await evaluator.submitEvaluation(taskId, commitment);

    // Wait for reveal window
    await sleep(COMMITMENT_WINDOW);

    // Reveal score
    await evaluator.revealEvaluation(taskId, score, salt);
});
```

---

## 🔗 END-TO-END INTEGRATION

### Complete System Architecture

```
┌──────────────────────────────────────────────────────────┐
│                  MAMV Ecosystem                  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │              Core Protocol (Base Layer)            │ │
│  │  VerificationMarketplace │ DisputeLadder          │ │
│  │  AuditorRegistry        │ BondVault               │ │
│  └────────────────────────────────────────────────────┘ │
│                          │                              │
│  ┌───────────────────────┼───────────────────────────┐ │
│  │           Web3 Layer (Previous Release)          │ │
│  │  Governance │ Staking │ Mining │ NFTs            │ │
│  └───────────────────────┼───────────────────────────┘ │
│                          │                              │
│  ┌───────────────────────┼───────────────────────────┐ │
│  │         Advanced Web3 (This Release)             │ │
│  │  Cross-Chain │ DeFi │ AI Agents                  │ │
│  └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### Deployment Sequence

1. **Core Protocol** (Already deployed)
   - WETH, BondVault, AuditorRegistry, DisputeLadder, Marketplace

2. **Web3 Base** (Previously deployed)
   - MAMVToken, MAMVGovernor, VerifyStaking, VerifierMining
   - ReputationBadges, DynamicExpertNFT

3. **Cross-Chain** (This release)
   - Deploy LayerZeroBridge on all chains
   - Deploy OmniChainStaking on all chains
   - Deploy CrossChainDispute on all chains
   - Configure chain trust relationships

4. **DeFi** (This release)
   - Deploy MAMVVault
   - Deploy LiquidityIncentives
   - Deploy BondingCurve
   - Deploy YieldRouter
   - Integrate with external protocols

5. **AI Agents** (This release)
   - Deploy AIAgentRegistry
   - Deploy ModelAttestation
   - Deploy AgentStaking
   - Deploy AutomatedEvaluator
   - Register initial AI agents

### Integration Checklist

#### Cross-Chain Integration
- [ ] Deploy bridge contracts on all chains
- [ ] Configure chain mappings
- [ ] Test cross-chain message passing
- [ ] Set up relayer infrastructure
- [ ] Configure daily limits and fees
- [ ] Test dispute escalation flow

#### DeFi Integration
- [ ] Deploy vault and incentive contracts
- [ ] Add initial liquidity to bonding curve
- [ ] Create LP pools on DEXes
- [ ] Configure yield strategies
- [ ] Test auto-compounding flow
- [ ] Integrate with Aave/Compound/Curve

#### AI Agent Integration
- [ ] Deploy agent registry and staking
- [ ] Register model attestations
- [ ] Onboard initial AI agents
- [ ] Test evaluation flow
- [ ] Configure reward distribution
- [ ] Set up agent operator bots

---

## 🔐 Security Considerations

### Cross-Chain Security
1. **Message Verification**: All cross-chain messages verified cryptographically
2. **Rate Limiting**: Daily transfer limits per chain
3. **Fraud Proofs**: 24-hour challenge period for disputes
4. **Trusted Relayers**: Initially centralized, migrate to decentralized

### DeFi Security
1. **Vault Audits**: Audit all yield strategies
2. **Slippage Protection**: Max slippage limits on swaps
3. **Emergency Pause**: Circuit breakers for all contracts
4. **Time Locks**: 48-hour delay on strategy changes

### AI Agent Security
1. **Stake Requirements**: Minimum WETH stake per agent
2. **Performance Monitoring**: Continuous accuracy tracking
3. **Slashing Mechanism**: Penalties for low accuracy
4. **Model Verification**: Attestation required before participation

---

## 📊 Expected Impact

### Cross-Chain Expansion
- **Gas Savings**: 90% reduction on L2s vs mainnet
- **User Growth**: 3-5x from L2 accessibility
- **Liquidity**: Unified across all chains
- **Dispute Resolution**: Access to larger expert pools

### DeFi Integration
- **Liquidity Depth**: 10x deeper MAMV liquidity
- **Price Stability**: Reduced volatility via bonding curve
- **Yield Enhancement**: 15-25% APY from DeFi strategies
- **Token Utility**: Multiple use cases beyond staking

### AI Agent Integration
- **Scalability**: 100x more evaluations per day
- **Cost Reduction**: 70% cheaper than human-only verification
- **24/7 Operation**: Continuous verification availability
- **Quality**: Multi-model consensus improves accuracy

---

## 📈 Next Steps

### Immediate (Weeks 1-2)
1. Deploy all contracts to testnet
2. Integration testing
3. Security audits
4. Documentation finalization

### Short-term (Weeks 3-6)
1. Mainnet deployment
2. Cross-chain bridge activation
3. DeFi pool seeding
4. AI agent onboarding

### Long-term (Months 3-6)
1. Additional chain support (Avalanche, Fantom)
2. More DeFi protocols (Convex, Frax)
3. Advanced AI features (multi-model ensembles)
4. Governance parameter optimization

---

## 🆘 Troubleshooting

### Cross-Chain Issues
**"Insufficient liquidity on destination chain"**
- Solution: Bridge more tokens or reduce transfer amount

**"Daily limit exceeded"**
- Solution: Wait 24 hours or split into smaller transfers

### DeFi Issues
**"Harvest amount too small"**
- Solution: Increase `minHarvestAmount` or wait longer

**"Slippage too high"**
- Solution: Adjust swap parameters or wait for better prices

### AI Agent Issues
**"Agent not eligible for task"**
- Solution: Check stake, attestation, and capability requirements

**"Evaluation deadline missed"**
- Solution: Increase commitment/reveal windows for slower agents

---

## 📚 Additional Resources

- [LayerZero Documentation](https://layerzero.network/docs)
- [Uniswap V2/V3 Docs](https://docs.uniswap.org/)
- [Aave Developer Docs](https://docs.aave.com/developers/)
- [OpenAI API Reference](https://platform.openai.com/docs)

---

**Status**: ✅ All contracts implemented and ready for deployment

**Total Contracts**: 11 new contracts (3 cross-chain + 4 DeFi + 4 AI agent)

**Next Action**: Deploy to testnet and begin integration testing
