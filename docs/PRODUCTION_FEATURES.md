# Production Features Guide

## Overview

LLM Verifier includes production-ready safety mechanisms and gas optimizations implemented in commit `49cedb7`:

1. **Pull-Based Juror Rewards** - Gas-efficient, fail-safe reward distribution
2. **Emergency Pause** - Halt operations during security incidents
3. **Formal Interfaces** - IBondVaultWETH for better composability
4. **WETH-Based Bonds** - Safer than native ETH, reentrancy-protected

This document provides a quick reference to all production features.

---

## Quick Links

### 📚 Detailed Guides
- **[Juror Rewards System](./JUROR_REWARDS.md)** - Pull-based rewards, frontend integration, gas savings
- **[Emergency Pause Mechanism](./EMERGENCY_PAUSE.md)** - When to pause, playbook, governance
- **[Bond Vault Integration](./BOND_VAULT_INTEGRATION.md)** - IBondVaultWETH interface, examples, testing

### 📖 Other Documentation
- [BLS System](./BLS_SYSTEM.md) - Branch Legitimacy Scoring (1,400 lines)
- [Architecture Overview](../README.md) - System architecture and components

---

## Feature Summary

### 1. Pull-Based Juror Rewards

**Location:** DisputeLadder.sol

**What Changed:**
```diff
- // Old: Push rewards during finalization (risky)
- WETH.transfer(juror, reward);

+ // New: Accumulate rewards (safe)
+ pendingRewards[juror] += reward;

+ // Jurors claim separately
+ function claimRewards() external {
+     uint256 amount = pendingRewards[msg.sender];
+     pendingRewards[msg.sender] = 0;
+     WETH.transfer(msg.sender, amount);
+ }
```

**Why:**
- ✅ One failed transfer doesn't block finalization
- ✅ Gas savings: ~300K for L3 disputes (51 jurors)
- ✅ Fail-safe: Rewards never lost

**User Impact:**
- Jurors must call `claimRewards()` to withdraw
- Rewards accumulate across multiple disputes
- No expiration

**Frontend Example:**
```typescript
// Check pending
const pending = await disputeLadder.pendingRewards(jurorAddress);

// Claim
if (pending > 0) {
  await disputeLadder.claimRewards();
}
```

**Read More:** [JUROR_REWARDS.md](./JUROR_REWARDS.md)

---

### 2. Emergency Pause Mechanism

**Location:** BondVaultWETH.sol, DisputeLadder.sol

**What Changed:**
```diff
+ import "@openzeppelin/contracts/utils/Pausable.sol";

- contract BondVaultWETH is ReentrancyGuard {
+ contract BondVaultWETH is ReentrancyGuard, Pausable, Ownable {

- function deposit(uint256 amount) external {
+ function deposit(uint256 amount) external whenNotPaused {

+ function pause() external onlyOwner {
+     _pause();
+ }

+ function unpause() external onlyOwner {
+     _unpause();
+ }
```

**Why:**
- ✅ Halt operations during security incidents
- ✅ No data loss
- ✅ View functions still work

**Admin Operations:**
```typescript
// Pause (emergency)
await bondVault.pause();
await disputeLadder.pause();

// Resume (after fix)
await bondVault.unpause();
await disputeLadder.unpause();
```

**What's Paused:**
- BondVault: deposit, withdraw, lock, unlock, slash, reward
- DisputeLadder: openDispute, postDefenseBond, submitEvidence, castVote, appeal

**What Still Works:**
- All view functions (balances, dispute state)
- DisputeLadder.claimRewards() ✅
- DisputeLadder.finalize() ✅

**Read More:** [EMERGENCY_PAUSE.md](./EMERGENCY_PAUSE.md)

---

### 3. Formal Interface (IBondVaultWETH)

**Location:** contracts/interfaces/IBondVaultWETH.sol

**What Changed:**
```solidity
+ interface IBondVaultWETH {
+     // Full interface definition with errors, events, functions
+ }

- contract BondVaultWETH {
+ contract BondVaultWETH is IBondVaultWETH {
```

**Why:**
- ✅ Better composability
- ✅ External contracts can integrate without importing full implementation
- ✅ Clear API documentation
- ✅ Type safety

