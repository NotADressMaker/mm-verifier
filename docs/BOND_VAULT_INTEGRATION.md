# Bond Vault Integration Guide

## Overview

**IBondVaultWETH** provides a formal interface for integrating with the centralized WETH bond management system. This guide shows how to build contracts and applications that interact with BondVaultWETH.

## Architecture

```
┌─────────────────┐
│  User Wallets   │
└────────┬────────┘
         │ deposit/withdraw
         ↓
┌─────────────────────────────────┐
│       BondVaultWETH             │
│  (Centralized Bond Management)  │
└─┬──────────┬──────────────────┬─┘
  │          │                  │
  │ lock/    │ slash            │ reward
  │ unlock   │                  │
  ↓          ↓                  ↓
┌──────┐  ┌─────────┐  ┌────────────┐
│Market│  │Dispute  │  │   Both     │
│place │  │Ladder   │  │  Contracts │
└──────┘  └─────────┘  └────────────┘
```

**Authorization Model:**
- **Users:** Can deposit/withdraw their own bonds
- **Marketplace:** Can lock/unlock bonds for tasks
- **DisputeLadder:** Can slash bonds for penalties
- **Both:** Can pay rewards from vault reserves

---

## Interface Definition

```solidity
// contracts/interfaces/IBondVaultWETH.sol
interface IBondVaultWETH {
    // Errors
    error NotAuthorized();
    error InsufficientFreeBond();
    error LockNotFound();
    error ZeroAmount();
    error InsufficientLockedBond();
    error TransferFailed();

    // Events
    event BondDeposited(address indexed user, uint256 amount);
    event BondWithdrawn(address indexed user, uint256 amount);
    event BondLocked(bytes32 indexed taskId, address indexed user, uint256 amount);
    event BondUnlocked(bytes32 indexed taskId, address indexed user, uint256 amount);
    event BondSlashed(bytes32 indexed refId, address indexed user, uint256 amount, address indexed to);
    event RewardPaid(bytes32 indexed refId, address indexed to, uint256 amount);

    // View Functions
    function WETH() external view returns (address);
    function freeBondOf(address user) external view returns (uint256);
    function lockedBondOf(bytes32 taskId, address user) external view returns (uint256);
    function totalBondOf(address user) external view returns (uint256);
    function totalLockedOf(address user) external view returns (uint256);
    function vaultBalance() external view returns (uint256);

    // User Operations
    function deposit(uint256 amount) external;
    function depositETH() external payable;
    function withdraw(uint256 amount) external;

    // Authorized Operations
    function lockBond(bytes32 taskId, address user, uint256 amount) external;
    function unlockBond(bytes32 taskId, address user, uint256 amount) external;
    function slashBond(bytes32 refId, address user, uint256 amount, address to) external;
    function payReward(bytes32 refId, address to, uint256 amount) external;
    function fundVault(uint256 amount) external;
}
```

---

## User Integration

### Depositing Bonds

Users must deposit WETH before participating:

```typescript
import { ethers } from 'ethers';

const WETH = new ethers.Contract(WETH_ADDRESS, WETH_ABI, signer);
const bondVault = new ethers.Contract(BOND_VAULT_ADDRESS, IBondVaultWETH.abi, signer);

// Option 1: Deposit existing WETH
async function depositWETH(amount) {
  // Approve BondVault to spend WETH
  const approveTx = await WETH.approve(BOND_VAULT_ADDRESS, amount);
  await approveTx.wait();

  // Deposit to vault
  const depositTx = await bondVault.deposit(amount);
  await depositTx.wait();

  console.log(`Deposited ${ethers.formatEther(amount)} WETH`);
}

// Option 2: Deposit ETH (auto-wraps to WETH)
async function depositETH(amount) {
  const tx = await bondVault.depositETH({ value: amount });
  await tx.wait();

  console.log(`Deposited ${ethers.formatEther(amount)} ETH (wrapped to WETH)`);
}

// Check balance
const freeBond = await bondVault.freeBondOf(userAddress);
console.log(`Free bond: ${ethers.formatEther(freeBond)} WETH`);
```

### Withdrawing Bonds

```typescript
async function withdrawBond(amount) {
  // Check free balance first
  const freeBond = await bondVault.freeBondOf(await signer.getAddress());

  if (freeBond < amount) {
    throw new Error(`Insufficient free bond. Have ${ethers.formatEther(freeBond)}, need ${ethers.formatEther(amount)}`);
  }

  // Withdraw
  const tx = await bondVault.withdraw(amount);
  await tx.wait();

  console.log(`Withdrew ${ethers.formatEther(amount)} WETH`);
}
```

