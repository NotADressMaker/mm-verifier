# Emergency Pause Mechanism

## Overview

BondVaultWETH and DisputeLadder implement OpenZeppelin's **Pausable** pattern for emergency control. The owner (governance/multisig) can halt operations during security incidents while preserving all data.

## Why Pausable?

**Use Cases:**
- 🚨 Security vulnerability discovered
- 🔧 Critical bug requires immediate mitigation
- 📊 Suspicious activity detected
- ⏸️ System upgrade coordination

**What Happens When Paused:**
- ❌ State-changing functions revert
- ✅ View functions still work (read balances, dispute state)
- ✅ No data loss
- ✅ Resumes exactly where it left off

---

## Affected Contracts

### 1. BondVaultWETH

**Paused Functions:**
- `deposit()` - Cannot deposit WETH
- `depositETH()` - Cannot deposit ETH
- `withdraw()` - Cannot withdraw bonds
- `lockBond()` - Marketplace cannot lock bonds
- `unlockBond()` - Marketplace cannot unlock bonds
- `slashBond()` - DisputeLadder cannot slash
- `payReward()` - Cannot pay rewards
- `fundVault()` - Cannot fund vault

**Still Work:**
- `freeBondOf()` - Check free balance
- `lockedBondOf()` - Check locked balance
- `totalBondOf()` - Check total balance
- `vaultBalance()` - Check vault reserves

### 2. DisputeLadder

**Paused Functions:**
- `openDispute()` - Cannot open new disputes
- `postDefenseBond()` - Cannot post defense
- `submitEvidence()` - Cannot submit evidence
- `castVote()` - Cannot vote
- `appeal()` - Cannot appeal

**Still Work:**
- `claimRewards()` - **Not paused** (jurors can still claim)
- `finalize()` - **Not paused** (can finalize pending disputes)
- `getDispute()` - Read dispute state
- `getRound()` - Read round state
- `pendingRewards` - Check pending rewards

---

## Admin Operations

### Pausing

**Who:** Contract owner (should be multisig or governance)

**How:**
```solidity
// BondVaultWETH
bondVault.pause();

// DisputeLadder
disputeLadder.pause();
```

**TypeScript:**
```typescript
import { ethers } from 'ethers';

const owner = await ethers.getSigner(OWNER_ADDRESS);
const bondVault = new ethers.Contract(
  BOND_VAULT_ADDRESS,
  BondVaultWETH.abi,
  owner
);

// Pause operations
const tx = await bondVault.pause();
await tx.wait();
console.log('BondVault paused');

// Check paused state
const isPaused = await bondVault.paused();
console.log('Paused:', isPaused); // true
```

### Unpausing

**After emergency resolved:**
```solidity
// Resume operations
bondVault.unpause();
disputeLadder.unpause();
```

**TypeScript:**
```typescript
// Resume operations
const tx = await bondVault.unpause();
await tx.wait();
console.log('BondVault resumed');
```

---

## Emergency Response Playbook

### Step 1: Detect Issue

**Monitoring:**
```typescript
// Monitor for suspicious activity
disputeLadder.on('DisputeOpened', async (disputeId, bundleId, challenger) => {
  // Check if dispute pattern is suspicious
  const recentDisputes = await getRecentDisputes(challenger);
  if (recentDisputes.length > THRESHOLD) {
    alertSecurityTeam('Potential abuse detected', { challenger, disputeId });
  }
});

// Monitor for failed transactions
provider.on('error', (error) => {
  if (error.code === 'CALL_EXCEPTION') {
    alertSecurityTeam('Contract call failed', error);
  }
});
```

### Step 2: Assess Severity

**Decision Tree:**
```
Is it a critical security vulnerability?
├─ YES → Pause immediately
│  └─ Then investigate
└─ NO → Investigate first
   ├─ If confirmed critical → Pause
   └─ If false alarm → Monitor
```

**Critical Indicators:**
- Funds at risk
- Exploit actively being used
- Smart contract bug confirmed
- Oracle manipulation detected

### Step 3: Execute Pause

**Multisig Process:**
```bash
# 1. Propose pause transaction
gnosis-safe propose \
  --to $BOND_VAULT \
  --data $(cast calldata "pause()")

# 2. Signers approve
gnosis-safe approve --tx-hash $TX_HASH

# 3. Execute when threshold reached
gnosis-safe execute --tx-hash $TX_HASH
```

**Single Owner (Development Only):**
```typescript
// ⚠️ Only use single owner in development!
const tx = await bondVault.pause();
await tx.wait();

const tx2 = await disputeLadder.pause();
await tx2.wait();

console.log('Emergency pause activated');
```

