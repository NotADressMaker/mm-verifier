# Web3 Transformation Guide

Complete guide to the Web3 features added to MMV protocol.

---

## 📦 Packages Implemented

### **Package 1: Decentralized Governance** ✅
- `VerifyToken.sol` - ERC20Votes governance token
- `VerifyGovernor.sol` - On-chain governance with OpenZeppelin Governor
- Timelock integration for delayed execution (48 hours)

### **Package 2: Tokenomics & Incentives** ✅
- `VerifyStaking.sol` - Protocol revenue sharing for token stakers
- `VerifierMining.sol` - Liquidity mining rewards for verifiers

### **Package 3: NFT Reputation System** ✅
- `ReputationBadges.sol` - Soulbound achievement NFTs
- `DynamicExpertNFT.sol` - Dynamic expert profile NFTs

---

## 🚀 Deployment Guide

### Step 1: Deploy Core Contracts (Existing)

These should already be deployed:
```bash
# Existing contracts
✅ WETH
✅ BondVaultWETH
✅ AuditorRegistry
✅ DisputeLadder
✅ VerificationMarketplace
```

### Step 2: Deploy Governance Contracts

```solidity
// 1. Deploy VERIFY token
VerifyToken verifyToken = new VerifyToken(
    treasuryAddress,      // 40% of supply
    teamVestingAddress,   // 30% of supply (vested)
    miningRewardsAddress, // 20% for mining
    airdropAddress        // 10% for airdrop
);

// 2. Deploy Timelock (48 hour delay)
TimelockController timelock = new TimelockController(
    172800,              // 48 hours in seconds
    proposers,           // Array of proposer addresses
    executors,           // Array of executor addresses (use [address(0)] for anyone)
    admin                // Admin address (should be governance after setup)
);

// 3. Deploy Governor
VerifyGovernor governor = new VerifyGovernor(
    IVotes(address(verifyToken)),
    timelock
);

// 4. Grant roles to governor
timelock.grantRole(timelock.PROPOSER_ROLE(), address(governor));
timelock.grantRole(timelock.EXECUTOR_ROLE(), address(0)); // Anyone can execute
timelock.grantRole(timelock.CANCELLER_ROLE(), address(governor));
timelock.revokeRole(timelock.DEFAULT_ADMIN_ROLE(), admin); // Renounce admin
```

### Step 3: Deploy Tokenomics Contracts

```solidity
// 1. Deploy staking contract
VerifyStaking staking = new VerifyStaking(
    IERC20(address(verifyToken)),
    IWETH(wethAddress)
);

// 2. Authorize marketplace to distribute revenue
staking.setRevenueDistributor(address(marketplace), true);

// 3. Deploy mining contract
VerifierMining mining = new VerifierMining(
    IERC20(address(verifyToken)),
    address(marketplace)
);

// 4. Transfer mining rewards tokens to mining contract
verifyToken.transfer(address(mining), 200_000e18); // 200K VERIFY
```

### Step 4: Deploy NFT Contracts

```solidity
// 1. Deploy reputation badges
ReputationBadges badges = new ReputationBadges();

// 2. Authorize marketplace to mint badges
badges.setMinter(address(marketplace), true);
badges.setMinter(address(auditorRegistry), true);

// 3. Deploy dynamic expert NFTs
DynamicExpertNFT expertNFT = new DynamicExpertNFT(
    address(marketplace),
    address(auditorRegistry)
);
```

### Step 5: Integrate with Existing Contracts

Update existing contracts to use new features:

```solidity
// In VerificationMarketplace.sol, add:
VerifyStaking public staking;
VerifierMining public mining;
ReputationBadges public badges;

function setStaking(address _staking) external onlyOwner {
    staking = VerifyStaking(_staking);
}

function setMining(address _mining) external onlyOwner {
    mining = VerifierMining(_mining);
}

function setBadges(address _badges) external onlyOwner {
    badges = ReputationBadges(_badges);
}
```

---

## 🔧 Integration Examples

### Example 1: Revenue Sharing in Marketplace

Modify `finalize()` in VerificationMarketplace:

```solidity
function finalize(uint256 taskId) external nonReentrant {
    // ... existing finalization logic ...

    // Protocol fee
    uint256 fee = (t.feePool * protocolFeeBps) / 10_000;

    if (fee > 0 && address(staking) != address(0)) {
        // Approve staking contract
        WETH.approve(address(staking), fee);

        // Distribute to stakers
        staking.distributeRevenue(fee);
    }

    // ... rest of logic ...
}
```

### Example 2: Mining Rewards Recording

Add to `finalize()`:

```solidity
// After calculating finalScore
for (uint256 i = 0; i < n; i++) {
    address ev = t.evaluators[i];
    Evaluation storage e = t.evals[ev];

    if (e.revealed && address(mining) != address(0)) {
        uint256 diff = e.scoreBps > finalScore
            ? (e.scoreBps - finalScore)
            : (finalScore - e.scoreBps);

        bool accurate = diff <= 250;
        mining.recordEvaluation(ev, accurate);
    }
}
```

### Example 3: Auto-Award Badges

Add to reputation update logic:

```solidity
// In VerificationMarketplace, after updating reputation
function _checkAndAwardBadges(address verifier) internal {
    if (address(badges) == address(0)) return;

    (uint256 totalEvals,
     uint256 accurateEvals,
     uint256 accuracyBps,
     ,,,,,
    ) = getVerifierReputation(verifier);

    // Award gold accuracy badge
    if (accuracyBps >= 9500 && totalEvals >= 100) {
        if (!badges.hasBadgeType(verifier, ReputationBadges.BadgeType.ACCURACY_GOLD)) {
            badges.mint(verifier, ReputationBadges.BadgeType.ACCURACY_GOLD, "");
        }
    }

    // Award silver accuracy badge
    else if (accuracyBps >= 9000 && totalEvals >= 50) {
        if (!badges.hasBadgeType(verifier, ReputationBadges.BadgeType.ACCURACY_SILVER)) {
            badges.mint(verifier, ReputationBadges.BadgeType.ACCURACY_SILVER, "");
        }
    }
}
```

### Example 4: Mint Expert NFT on Registration

Add to AuditorRegistry:

```solidity
DynamicExpertNFT public expertNFT;

function setExpertNFT(address _expertNFT) external onlyOwner {
    expertNFT = DynamicExpertNFT(_expertNFT);
}

function registerAsHumanExpert(string calldata credentialsHash) external {
    // ... existing logic ...

    // Mint expert NFT
    if (address(expertNFT) != address(0)) {
        expertNFT.mint(msg.sender);
    }

    emit HumanExpertRegistered(msg.sender, credentialsHash, block.timestamp);
}
```

---

## 🎮 Usage Examples

### For Token Holders (Governance)

```javascript
// 1. Delegate voting power
await verifyToken.delegate(myAddress); // Self-delegate

// 2. Create proposal
const proposalDescription = "Update minimum expert stake to 10 WETH";
const targets = [auditorRegistry.address];
const values = [0];
const calldatas = [
  auditorRegistry.interface.encodeFunctionData(
    "setMinHumanExpertStake",
    [ethers.parseEther("10")]
  )
];

const tx = await governor.propose(
  targets,
  values,
  calldatas,
  proposalDescription
);

// 3. Vote on proposal
const proposalId = await governor.hashProposal(targets, values, calldatas, keccak256(proposalDescription));
await governor.castVote(proposalId, 1); // 1 = For, 0 = Against

// 4. Queue and execute (after voting period)
await governor.queue(targets, values, calldatas, descriptionHash);
await new Promise(r => setTimeout(r, 48 * 60 * 60 * 1000)); // Wait 48 hours
await governor.execute(targets, values, calldatas, descriptionHash);
```

### For Token Stakers (Revenue Sharing)

```javascript
// 1. Stake VERIFY tokens
await verifyToken.approve(staking.address, ethers.parseEther("1000"));
await staking.stake(ethers.parseEther("1000"));

// 2. Check pending rewards
const pending = await staking.pendingRewards(myAddress);
console.log(`Pending WETH: ${ethers.formatEther(pending)}`);

// 3. Claim rewards
await staking.claimRewards();

// 4. Unstake (instant, no lockup)
await staking.unstake(ethers.parseEther("500"));
```

### For Verifiers (Liquidity Mining)

```javascript
// 1. Check pending mining rewards
const [totalPending, claimableEpochs] = await mining.getPendingRewards(myAddress);
console.log(`Pending VERIFY: ${ethers.formatEther(totalPending)}`);

// 2. Claim multiple epochs
await mining.claimRewards(claimableEpochs);

// 3. Check current epoch info
const [epoch, startBlock, endBlock, blocksRemaining, totalPoints] =
  await mining.getCurrentEpochInfo();

console.log(`Epoch ${epoch}: ${blocksRemaining} blocks remaining`);
```

### For NFT Collectors

```javascript
// 1. View your badges
const badgeIds = await badges.getUserBadges(myAddress);

for (const id of badgeIds) {
  const tokenURI = await badges.tokenURI(id);
  console.log(`Badge #${id}: ${tokenURI}`);
}

// 2. View expert NFT
const expertTokenId = await expertNFT.expertToToken(myAddress);
const expertURI = await expertNFT.tokenURI(expertTokenId);

