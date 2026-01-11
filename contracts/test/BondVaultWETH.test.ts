/**
 * BondVaultWETH Unit Tests
 *
 * Tests all functionality of the BondVaultWETH contract including:
 * - Deposit/withdrawal mechanics
 * - Lock/unlock bond operations
 * - Slashing mechanisms
 * - Reward distribution
 * - Access control
 * - Invariant preservation
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { BondVaultWETH, IWETH } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { parseEther, ZeroAddress } from "ethers";

describe("BondVaultWETH", function () {
  let bondVault: BondVaultWETH;
  let weth: IWETH;
  let owner: SignerWithAddress;
  let marketplace: SignerWithAddress;
  let disputeLadder: SignerWithAddress;
  let verifier1: SignerWithAddress;
  let verifier2: SignerWithAddress;
  let attacker: SignerWithAddress;

  const INITIAL_DEPOSIT = parseEther("10");
  const LOCK_AMOUNT = parseEther("5");
  const TASK_ID = ethers.keccak256(ethers.toUtf8Bytes("task-1"));

  beforeEach(async function () {
    [owner, marketplace, disputeLadder, verifier1, verifier2, attacker] =
      await ethers.getSigners();

    // Deploy mock WETH
    const WETHFactory = await ethers.getContractFactory("contracts/interfaces/IWETH.sol:IWETH");
    // Note: In production, use actual WETH deployment or mock
    // For now, we'll assume WETH is deployed separately
    const wethAddress = await deployMockWETH();
    weth = await ethers.getContractAt("contracts/interfaces/IWETH.sol:IWETH", wethAddress);

    // Deploy BondVault
    const BondVaultFactory = await ethers.getContractFactory("BondVaultWETH");
    bondVault = await BondVaultFactory.deploy(
      await weth.getAddress(),
      marketplace.address,
      disputeLadder.address
    );
    await bondVault.waitForDeployment();

    // Fund verifiers with WETH
    await weth.connect(verifier1).deposit({ value: parseEther("100") });
    await weth.connect(verifier2).deposit({ value: parseEther("100") });

    // Approve BondVault to spend WETH
    await weth.connect(verifier1).approve(await bondVault.getAddress(), ethers.MaxUint256);
    await weth.connect(verifier2).approve(await bondVault.getAddress(), ethers.MaxUint256);
  });

  // ============================================================================
  // DEPLOYMENT TESTS
  // ============================================================================

  describe("Deployment", function () {
    it("Should set the correct WETH address", async function () {
      expect(await bondVault.WETH()).to.equal(await weth.getAddress());
    });

    it("Should set the correct marketplace address", async function () {
      expect(await bondVault.marketplace()).to.equal(marketplace.address);
    });

    it("Should set the correct disputeLadder address", async function () {
      expect(await bondVault.disputeLadder()).to.equal(disputeLadder.address);
    });

    it("Should revert on zero address WETH", async function () {
      const BondVaultFactory = await ethers.getContractFactory("BondVaultWETH");
      await expect(
        BondVaultFactory.deploy(ZeroAddress, marketplace.address, disputeLadder.address)
      ).to.be.revertedWith("Invalid WETH");
    });

    it("Should revert on zero address marketplace", async function () {
      const BondVaultFactory = await ethers.getContractFactory("BondVaultWETH");
      await expect(
        BondVaultFactory.deploy(await weth.getAddress(), ZeroAddress, disputeLadder.address)
      ).to.be.revertedWith("Invalid marketplace");
    });

    it("Should revert on zero address disputeLadder", async function () {
      const BondVaultFactory = await ethers.getContractFactory("BondVaultWETH");
      await expect(
        BondVaultFactory.deploy(await weth.getAddress(), marketplace.address, ZeroAddress)
      ).to.be.revertedWith("Invalid disputeLadder");
    });
  });

  // ============================================================================
  // DEPOSIT TESTS
  // ============================================================================

  describe("Deposit", function () {
    it("Should allow users to deposit WETH", async function () {
      await expect(bondVault.connect(verifier1).deposit(INITIAL_DEPOSIT))
        .to.emit(bondVault, "Deposited")
        .withArgs(verifier1.address, INITIAL_DEPOSIT);

      expect(await bondVault.totalBondOf(verifier1.address)).to.equal(INITIAL_DEPOSIT);
      expect(await bondVault.freeBondOf(verifier1.address)).to.equal(INITIAL_DEPOSIT);
    });

    it("Should accumulate multiple deposits", async function () {
      await bondVault.connect(verifier1).deposit(parseEther("5"));
      await bondVault.connect(verifier1).deposit(parseEther("3"));

      expect(await bondVault.totalBondOf(verifier1.address)).to.equal(parseEther("8"));
    });

    it("Should revert on zero deposit", async function () {
      await expect(bondVault.connect(verifier1).deposit(0)).to.be.revertedWith(
        "Amount must be > 0"
      );
    });

    it("Should revert if WETH transfer fails", async function () {
      // Revoke approval
      await weth.connect(verifier1).approve(await bondVault.getAddress(), 0);

      await expect(bondVault.connect(verifier1).deposit(INITIAL_DEPOSIT)).to.be.reverted;
    });

    it("Should work when unpaused", async function () {
      await bondVault.connect(verifier1).deposit(INITIAL_DEPOSIT);
      expect(await bondVault.totalBondOf(verifier1.address)).to.equal(INITIAL_DEPOSIT);
    });

    it("Should revert when paused", async function () {
      await bondVault.connect(owner).pause();
      await expect(bondVault.connect(verifier1).deposit(INITIAL_DEPOSIT)).to.be.revertedWith(
        "Pausable: paused"
      );
    });
  });

  // ============================================================================
  // WITHDRAWAL TESTS
  // ============================================================================

  describe("Withdraw", function () {
    beforeEach(async function () {
      await bondVault.connect(verifier1).deposit(INITIAL_DEPOSIT);
    });

    it("Should allow users to withdraw free bonds", async function () {
      const balanceBefore = await weth.balanceOf(verifier1.address);

      await expect(bondVault.connect(verifier1).withdraw(parseEther("3")))
        .to.emit(bondVault, "Withdrawn")
        .withArgs(verifier1.address, parseEther("3"));

      expect(await bondVault.totalBondOf(verifier1.address)).to.equal(parseEther("7"));
      expect(await weth.balanceOf(verifier1.address)).to.equal(balanceBefore + parseEther("3"));
    });

    it("Should allow full withdrawal", async function () {
      await bondVault.connect(verifier1).withdraw(INITIAL_DEPOSIT);
      expect(await bondVault.totalBondOf(verifier1.address)).to.equal(0);
    });

    it("Should revert on zero withdrawal", async function () {
      await expect(bondVault.connect(verifier1).withdraw(0)).to.be.revertedWith(
        "Amount must be > 0"
      );
    });

    it("Should revert if insufficient free bonds", async function () {
      // Lock some bonds
      await bondVault.connect(marketplace).lockBond(verifier1.address, LOCK_AMOUNT, TASK_ID);

      // Try to withdraw more than free bonds
      await expect(
        bondVault.connect(verifier1).withdraw(parseEther("7"))
      ).to.be.revertedWith("Insufficient free bond");
    });

    it("Should not allow withdrawal of locked bonds", async function () {
      await bondVault.connect(marketplace).lockBond(verifier1.address, LOCK_AMOUNT, TASK_ID);

      const freeBond = await bondVault.freeBondOf(verifier1.address);
      await bondVault.connect(verifier1).withdraw(freeBond);

      expect(await bondVault.totalBondOf(verifier1.address)).to.equal(LOCK_AMOUNT);
      expect(await bondVault.totalLockedOf(verifier1.address)).to.equal(LOCK_AMOUNT);
    });
  });

  // ============================================================================
  // LOCK/UNLOCK TESTS
  // ============================================================================

  describe("Lock Bond", function () {
    beforeEach(async function () {
      await bondVault.connect(verifier1).deposit(INITIAL_DEPOSIT);
    });

    it("Should allow marketplace to lock bonds", async function () {
      await expect(
        bondVault.connect(marketplace).lockBond(verifier1.address, LOCK_AMOUNT, TASK_ID)
      )
        .to.emit(bondVault, "BondLocked")
        .withArgs(verifier1.address, LOCK_AMOUNT, TASK_ID);

      expect(await bondVault.totalLockedOf(verifier1.address)).to.equal(LOCK_AMOUNT);
      expect(await bondVault.lockedBondOf(TASK_ID, verifier1.address)).to.equal(LOCK_AMOUNT);
      expect(await bondVault.freeBondOf(verifier1.address)).to.equal(
        INITIAL_DEPOSIT - LOCK_AMOUNT
      );
    });

    it("Should revert if non-marketplace tries to lock", async function () {
      await expect(
        bondVault.connect(attacker).lockBond(verifier1.address, LOCK_AMOUNT, TASK_ID)
      ).to.be.revertedWith("Only marketplace");
    });

    it("Should revert if insufficient free bonds", async function () {
      await expect(
        bondVault.connect(marketplace).lockBond(verifier1.address, parseEther("15"), TASK_ID)
      ).to.be.revertedWith("Insufficient free bond");
    });

    it("Should handle multiple locks for same user", async function () {
      const taskId2 = ethers.keccak256(ethers.toUtf8Bytes("task-2"));

      await bondVault.connect(marketplace).lockBond(verifier1.address, parseEther("3"), TASK_ID);
      await bondVault.connect(marketplace).lockBond(verifier1.address, parseEther("2"), taskId2);

      expect(await bondVault.totalLockedOf(verifier1.address)).to.equal(parseEther("5"));
      expect(await bondVault.lockedBondOf(TASK_ID, verifier1.address)).to.equal(parseEther("3"));
      expect(await bondVault.lockedBondOf(taskId2, verifier1.address)).to.equal(parseEther("2"));
    });
  });

  describe("Unlock Bond", function () {
    beforeEach(async function () {
      await bondVault.connect(verifier1).deposit(INITIAL_DEPOSIT);
      await bondVault.connect(marketplace).lockBond(verifier1.address, LOCK_AMOUNT, TASK_ID);
    });

    it("Should allow marketplace to unlock bonds", async function () {
      await expect(
        bondVault.connect(marketplace).unlockBond(verifier1.address, LOCK_AMOUNT, TASK_ID)
      )
        .to.emit(bondVault, "BondUnlocked")
        .withArgs(verifier1.address, LOCK_AMOUNT, TASK_ID);

      expect(await bondVault.totalLockedOf(verifier1.address)).to.equal(0);
      expect(await bondVault.lockedBondOf(TASK_ID, verifier1.address)).to.equal(0);
      expect(await bondVault.freeBondOf(verifier1.address)).to.equal(INITIAL_DEPOSIT);
    });

    it("Should revert if non-marketplace tries to unlock", async function () {
      await expect(
        bondVault.connect(attacker).unlockBond(verifier1.address, LOCK_AMOUNT, TASK_ID)
      ).to.be.revertedWith("Only marketplace");
    });

    it("Should revert if unlocking more than locked", async function () {
      await expect(
        bondVault.connect(marketplace).unlockBond(verifier1.address, parseEther("7"), TASK_ID)
      ).to.be.revertedWith("Insufficient locked bond");
    });

    it("Should allow partial unlock", async function () {
      await bondVault.connect(marketplace).unlockBond(verifier1.address, parseEther("2"), TASK_ID);

      expect(await bondVault.lockedBondOf(TASK_ID, verifier1.address)).to.equal(parseEther("3"));
      expect(await bondVault.totalLockedOf(verifier1.address)).to.equal(parseEther("3"));
    });
  });

  // ============================================================================
  // SLASHING TESTS
  // ============================================================================

  describe("Slash Bond", function () {
    beforeEach(async function () {
      await bondVault.connect(verifier1).deposit(INITIAL_DEPOSIT);
      await bondVault.connect(marketplace).lockBond(verifier1.address, LOCK_AMOUNT, TASK_ID);
    });

    it("Should allow disputeLadder to slash bonds", async function () {
      const slashAmount = parseEther("2");

      await expect(
        bondVault.connect(disputeLadder).slashBond(verifier1.address, slashAmount, TASK_ID)
      )
        .to.emit(bondVault, "BondSlashed")
        .withArgs(verifier1.address, slashAmount, TASK_ID);

      expect(await bondVault.totalBondOf(verifier1.address)).to.equal(
        INITIAL_DEPOSIT - slashAmount
      );
      expect(await bondVault.lockedBondOf(TASK_ID, verifier1.address)).to.equal(
        LOCK_AMOUNT - slashAmount
      );
      expect(await bondVault.totalLockedOf(verifier1.address)).to.equal(
        LOCK_AMOUNT - slashAmount
      );
    });

    it("Should revert if non-disputeLadder tries to slash", async function () {
      await expect(
        bondVault.connect(attacker).slashBond(verifier1.address, parseEther("2"), TASK_ID)
      ).to.be.revertedWith("Only disputeLadder");
    });

    it("Should revert if slashing more than locked", async function () {
      await expect(
        bondVault.connect(disputeLadder).slashBond(verifier1.address, parseEther("7"), TASK_ID)
      ).to.be.revertedWith("Insufficient locked bond");
    });

    it("Should allow full slash", async function () {
      await bondVault.connect(disputeLadder).slashBond(verifier1.address, LOCK_AMOUNT, TASK_ID);

      expect(await bondVault.lockedBondOf(TASK_ID, verifier1.address)).to.equal(0);
      expect(await bondVault.totalBondOf(verifier1.address)).to.equal(INITIAL_DEPOSIT - LOCK_AMOUNT);
    });
  });

  // ============================================================================
  // REWARD TESTS
  // ============================================================================

  describe("Pay Reward", function () {
    beforeEach(async function () {
      // Marketplace needs WETH to pay rewards
      await weth.connect(marketplace).deposit({ value: parseEther("50") });
      await weth.connect(marketplace).approve(await bondVault.getAddress(), ethers.MaxUint256);
    });

    it("Should allow marketplace to pay rewards", async function () {
      const rewardAmount = parseEther("2");

      await expect(
        bondVault.connect(marketplace).payReward(verifier1.address, rewardAmount)
      )
        .to.emit(bondVault, "RewardPaid")
        .withArgs(verifier1.address, rewardAmount);

      expect(await bondVault.totalBondOf(verifier1.address)).to.equal(rewardAmount);
    });

    it("Should allow disputeLadder to pay rewards", async function () {
      await weth.connect(disputeLadder).deposit({ value: parseEther("50") });
      await weth.connect(disputeLadder).approve(await bondVault.getAddress(), ethers.MaxUint256);

      const rewardAmount = parseEther("3");

      await bondVault.connect(disputeLadder).payReward(verifier1.address, rewardAmount);

      expect(await bondVault.totalBondOf(verifier1.address)).to.equal(rewardAmount);
    });

    it("Should revert if unauthorized caller", async function () {
      await expect(
        bondVault.connect(attacker).payReward(verifier1.address, parseEther("2"))
      ).to.be.revertedWith("Only marketplace or disputeLadder");
    });

    it("Should accumulate rewards with existing bonds", async function () {
      await bondVault.connect(verifier1).deposit(INITIAL_DEPOSIT);

      await bondVault.connect(marketplace).payReward(verifier1.address, parseEther("5"));

      expect(await bondVault.totalBondOf(verifier1.address)).to.equal(parseEther("15"));
    });
  });

  // ============================================================================
  // PAUSE/UNPAUSE TESTS
  // ============================================================================

  describe("Pause/Unpause", function () {
    it("Should allow owner to pause", async function () {
      await bondVault.connect(owner).pause();
      expect(await bondVault.paused()).to.be.true;
    });

    it("Should allow owner to unpause", async function () {
      await bondVault.connect(owner).pause();
      await bondVault.connect(owner).unpause();
      expect(await bondVault.paused()).to.be.false;
    });

    it("Should revert if non-owner tries to pause", async function () {
      await expect(bondVault.connect(attacker).pause()).to.be.reverted;
    });

    it("Should block deposits when paused", async function () {
      await bondVault.connect(owner).pause();
      await expect(bondVault.connect(verifier1).deposit(INITIAL_DEPOSIT)).to.be.revertedWith(
        "Pausable: paused"
      );
    });

    it("Should block withdrawals when paused", async function () {
      await bondVault.connect(verifier1).deposit(INITIAL_DEPOSIT);
      await bondVault.connect(owner).pause();

      await expect(bondVault.connect(verifier1).withdraw(parseEther("1"))).to.be.revertedWith(
        "Pausable: paused"
      );
    });
  });

  // ============================================================================
  // INVARIANT TESTS
  // ============================================================================

  describe("Invariants", function () {
    it("Invariant: totalBondOf >= totalLockedOf", async function () {
      await bondVault.connect(verifier1).deposit(INITIAL_DEPOSIT);
      await bondVault.connect(marketplace).lockBond(verifier1.address, LOCK_AMOUNT, TASK_ID);

      const totalBond = await bondVault.totalBondOf(verifier1.address);
      const totalLocked = await bondVault.totalLockedOf(verifier1.address);

      expect(totalBond).to.be.gte(totalLocked);
    });

    it("Invariant: freeBondOf = totalBondOf - totalLockedOf", async function () {
      await bondVault.connect(verifier1).deposit(INITIAL_DEPOSIT);
      await bondVault.connect(marketplace).lockBond(verifier1.address, LOCK_AMOUNT, TASK_ID);

      const totalBond = await bondVault.totalBondOf(verifier1.address);
      const totalLocked = await bondVault.totalLockedOf(verifier1.address);
      const freeBond = await bondVault.freeBondOf(verifier1.address);

      expect(freeBond).to.equal(totalBond - totalLocked);
    });

    it("Invariant: After slash, totalLocked decreases by slashed amount", async function () {
      await bondVault.connect(verifier1).deposit(INITIAL_DEPOSIT);
      await bondVault.connect(marketplace).lockBond(verifier1.address, LOCK_AMOUNT, TASK_ID);

      const lockedBefore = await bondVault.totalLockedOf(verifier1.address);
      const slashAmount = parseEther("2");

      await bondVault.connect(disputeLadder).slashBond(verifier1.address, slashAmount, TASK_ID);

      const lockedAfter = await bondVault.totalLockedOf(verifier1.address);
      expect(lockedAfter).to.equal(lockedBefore - slashAmount);
    });

    it("Invariant: Cannot withdraw locked bonds", async function () {
      await bondVault.connect(verifier1).deposit(INITIAL_DEPOSIT);
      await bondVault.connect(marketplace).lockBond(verifier1.address, INITIAL_DEPOSIT, TASK_ID);

      await expect(bondVault.connect(verifier1).withdraw(parseEther("1"))).to.be.revertedWith(
        "Insufficient free bond"
      );
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe("Edge Cases", function () {
    it("Should handle multiple simultaneous locks", async function () {
      await bondVault.connect(verifier1).deposit(parseEther("20"));

      const taskIds = [
        ethers.keccak256(ethers.toUtf8Bytes("task-1")),
        ethers.keccak256(ethers.toUtf8Bytes("task-2")),
        ethers.keccak256(ethers.toUtf8Bytes("task-3")),
      ];

      for (const taskId of taskIds) {
        await bondVault.connect(marketplace).lockBond(verifier1.address, parseEther("5"), taskId);
      }

      expect(await bondVault.totalLockedOf(verifier1.address)).to.equal(parseEther("15"));
      expect(await bondVault.freeBondOf(verifier1.address)).to.equal(parseEther("5"));
    });

    it("Should handle lock then unlock then lock again", async function () {
      await bondVault.connect(verifier1).deposit(INITIAL_DEPOSIT);

      await bondVault.connect(marketplace).lockBond(verifier1.address, LOCK_AMOUNT, TASK_ID);
      await bondVault.connect(marketplace).unlockBond(verifier1.address, LOCK_AMOUNT, TASK_ID);
      await bondVault.connect(marketplace).lockBond(verifier1.address, parseEther("3"), TASK_ID);

      expect(await bondVault.lockedBondOf(TASK_ID, verifier1.address)).to.equal(parseEther("3"));
    });

    it("Should handle slash reducing bond to zero", async function () {
      await bondVault.connect(verifier1).deposit(LOCK_AMOUNT);
      await bondVault.connect(marketplace).lockBond(verifier1.address, LOCK_AMOUNT, TASK_ID);
      await bondVault.connect(disputeLadder).slashBond(verifier1.address, LOCK_AMOUNT, TASK_ID);

      expect(await bondVault.totalBondOf(verifier1.address)).to.equal(0);
      expect(await bondVault.totalLockedOf(verifier1.address)).to.equal(0);
    });
  });
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function deployMockWETH(): Promise<string> {
  // Deploy a simple WETH mock for testing
  const MockWETH = await ethers.getContractFactory("MockWETH");
  const weth = await MockWETH.deploy();
  await weth.waitForDeployment();
  return await weth.getAddress();
}