### React Component

```tsx
import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';

function BondManager({ bondVault, weth, account }) {
  const [freeBond, setFreeBond] = useState('0');
  const [lockedBond, setLockedBond] = useState('0');
  const [depositAmount, setDepositAmount] = useState('');

  useEffect(() => {
    async function loadBalances() {
      const free = await bondVault.freeBondOf(account);
      const locked = await bondVault.totalLockedOf(account);
      setFreeBond(ethers.formatEther(free));
      setLockedBond(ethers.formatEther(locked));
    }
    loadBalances();
    const interval = setInterval(loadBalances, 10000);
    return () => clearInterval(interval);
  }, [account]);

  async function handleDeposit() {
    const amount = ethers.parseEther(depositAmount);

    // Approve + Deposit
    const approveTx = await weth.approve(bondVault.address, amount);
    await approveTx.wait();

    const depositTx = await bondVault.deposit(amount);
    await depositTx.wait();

    setDepositAmount('');
    alert('Deposit successful!');
  }

  return (
    <div className="bond-manager">
      <h3>Your Bonds</h3>
      <div>Free: <strong>{freeBond} WETH</strong></div>
      <div>Locked: <strong>{lockedBond} WETH</strong></div>

      <h4>Deposit</h4>
      <input
        type="number"
        value={depositAmount}
        onChange={(e) => setDepositAmount(e.target.value)}
        placeholder="Amount in WETH"
      />
      <button onClick={handleDeposit}>Deposit</button>
    </div>
  );
}
```

---

## Marketplace Integration

Marketplaces lock/unlock bonds for task participation:

```solidity
// Example: TaskMarketplace contract
contract TaskMarketplace {
    IBondVaultWETH public immutable bondVault;
    uint256 public constant TASK_BOND = 0.1 ether; // 0.1 WETH

    constructor(IBondVaultWETH _bondVault) {
        bondVault = _bondVault;
    }

    function createTask(bytes32 promptHash) external returns (bytes32 taskId) {
        taskId = keccak256(abi.encodePacked(msg.sender, promptHash, block.timestamp));

        // Lock creator's bond
        bondVault.lockBond(taskId, msg.sender, TASK_BOND);

        emit TaskCreated(taskId, msg.sender);
    }

    function completeTask(bytes32 taskId, address creator) external onlyOwner {
        // Unlock creator's bond
        bondVault.unlockBond(taskId, creator, TASK_BOND);

        emit TaskCompleted(taskId);
    }
}
```

**Key Points:**
- Use `bytes32 taskId` for uniqueness
- Check user has sufficient free bond before locking
- Always unlock bonds when task completes

**Deployment:**
```typescript
// Deploy marketplace with BondVault reference
const TaskMarketplace = await ethers.getContractFactory('TaskMarketplace');
const marketplace = await TaskMarketplace.deploy(BOND_VAULT_ADDRESS);
await marketplace.deployed();

// BondVault must authorize marketplace
// (This is set in BondVault constructor)
```

---

## Dispute System Integration

Dispute systems slash bonds for penalties:

```solidity
// Example: DisputeResolver contract
contract DisputeResolver {
    IBondVaultWETH public immutable bondVault;

    constructor(IBondVaultWETH _bondVault) {
        bondVault = _bondVault;
    }

    function resolveDispute(
        bytes32 disputeId,
        address guilty,
        address innocent,
        uint256 slashAmount
    ) external onlyOwner {
        // Slash guilty party's bond, send to innocent party
        bondVault.slashBond(disputeId, guilty, slashAmount, innocent);

        emit DisputeResolved(disputeId, guilty, slashAmount);
    }

    function rewardWinner(bytes32 disputeId, address winner, uint256 amount) external {
        // Pay reward from vault reserves
        bondVault.payReward(disputeId, winner, amount);

        emit RewardPaid(disputeId, winner, amount);
    }
}
```

**Important:**
- `slashBond()` slashes from total bonds (free + locked)
- Slashed funds go directly to `to` address
- `payReward()` pays from vault reserves (must fund first)

---

## Advanced: Custom Bond Manager

Build a custom bond management contract:

```solidity
// Example: StakedBondManager
contract StakedBondManager {
    IBondVaultWETH public immutable bondVault;

    // Track user stakes
    mapping(address => uint256) public stakedAmount;
    mapping(address => uint256) public rewardBalance;

    constructor(IBondVaultWETH _bondVault) {
        bondVault = _bondVault;
    }

    /**
     * @notice Stake WETH to earn rewards
     * @dev User approves this contract, we deposit to BondVault
     */
    function stake(uint256 amount) external {
        IERC20(bondVault.WETH()).transferFrom(msg.sender, address(this), amount);

        // Approve and deposit to BondVault
        IERC20(bondVault.WETH()).approve(address(bondVault), amount);
        bondVault.deposit(amount);

        stakedAmount[msg.sender] += amount;

        emit Staked(msg.sender, amount);
    }

    /**
     * @notice Unstake and withdraw
     */
    function unstake(uint256 amount) external {
        require(stakedAmount[msg.sender] >= amount, "Insufficient stake");

        // Withdraw from BondVault
        bondVault.withdraw(amount);

        stakedAmount[msg.sender] -= amount;

        // Transfer WETH to user
        IERC20(bondVault.WETH()).transfer(msg.sender, amount);

        emit Unstaked(msg.sender, amount);
    }

    /**
     * @notice Distribute rewards to stakers
     * @dev Only authorized contracts can call this
     */
    function distributeRewards(address staker, uint256 amount) external onlyAuthorized {
        rewardBalance[staker] += amount;
    }

    /**
     * @notice Claim accumulated rewards
     */
    function claimRewards() external {
        uint256 amount = rewardBalance[msg.sender];
        require(amount > 0, "No rewards");

        rewardBalance[msg.sender] = 0;

        // Pay rewards from our balance
        bondVault.payReward(bytes32(0), msg.sender, amount);
    }
}
```

---

## Event Monitoring

### Listen for Bond Events

```typescript
// Monitor deposits
bondVault.on('BondDeposited', (user, amount, event) => {
  console.log(`${user} deposited ${ethers.formatEther(amount)} WETH`);
  updateUserBalance(user);
});

// Monitor locks
bondVault.on('BondLocked', (taskId, user, amount, event) => {
  console.log(`Task ${taskId}: Locked ${ethers.formatEther(amount)} from ${user}`);
  updateTaskStatus(taskId);
});

// Monitor slashing
bondVault.on('BondSlashed', (refId, user, amount, to, event) => {
  console.log(`Slashed ${ethers.formatEther(amount)} from ${user} → ${to}`);
  notifyUser(user, 'Bond slashed due to dispute');
});

// Monitor rewards
bondVault.on('RewardPaid', (refId, to, amount, event) => {
  console.log(`Reward: ${ethers.formatEther(amount)} WETH → ${to}`);
  notifyUser(to, `You earned ${ethers.formatEther(amount)} WETH!`);
});
```

### Query Historical Data

```typescript
// Get all deposits by user
const depositFilter = bondVault.filters.BondDeposited(userAddress);
const deposits = await bondVault.queryFilter(depositFilter, fromBlock);

let totalDeposited = 0n;
deposits.forEach(event => {
  totalDeposited += event.args.amount;
});

console.log(`Total deposited: ${ethers.formatEther(totalDeposited)} WETH`);

// Get all locks for a task
const lockFilter = bondVault.filters.BondLocked(taskId);
const locks = await bondVault.queryFilter(lockFilter);

locks.forEach(event => {
  console.log(`${event.args.user}: ${ethers.formatEther(event.args.amount)} WETH locked`);
});
```

---

## Testing

### Unit Tests

