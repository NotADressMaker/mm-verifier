# Juror Rewards System

## Overview

DisputeLadder uses a **pull-based reward distribution** pattern for gas efficiency and safety. Jurors accumulate rewards during dispute finalization and claim them independently when convenient.

## Why Pull-Based?

### Old Approach (Push Pattern) ❌
```solidity
// Finalize transfers WETH to all jurors in a loop
for (juror in jurors) {
    WETH.transfer(juror, reward); // If one fails, entire finalization reverts
}
```

**Problems:**
- One failed transfer blocks finalization
- High gas cost (~50K per juror)
- DoS risk from malicious juror contracts

### New Approach (Pull Pattern) ✅
```solidity
// Finalize accumulates rewards (SSTORE only)
for (juror in jurors) {
    pendingRewards[juror] += reward; // Just update state
}

// Jurors claim individually
function claimRewards() external {
    uint256 amount = pendingRewards[msg.sender];
    pendingRewards[msg.sender] = 0;
    WETH.transfer(msg.sender, amount);
}
```

**Benefits:**
- ✅ Fail-safe: One failed claim doesn't affect others
- ✅ Gas efficient: ~300K savings for L3 disputes (51 jurors)
- ✅ User control: Claim when gas prices are low

---

## How It Works

### 1. Dispute Finalization

When a dispute is finalized, rewards are **accumulated** for voting jurors:

```solidity
// DisputeLadder.sol:837
function _distributeJurorRewards(uint256 disputeId) internal {
    uint256 totalBond = challengeBond + defenseBond;
    uint256 jurorReward = totalBond / 5; // 20% to jurors
    uint256 rewardPerJuror = jurorReward / votesCast;

    for (uint256 i = 0; i < jurors.length; i++) {
        address juror = jurors[i];
        if (hasVoted[disputeId][roundIndex][juror]) {
            pendingRewards[juror] += rewardPerJuror;
            emit RewardsAccumulated(disputeId, juror, rewardPerJuror);
        }
    }
}
```

**Key Points:**
- Only jurors who **voted** receive rewards
- 20% of total bonds goes to jurors
- Rewards split equally among voters
- `RewardsAccumulated` event emitted for tracking

### 2. Claiming Rewards

Jurors call `claimRewards()` to withdraw accumulated WETH:

```solidity
// DisputeLadder.sol:825
function claimRewards() external nonReentrant {
    uint256 amount = pendingRewards[msg.sender];
    require(amount > 0, "No rewards to claim");

    // Clear balance before transfer (reentrancy protection)
    pendingRewards[msg.sender] = 0;

    // Transfer WETH to juror
    require(WETH.transfer(msg.sender, amount), "WETH transfer failed");

    emit RewardsClaimed(msg.sender, amount);
}
```

**Security Features:**
- ✅ Checks-effects-interactions pattern
- ✅ ReentrancyGuard protection
- ✅ Balance cleared before transfer
- ✅ Emits `RewardsClaimed` event

---

## Frontend Integration

### Check Pending Rewards

```typescript
import { ethers } from 'ethers';
import DisputeLadderABI from '../shared/abi/DisputeLadder.json';

const disputeLadder = new ethers.Contract(
  DISPUTE_LADDER_ADDRESS,
  DisputeLadderABI.abi,
  provider
);

// Check juror's pending rewards
const pending = await disputeLadder.pendingRewards(jurorAddress);
console.log(`Pending rewards: ${ethers.formatEther(pending)} WETH`);
```

### Claim Rewards Button

```typescript
async function claimRewards() {
  try {
    const signer = await provider.getSigner();
    const disputeLadderWithSigner = disputeLadder.connect(signer);

    // Check pending first
    const pending = await disputeLadder.pendingRewards(await signer.getAddress());
    if (pending === 0n) {
      alert('No rewards to claim');
      return;
    }

    // Claim rewards
    const tx = await disputeLadderWithSigner.claimRewards();
    console.log('Claiming rewards...', tx.hash);

    const receipt = await tx.wait();
    console.log('Rewards claimed!', receipt);

    alert(`Successfully claimed ${ethers.formatEther(pending)} WETH`);
  } catch (error) {
    console.error('Failed to claim rewards:', error);
    alert('Claim failed. See console for details.');
  }
}
```

### React Component Example

```tsx
import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';

function JurorRewards({ disputeLadder, account }) {
  const [pendingRewards, setPendingRewards] = useState('0');
  const [claiming, setClaiming] = useState(false);

  // Poll pending rewards
  useEffect(() => {
    async function checkRewards() {
      if (!account) return;
      const pending = await disputeLadder.pendingRewards(account);
      setPendingRewards(ethers.formatEther(pending));
    }

    checkRewards();
    const interval = setInterval(checkRewards, 10000); // Every 10s
    return () => clearInterval(interval);
  }, [account, disputeLadder]);

  async function handleClaim() {
    setClaiming(true);
    try {
      const tx = await disputeLadder.claimRewards();
      await tx.wait();
      alert('Rewards claimed successfully!');
      setPendingRewards('0');
    } catch (error) {
      console.error(error);
      alert('Failed to claim rewards');
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div className="juror-rewards">
      <h3>Your Juror Rewards</h3>
      <p>Pending: <strong>{pendingRewards} WETH</strong></p>
      <button
        onClick={handleClaim}
        disabled={claiming || pendingRewards === '0'}
      >
        {claiming ? 'Claiming...' : 'Claim Rewards'}
      </button>
    </div>
  );
}
```