### Step 4: Communicate

**Notify Users:**
```typescript
// Broadcast emergency notification
await sendNotification({
  title: 'Emergency Pause Activated',
  message: 'Operations temporarily halted due to [reason]. Funds are safe. Updates at [URL].',
  channels: ['email', 'discord', 'twitter'],
});

// Update status page
await updateStatusPage({
  status: 'major_outage',
  message: 'System paused for emergency maintenance',
  incident_id: generateIncidentId(),
});
```

**Public Communication Template:**
```markdown
# Security Incident - [DATE]

## Status: PAUSED

We have temporarily paused LLM Verifier operations due to [brief description].

**What happened:**
- [Timeline of events]

**User impact:**
- Bond deposits/withdrawals: Paused
- New disputes: Paused
- Active disputes: Unchanged
- Juror rewards: Can still claim
- User funds: Safe and secure

**What we're doing:**
1. Investigating root cause
2. Developing fix
3. Testing thoroughly
4. Will resume when safe

**ETA:** [Estimated time or "updates every N hours"]

**User action required:** None. Your funds are safe.

Updates: [Discord/Twitter/Blog link]
```

### Step 5: Investigate

**Data Collection:**
```solidity
// Check contract state
uint256 vaultBalance = await bondVault.vaultBalance();
uint256 totalBondsLocked = await calculateTotalLocked();

// Query recent transactions
const recentTxs = await provider.getLogs({
  address: BOND_VAULT_ADDRESS,
  fromBlock: currentBlock - 1000,
  toBlock: currentBlock,
});

// Analyze for exploit pattern
const suspiciousTxs = recentTxs.filter(tx => {
  // Check for unusual patterns
  return isUnusualPattern(tx);
});
```

**Incident Report Template:**
```markdown
# Incident Report - [DATE]

## Summary
[One-line description]

## Timeline
- HH:MM - Issue detected
- HH:MM - Pause executed
- HH:MM - Root cause identified
- HH:MM - Fix deployed
- HH:MM - Operations resumed

## Root Cause
[Technical explanation]

## Impact
- Users affected: X
- Funds at risk: Y WETH
- Actual loss: Z WETH
- Duration: N hours

## Resolution
[What was done to fix]

## Prevention
[What changes prevent recurrence]
```

### Step 6: Fix & Deploy

**Testing Checklist:**
- [ ] Reproduce issue in test environment
- [ ] Verify fix resolves root cause
- [ ] Run full test suite
- [ ] Audit code changes
- [ ] Dry-run deployment on testnet
- [ ] Verify with community/auditors

**Deployment:**
```bash
# Deploy fixed contract
npx hardhat run scripts/deploy-fix.ts --network arbitrum-sepolia

# Verify on Arbiscan
npx hardhat verify --network arbitrum-sepolia $NEW_ADDRESS

# Update frontend to use new address
# Update multisig to control new contract
```

### Step 7: Resume Operations

**Pre-flight Checks:**
```typescript
// 1. Verify fix is deployed
const codeHash = await provider.getCode(BOND_VAULT_ADDRESS);
assert(codeHash === EXPECTED_CODE_HASH, 'Wrong contract deployed');

// 2. Verify owner is multisig
const owner = await bondVault.owner();
assert(owner === MULTISIG_ADDRESS, 'Owner not set correctly');

// 3. Test critical paths
await testDeposit();
await testWithdraw();
await testLockUnlock();

// 4. Monitor for 15 minutes before full unpause
await sleep(15 * 60 * 1000);
```

**Unpause:**
```typescript
// Resume operations
const tx1 = await bondVault.unpause();
await tx1.wait();

const tx2 = await disputeLadder.unpause();
await tx2.wait();

console.log('Operations resumed');

// Notify users
await sendNotification({
  title: 'Operations Resumed',
  message: 'LLM Verifier is back online. All systems normal.',
});
```

---

## Governance Best Practices

### 1. Use Multisig for Owner

**❌ Bad:**
```solidity
// Single EOA as owner
address owner = 0x1234...;
```

**✅ Good:**
```solidity
// Gnosis Safe 3-of-5 multisig
address owner = 0xSafeAddress;
```

**Setup:**
```typescript
// Transfer ownership to multisig
const tx = await bondVault.transferOwnership(MULTISIG_ADDRESS);
await tx.wait();

// Verify
const newOwner = await bondVault.owner();
assert(newOwner === MULTISIG_ADDRESS);
```

### 2. Use Timelock for Non-Emergency Changes

**Pattern:**
```solidity
// Deploy Timelock contract
Timelock timelock = new Timelock(2 days, MULTISIG_ADDRESS);

// Transfer ownership to Timelock
bondVault.transferOwnership(address(timelock));

// Now all changes have 2-day delay (except emergency pause)
```