**Usage:**
```solidity
import "./interfaces/IBondVaultWETH.sol";

contract MyMarketplace {
    IBondVaultWETH public bondVault;

    constructor(IBondVaultWETH _bondVault) {
        bondVault = _bondVault;
    }

    function lockUserBond(bytes32 taskId, address user, uint256 amount) external {
        bondVault.lockBond(taskId, user, amount);
    }
}
```

**Read More:** [BOND_VAULT_INTEGRATION.md](./BOND_VAULT_INTEGRATION.md)

---

### 4. WETH-Based Bonds (From Commit 76ab2cf)

**Location:** All contracts

**What Changed:**
```diff
- function openDispute() external payable {
-     require(msg.value >= minBond);
+ function openDispute(uint256 bondAmount) external {
+     require(bondAmount >= minBond);
+     WETH.transferFrom(msg.sender, address(this), bondAmount);
```

**Why:**
- ✅ Safer than native ETH (no reentrancy hazards)
- ✅ Standard ERC20 approval flow
- ✅ Consistent with DeFi best practices
- ✅ Better accounting (free vs locked bonds)

**User Workflow:**
```typescript
// 1. Approve DisputeLadder to spend WETH
await WETH.approve(DISPUTE_LADDER_ADDRESS, bondAmount);

// 2. Open dispute with explicit bond amount
await disputeLadder.openDispute(bundleId, branchId, faultType, bondAmount);
```

**Migration:**
- Old: `openDispute{value: 0.01 ether}(...)`
- New: `openDispute(..., parseEther("0.01"))`

**Read More:** Commit message for `76ab2cf`

---

## Contract Addresses

After deployment, add your contract addresses here:

```typescript
// Arbitrum Sepolia (Testnet)
export const CONTRACTS = {
  WETH: '0x...',
  BondVault: '0x...',
  DisputeLadder: '0x...',
  VerifierMarketplace: '0x...',
  AuditorRegistry: '0x...',
  BundleRegistry: '0x...',
  BLSSlashingManager: '0x...',
};

// Arbitrum One (Mainnet)
export const MAINNET_CONTRACTS = {
  // TBD
};
```

---

## Deployment Checklist

### Pre-Deployment
- [ ] Audit smart contracts (especially new features)
- [ ] Test pull-based rewards on testnet
- [ ] Test pause/unpause on testnet
- [ ] Test WETH bond flow (approve → deposit → lock → unlock)
- [ ] Deploy to Arbitrum Sepolia
- [ ] Verify contracts on Arbiscan
- [ ] Test all features on testnet

### Production Deployment
- [ ] Deploy to Arbitrum One
- [ ] Verify contracts on Arbiscan
- [ ] Transfer ownership to multisig
- [ ] Fund BondVault with initial WETH reserves
- [ ] Update frontend with new contract addresses
- [ ] Update API with new contract addresses
- [ ] Announce launch with documentation links

### Post-Deployment
- [ ] Monitor for 24 hours
- [ ] Check first few disputes work correctly
- [ ] Verify jurors can claim rewards
- [ ] Test emergency pause (on testnet copy)
- [ ] Set up monitoring/alerts
- [ ] Create incident response plan

---

## Monitoring & Alerts

### Critical Metrics

```typescript
// Monitor contract health
const metrics = {
  // BondVault
  isPaused: await bondVault.paused(),
  vaultBalance: await bondVault.vaultBalance(),

  // DisputeLadder
  isLadderPaused: await disputeLadder.paused(),
  nextDisputeId: await disputeLadder.nextDisputeId(),

  // Pending rewards (sample top jurors)
  pendingRewards: await Promise.all(
    topJurors.map(j => disputeLadder.pendingRewards(j))
  ),
};

// Alert if paused
if (metrics.isPaused || metrics.isLadderPaused) {
  sendAlert('CRITICAL: Contracts are paused!');
}

// Alert if vault balance low
if (metrics.vaultBalance < MIN_RESERVE) {
  sendAlert('WARNING: BondVault reserves low');
}
```

### Event Monitoring