```typescript
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('IBondVaultWETH Integration', () => {
  let bondVault, marketplace, weth, owner, user;

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();

    // Deploy mock WETH
    const MockWETH = await ethers.getContractFactory('MockWETH');
    weth = await MockWETH.deploy();

    // Deploy BondVault
    const BondVault = await ethers.getContractFactory('BondVaultWETH');
    bondVault = await BondVault.deploy(
      weth.address,
      owner.address, // marketplace (temporarily)
      owner.address  // disputeLadder (temporarily)
    );

    // Deploy marketplace
    const Marketplace = await ethers.getContractFactory('TaskMarketplace');
    marketplace = await Marketplace.deploy(bondVault.address);
  });

  it('should allow user to deposit and withdraw', async () => {
    const amount = ethers.parseEther('1');

    // Mint WETH to user
    await weth.connect(user).deposit({ value: amount });

    // Approve and deposit
    await weth.connect(user).approve(bondVault.address, amount);
    await bondVault.connect(user).deposit(amount);

    // Check balance
    const balance = await bondVault.freeBondOf(user.address);
    expect(balance).to.equal(amount);

    // Withdraw
    await bondVault.connect(user).withdraw(amount);
    const balanceAfter = await bondVault.freeBondOf(user.address);
    expect(balanceAfter).to.equal(0);
  });

  it('should allow marketplace to lock/unlock', async () => {
    const amount = ethers.parseEther('0.1');
    const taskId = ethers.id('task1');

    // User deposits
    await weth.connect(user).deposit({ value: amount });
    await weth.connect(user).approve(bondVault.address, amount);
    await bondVault.connect(user).deposit(amount);

    // Marketplace locks (owner impersonating marketplace)
    await bondVault.connect(owner).lockBond(taskId, user.address, amount);

    // Check locked
    const locked = await bondVault.lockedBondOf(taskId, user.address);
    expect(locked).to.equal(amount);

    // Unlock
    await bondVault.connect(owner).unlockBond(taskId, user.address, amount);
    const lockedAfter = await bondVault.lockedBondOf(taskId, user.address);
    expect(lockedAfter).to.equal(0);
  });

  it('should enforce authorization', async () => {
    const taskId = ethers.id('task1');
    const amount = ethers.parseEther('0.1');

    // Non-marketplace cannot lock
    await expect(
      bondVault.connect(user).lockBond(taskId, user.address, amount)
    ).to.be.revertedWith('NotAuthorized');
  });
});
```

---

## Security Considerations

### 1. Authorization

**Always verify caller authorization:**
```solidity
function lockBond(bytes32 taskId, address user, uint256 amount) external {
    require(msg.sender == marketplace, "NotAuthorized");
    // ...
}
```

### 2. Reentrancy Protection

BondVaultWETH uses `nonReentrant` on all state-changing functions:
```solidity
function deposit(uint256 amount) external nonReentrant whenNotPaused {
    // Safe from reentrancy
}
```

### 3. Check-Effects-Interactions

Always update state before external calls:
```solidity
// ✅ Good
totalBondOf[user] -= amount;
WETH.transfer(user, amount);

// ❌ Bad
WETH.transfer(user, amount);
totalBondOf[user] -= amount;
```

### 4. Handle Failed Transfers

WETH transfers can fail (e.g., paused token):
```solidity
bool success = WETH.transfer(user, amount);
require(success, "Transfer failed");
```

---

## Gas Optimization Tips

### 1. Batch Operations

Instead of multiple lock/unlock calls:
```solidity
function batchLockBonds(
    bytes32[] calldata taskIds,
    address[] calldata users,
    uint256[] calldata amounts
) external {
    for (uint256 i = 0; i < taskIds.length; i++) {
        bondVault.lockBond(taskIds[i], users[i], amounts[i]);
    }
}
```

### 2. Use View Functions Off-Chain

Don't call view functions in transactions:
```typescript
// ❌ Bad (wastes gas)
const tx = await marketplace.createTask(promptHash);
const freeBond = await bondVault.freeBondOf(user); // Called on-chain

// ✅ Good (call off-chain first)
const freeBond = await bondVault.freeBondOf(user);
if (freeBond < REQUIRED_BOND) {
  throw new Error('Insufficient bond');
}
const tx = await marketplace.createTask(promptHash);
```

---

## FAQ

**Q: Can I integrate without implementing the full interface?**
A: Yes! Just interact with the deployed BondVaultWETH. The interface is for reference.

**Q: What if my contract needs to both lock and slash?**
A: BondVault must be deployed with your contract as both `marketplace` and `disputeLadder`, or add a setter function.

**Q: Can I build on top of BondVaultWETH?**
A: Yes! You can create wrappers that deposit to BondVault and add your own logic.

**Q: Are bonds automatically locked for tasks?**
A: No. Your marketplace contract must explicitly call `lockBond()`.

**Q: What happens if I don't unlock bonds?**
A: They remain locked forever unless you call `unlockBond()`.

---

## Contract References

**IBondVaultWETH.sol:**
- Full interface definition (159 lines)
- All errors, events, and function signatures

**BondVaultWETH.sol:**
- Implementation: `contracts/BondVaultWETH.sol`
- Implements IBondVaultWETH (line 30)
- Authorization checks (lines 196, 219, 248, 292)

**Example Integrations:**
- VerificationMarketplace: Task bonds and rewards
- DisputeLadder: Dispute bonds and slashing

**See also:**
- [Juror Rewards Guide](./JUROR_REWARDS.md)
- [Emergency Pause Guide](./EMERGENCY_PAUSE.md)