---

## Event Monitoring

### Listen for Reward Accumulation

```typescript
// Listen for rewards accumulated during finalization
disputeLadder.on('RewardsAccumulated', (disputeId, juror, amount, event) => {
  console.log(`Rewards accumulated for juror ${juror}:`);
  console.log(`  Dispute: ${disputeId}`);
  console.log(`  Amount: ${ethers.formatEther(amount)} WETH`);

  // Notify user
  if (juror.toLowerCase() === currentUserAddress.toLowerCase()) {
    showNotification(`You earned ${ethers.formatEther(amount)} WETH as a juror!`);
  }
});

// Listen for successful claims
disputeLadder.on('RewardsClaimed', (juror, amount, event) => {
  console.log(`Juror ${juror} claimed ${ethers.formatEther(amount)} WETH`);
});
```

### Query Historical Rewards

```typescript
// Get all rewards accumulated for a juror
const filter = disputeLadder.filters.RewardsAccumulated(null, jurorAddress);
const events = await disputeLadder.queryFilter(filter, fromBlock, toBlock);

let totalAccumulated = 0n;
events.forEach(event => {
  totalAccumulated += event.args.amount;
  console.log(`Dispute ${event.args.disputeId}: ${ethers.formatEther(event.args.amount)} WETH`);
});

console.log(`Total accumulated: ${ethers.formatEther(totalAccumulated)} WETH`);
```

---

## Gas Comparison

### Before (Push Pattern)
```
finalize() gas cost:
- Base: 50K
- Per juror transfer: 50K × N jurors
- L1 (5 jurors):  300K gas
- L2 (15 jurors): 800K gas
- L3 (51 jurors): 2,600K gas
```

### After (Pull Pattern)
```
finalize() gas cost:
- Base: 50K
- Per juror SSTORE: 20K × N jurors
- L1 (5 jurors):  150K gas (50% savings)
- L2 (15 jurors): 350K gas (56% savings)
- L3 (51 jurors): 1,070K gas (59% savings)

claimRewards() gas cost:
- Per juror: ~21K gas (when they choose to claim)
```

**Net Savings:** Up to **1.5M gas** for L3 dispute finalization!

---

## Security Considerations

### 1. Reentrancy Protection
`claimRewards()` uses checks-effects-interactions:
```solidity
uint256 amount = pendingRewards[msg.sender];    // Check
pendingRewards[msg.sender] = 0;                 // Effect
WETH.transfer(msg.sender, amount);              // Interaction
```

### 2. No Loss of Funds
- Rewards never expire
- Failed claims don't affect other jurors
- Multiple disputes accumulate in same `pendingRewards[juror]`

### 3. Front-Running Safe
- Claiming is permissionless
- Only juror can claim their own rewards
- No MEV opportunities

---

## Migration from Old System

If upgrading from push-based rewards:

### 1. Check for Unrewarded Jurors
```typescript
// Query RewardsPaid events from old contract
const oldFilter = oldDisputeLadder.filters.RewardsPaid();
const oldEvents = await oldDisputeLadder.queryFilter(oldFilter);

// Compare with finalized disputes
// Identify jurors who never received rewards
```

### 2. Manual Compensation
If jurors were blocked by failed transfers:
```solidity
// Admin function to compensate (if needed)
function compensateJurors(address[] calldata jurors, uint256[] calldata amounts)
    external
    onlyOwner
{
    for (uint256 i = 0; i < jurors.length; i++) {
        pendingRewards[jurors[i]] += amounts[i];
    }
}
```

---

## FAQ

**Q: What if I never claim my rewards?**
A: Rewards remain in your `pendingRewards` balance indefinitely. No expiration.

**Q: Can rewards from multiple disputes accumulate?**
A: Yes! `pendingRewards[juror]` accumulates across all disputes you vote in.

**Q: What if WETH transfer fails during claim?**
A: The transaction reverts, but your balance remains. Try again later.

**Q: Can someone else claim my rewards?**
A: No. `msg.sender` is checked, only you can claim your rewards.

**Q: Are rewards paid in WETH or ETH?**
A: WETH. You can unwrap to ETH if desired via WETH contract.

---

## Contract References

**DisputeLadder.sol:**
- State: `mapping(address => uint256) public pendingRewards` (line 174)
- Accumulate: `_distributeJurorRewards()` (line 801)
- Claim: `claimRewards()` (line 825)
- Events: `RewardsAccumulated`, `RewardsClaimed` (lines 191-192)

**See also:**
- [Emergency Pause Guide](./EMERGENCY_PAUSE.md)
- [Bond Vault Integration](./BOND_VAULT_INTEGRATION.md)