```typescript
// Monitor critical events
bondVault.on('BondSlashed', (refId, user, amount, to) => {
  logToDatabase({ event: 'BondSlashed', refId, user, amount, to });
  if (amount > LARGE_SLASH_THRESHOLD) {
    sendAlert(`Large slash: ${ethers.formatEther(amount)} WETH`);
  }
});

disputeLadder.on('RewardsAccumulated', (disputeId, juror, amount) => {
  logToDatabase({ event: 'RewardsAccumulated', disputeId, juror, amount });
});

disputeLadder.on('RewardsClaimed', (juror, amount) => {
  logToDatabase({ event: 'RewardsClaimed', juror, amount });
});
```

---

## Governance

### Owner Role

**Responsibilities:**
- Emergency pause/unpause
- Update bond requirements
- Configure dispute parameters

**Best Practices:**
- ✅ Use multisig (Gnosis Safe 3-of-5 or 4-of-7)
- ✅ Use timelock for non-emergency changes
- ✅ Document all owner actions
- ✅ Test on testnet first

**Setup:**
```typescript
// Transfer ownership to multisig
await bondVault.transferOwnership(MULTISIG_ADDRESS);
await disputeLadder.transferOwnership(MULTISIG_ADDRESS);

// Verify
console.assert(await bondVault.owner() === MULTISIG_ADDRESS);
console.assert(await disputeLadder.owner() === MULTISIG_ADDRESS);
```

### Timelock Pattern

For non-emergency changes:

```solidity
// Deploy timelock (2-day delay)
Timelock timelock = new Timelock(2 days, MULTISIG_ADDRESS);

// Transfer ownership to timelock
bondVault.transferOwnership(address(timelock));

// Now all changes have 2-day delay
// Emergency pause still possible via separate guardian
```

---

## Testing

### Unit Tests

```bash
cd contracts/
npm test
```

**Key Test Scenarios:**
- Pull-based rewards accumulate correctly
- Jurors can claim accumulated rewards
- Pause prevents state changes
- View functions work when paused
- Only owner can pause/unpause
- WETH bonds work correctly

### Integration Tests

```bash
npm run test:integration
```

**Key Flows:**
- Full dispute flow with WETH bonds
- Juror votes → finalize → claim rewards
- Emergency pause during active dispute
- Resume after pause

### Gas Benchmarks

```bash
npm run test:gas
```

**Expected Gas Costs:**
- `finalize()` with 5 jurors: ~150K gas
- `finalize()` with 51 jurors: ~1.07M gas
- `claimRewards()`: ~21K gas

---

## Support

### Documentation
- **Juror Rewards:** [JUROR_REWARDS.md](./JUROR_REWARDS.md)
- **Emergency Pause:** [EMERGENCY_PAUSE.md](./EMERGENCY_PAUSE.md)
- **Bond Vault:** [BOND_VAULT_INTEGRATION.md](./BOND_VAULT_INTEGRATION.md)
- **BLS System:** [BLS_SYSTEM.md](./BLS_SYSTEM.md)

### Community
- **Discord:** [Your Discord Link]
- **GitHub Issues:** [Report bugs](https://github.com/your-repo/issues)
- **Documentation:** [Full docs site]

### Security
- **Report vulnerabilities:** security@your-domain.com
- **Bug bounty:** [Link to bug bounty program]

---

## Changelog

### v0.2.0 (Commit 49cedb7)
- ✅ Pull-based juror rewards
- ✅ Emergency pause mechanism
- ✅ Formal IBondVaultWETH interface
- ✅ Production safety improvements

### v0.1.0 (Commit 76ab2cf)
- ✅ WETH-based bonds
- ✅ Canonical type libraries (VerifierTypes, VerifierHash)
- ✅ Centralized BondVaultWETH
- ✅ Shared ABI infrastructure

### v0.0.1 (Commit 719ed1b)
- ✅ Multi-tier Dispute Ladder (L0→L1→L2→L3)
- ✅ VRF jury selection
- ✅ Commit-reveal voting
- ✅ BLS Slashing Manager
- ✅ Evidence bundle registry

---

## License

MIT License - See [LICENSE](../LICENSE)