// Metadata updates automatically with your stats!
```

---

## 📊 Tokenomics Overview

### VERIFY Token Distribution

| Allocation | Amount | Vesting | Purpose |
|-----------|--------|---------|---------|
| Treasury (DAO) | 400,000 (40%) | No vesting | Governance-controlled reserves |
| Team | 300,000 (30%) | 2-year linear | Core contributors |
| Mining Rewards | 200,000 (20%) | Distributed over time | Liquidity mining for verifiers |
| Airdrop | 100,000 (10%) | Immediate | Early adopters |
| **Total** | **1,000,000** | | |

### Revenue Streams

1. **Protocol Fees (5%)**: Distributed to VERIFY stakers
2. **Bond Slashing**: Redistributed to dispute winners
3. **Expert Stakes**: Economic security for weighted selection

### Incentive Alignment

- **Stakers**: Earn protocol revenue (WETH)
- **Verifiers**: Earn mining rewards (VERIFY) based on accuracy
- **Experts**: Higher stake requirement (5x), higher selection probability (2x)
- **Governance**: Token holders control protocol parameters

---

## 🔐 Security Considerations

### Governance Security

1. **Timelock Delay**: 48 hours prevents immediate malicious changes
2. **Proposal Threshold**: 100K VERIFY (10%) prevents spam
3. **Quorum**: 4% ensures community participation
4. **Multisig Admin**: Use Gnosis Safe for initial timelock admin

### Soulbound NFTs

1. **Non-transferable**: Prevents market manipulation
2. **Revokable**: Owner can revoke if fraudulent
3. **On-chain metadata**: No IPFS centralization risk

### Staking Security

1. **ReentrancyGuard**: Protection on all state-changing functions
2. **Reward Debt Pattern**: Prevents double-claiming
3. **Instant Unstaking**: No lockup period for user flexibility

---

## 🔄 Migration Path from Ownable to Governance

### Phase 1: Deploy Governance (Week 1)
1. Deploy VerifyToken, Timelock, Governor
2. Test governance on testnet
3. Distribute initial tokens

### Phase 2: Hybrid Control (Week 2-4)
1. Keep existing Ownable contracts
2. Add governance as secondary owner/proposer
3. Run parallel governance proposals for testing

### Phase 3: Full Migration (Week 5+)
1. Transfer ownership to Timelock
2. Renounce EOA ownership
3. All changes via governance

**Example migration for DisputeLadder:**

```solidity
// Current: Ownable(msg.sender)
// Step 1: Transfer to timelock
disputeLadder.transferOwnership(address(timelock));

// Step 2: All future changes via governance
// Example proposal: Update expert weight
await governor.propose(
  [disputeLadder.address],
  [0],
  [disputeLadder.interface.encodeFunctionData("setHumanExpertWeightMultiplier", [3])],
  "Increase expert weight to 3x"
);
```

---

## 🧪 Testing Checklist

### Governance Tests
- [ ] Token delegation works
- [ ] Proposals require 100K VERIFY threshold
- [ ] Voting period lasts 7 days
- [ ] Timelock enforces 48 hour delay
- [ ] Executed proposals update contracts

### Tokenomics Tests
- [ ] Staking accumulates correct rewards
- [ ] Mining distributes to accurate verifiers
- [ ] Revenue sharing calculates shares correctly
- [ ] Unstaking returns tokens instantly

### NFT Tests
- [ ] Badges are soulbound (non-transferable)
- [ ] Dynamic NFTs update with stats
- [ ] SVG generates correctly on-chain
- [ ] Badge auto-award triggers work

---

## 📈 Future Enhancements

1. **veVERIFY**: Vote-escrowed tokens for governance weight
2. **Bribes**: Incentivize voting on specific proposals
3. **Cross-chain governance**: LayerZero integration
4. **NFT marketplace**: Whitelist for badge trading (if made transferable)
5. **Reputation-weighted governance**: Expert votes count more

---

## 🆘 Troubleshooting

### "Not authorized distributor" error
- Solution: Call `staking.setRevenueDistributor(marketplace, true)` as owner

### "Already has this badge type" error
- Solution: Check `badges.hasBadgeType(user, badgeType)` before minting

### Governance proposal fails
- Check: Do you have 100K VERIFY delegated?
- Check: Has voting delay (1 block) passed?
- Check: Is voting period still active?

---

## 📚 Additional Resources

- [OpenZeppelin Governor Docs](https://docs.openzeppelin.com/contracts/4.x/governance)
- [ERC20Votes Specification](https://docs.openzeppelin.com/contracts/4.x/api/token/erc20#ERC20Votes)
- [Soulbound NFTs (Vitalik)](https://vitalik.eth.limo/general/2022/01/26/soulbound.html)

---

**Status**: ✅ All contracts implemented and ready for deployment

**Next Steps**: Deploy to testnet → Test governance → Migrate to mainnet