### 3. Emergency Pause Bypass

For true emergencies, have a separate "guardian" role:

```solidity
contract BondVaultWETH is Pausable, Ownable {
    address public guardian;

    modifier onlyOwnerOrGuardian() {
        require(msg.sender == owner() || msg.sender == guardian, "Not authorized");
        _;
    }

    function emergencyPause() external onlyOwnerOrGuardian {
        _pause();
    }

    function setGuardian(address _guardian) external onlyOwner {
        guardian = _guardian;
    }
}
```

---

## Testing Emergency Scenarios

### Test Script

```typescript
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('Emergency Pause', () => {
  let bondVault, owner, user;

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();
    const BondVault = await ethers.getContractFactory('BondVaultWETH');
    bondVault = await BondVault.deploy(WETH, MARKETPLACE, DISPUTE_LADDER);
  });

  it('should pause deposit when paused', async () => {
    // Pause
    await bondVault.pause();

    // Try to deposit
    await expect(
      bondVault.connect(user).deposit(ethers.parseEther('1'))
    ).to.be.revertedWith('Pausable: paused');
  });

  it('should allow view functions when paused', async () => {
    await bondVault.pause();

    // Should still work
    const balance = await bondVault.freeBondOf(user.address);
    expect(balance).to.equal(0);
  });

  it('should resume after unpause', async () => {
    // Pause
    await bondVault.pause();

    // Unpause
    await bondVault.unpause();

    // Should work now
    await expect(
      bondVault.connect(user).deposit(ethers.parseEther('1'))
    ).to.not.be.reverted;
  });

  it('should only allow owner to pause', async () => {
    await expect(
      bondVault.connect(user).pause()
    ).to.be.revertedWith('Ownable: caller is not the owner');
  });
});
```

---

## Monitoring & Alerts

### Alert Setup

```typescript
// Monitor paused state
async function monitorPausedState() {
  const isPaused = await bondVault.paused();

  if (isPaused) {
    await sendAlert({
      severity: 'critical',
      title: 'BondVault is PAUSED',
      message: 'Operations have been halted',
      oncall: true,
    });
  }

  // Check again in 1 minute
  setTimeout(monitorPausedState, 60000);
}

// Start monitoring
monitorPausedState();
```

### Dashboard Widget

```tsx
function EmergencyStatus({ bondVault, disputeLadder }) {
  const [vaultPaused, setVaultPaused] = useState(false);
  const [ladderPaused, setLadderPaused] = useState(false);

  useEffect(() => {
    async function checkStatus() {
      setVaultPaused(await bondVault.paused());
      setLadderPaused(await disputeLadder.paused());
    }
    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!vaultPaused && !ladderPaused) {
    return <Badge color="green">Operational</Badge>;
  }

  return (
    <Alert severity="error">
      <strong>Emergency Pause Active</strong>
      {vaultPaused && <div>• BondVault: PAUSED</div>}
      {ladderPaused && <div>• DisputeLadder: PAUSED</div>}
      <Link to="/status">View Status Page →</Link>
    </Alert>
  );
}
```

---

## FAQ

**Q: Who can pause the contracts?**
A: Only the contract owner (should be multisig or governance).

**Q: Can users withdraw during pause?**
A: No. All state-changing operations are halted.

**Q: Are funds at risk during pause?**
A: No. Pause prevents new operations but doesn't affect existing balances.

**Q: Can jurors still claim rewards when paused?**
A: Yes! `claimRewards()` is **not paused** for safety.

**Q: How long can contracts stay paused?**
A: Indefinitely, but should be minimized. Communicate ETA to users.

**Q: Can we selectively pause features?**
A: Current implementation is all-or-nothing. Could extend with granular controls.

---

## Contract References

**BondVaultWETH.sol:**
- Inheritance: `Pausable, Ownable` (line 30)
- Pause function: `pause()` (line 332)
- Unpause function: `unpause()` (line 340)
- Modifiers: `whenNotPaused` on all state-changing functions

**DisputeLadder.sol:**
- Inheritance: `Pausable` (line 32)
- Pause function: `pause()` (line 853)
- Unpause function: `unpause()` (line 861)
- Modifiers: `whenNotPaused` on user-facing functions

**See also:**
- [Juror Rewards Guide](./JUROR_REWARDS.md)
- [Bond Vault Integration](./BOND_VAULT_INTEGRATION.md)
- [OpenZeppelin Pausable Docs](https://docs.openzeppelin.com/contracts/4.x/api/security#Pausable)
