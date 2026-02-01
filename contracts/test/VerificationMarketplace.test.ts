/**
 * VerificationMarketplace Unit Tests
 *
 * Tests the dispute-aware escrow and slashing mechanics:
 * - Escrow: finalize holds funds; releaseEscrow after disputeDeadline pays
 * - Non-reveal slashing: committed-but-not-revealed gets slashed, no payout
 * - Dispute path: finalize → markDisputed → settleAfterDispute reallocates escrow
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { VerifierMarketplace, MockWETH } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { parseEther, keccak256, solidityPacked, ZeroHash } from "ethers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("VerificationMarketplace", function () {
  let marketplace: VerifierMarketplace;
  let weth: MockWETH;
  let owner: SignerWithAddress;
  let requester: SignerWithAddress;
  let evaluator1: SignerWithAddress;
  let evaluator2: SignerWithAddress;
  let evaluator3: SignerWithAddress;
  let disputeResolver: SignerWithAddress;

  const EVAL_BOND = parseEther("0.1");
  const DISPUTE_BOND = parseEther("0.5");
  const FEE_POOL = parseEther("1");

  // Helper to create commit hash
  function createCommitHash(
    taskId: number,
    evaluator: string,
    scoreBps: number,
    bundleHash: string,
    salt: string
  ): string {
    return keccak256(
      solidityPacked(
        ["uint256", "address", "uint16", "bytes32", "bytes32"],
        [taskId, evaluator, scoreBps, bundleHash, salt]
      )
    );
  }

  beforeEach(async function () {
    [owner, requester, evaluator1, evaluator2, evaluator3, disputeResolver] =
      await ethers.getSigners();

    // Deploy MockWETH
    const WETHFactory = await ethers.getContractFactory("MockWETH");
    weth = await WETHFactory.deploy();
    await weth.waitForDeployment();

    // Deploy VerifierMarketplace
    const MarketplaceFactory = await ethers.getContractFactory("VerifierMarketplace");
    marketplace = await MarketplaceFactory.deploy(
      await weth.getAddress(),
      EVAL_BOND,
      DISPUTE_BOND
    );
    await marketplace.waitForDeployment();

    // Fund participants with WETH
    const participants = [requester, evaluator1, evaluator2, evaluator3];
    for (const p of participants) {
      await weth.connect(p).deposit({ value: parseEther("10") });
      await weth.connect(p).approve(await marketplace.getAddress(), ethers.MaxUint256);
    }
  });

  // ============================================================================
  // HELPER: Create and progress a task through phases
  // ============================================================================

  async function createTask(disputeWindowSeconds: number = 3600, maxEvals: number = 3): Promise<number> {
    const now = await time.latest();
    const commitDeadline = now + 100;
    const revealDeadline = commitDeadline + 100;

    await marketplace.connect(requester).createTask(
      keccak256(solidityPacked(["string"], ["prompt"])),
      keccak256(solidityPacked(["string"], ["rubric"])),
      commitDeadline,
      revealDeadline,
      disputeWindowSeconds,
      2, // minEvals
      maxEvals,
      FEE_POOL
    );

    return 1; // First task ID
  }

  async function commitEvaluator(
    taskId: number,
    evaluator: SignerWithAddress,
    scoreBps: number,
    salt: string
  ): Promise<{ commitHash: string; bundleHash: string; salt: string }> {
    const bundleHash = keccak256(solidityPacked(["string"], [`bundle-${evaluator.address}`]));
    const commitHash = createCommitHash(taskId, evaluator.address, scoreBps, bundleHash, salt);

    await marketplace.connect(evaluator).commitEvaluation(taskId, commitHash);

    return { commitHash, bundleHash, salt };
  }

  async function revealEvaluator(
    taskId: number,
    evaluator: SignerWithAddress,
    scoreBps: number,
    bundleHash: string,
    salt: string
  ): Promise<void> {
    await marketplace
      .connect(evaluator)
      .revealEvaluation(taskId, scoreBps, bundleHash, "ipfs://bundle", salt);
  }

  // ============================================================================
  // ESCROW TESTS
  // ============================================================================

  describe("Escrow", function () {
    it("finalize does not pay evaluators immediately", async function () {
      const taskId = await createTask();

      // Commit phase
      const salt1 = keccak256(solidityPacked(["string"], ["salt1"]));
      const salt2 = keccak256(solidityPacked(["string"], ["salt2"]));

      const commit1 = await commitEvaluator(taskId, evaluator1, 8000, salt1);
      const commit2 = await commitEvaluator(taskId, evaluator2, 8200, salt2);

      // Move to reveal phase
      await time.increase(101);
      await marketplace.openReveal(taskId);

      // Reveal
      await revealEvaluator(taskId, evaluator1, 8000, commit1.bundleHash, salt1);
      await revealEvaluator(taskId, evaluator2, 8200, commit2.bundleHash, salt2);

      // Record balances before finalize
      const bal1Before = await weth.balanceOf(evaluator1.address);
      const bal2Before = await weth.balanceOf(evaluator2.address);

      // Finalize
      await time.increase(101);
      await marketplace.finalize(taskId);

      // Check state is Provisional (index 2)
      const meta = await marketplace.getTaskMeta(taskId);
      expect(meta.state).to.equal(2); // Provisional

      // Balances should NOT have changed (funds in escrow)
      const bal1After = await weth.balanceOf(evaluator1.address);
      const bal2After = await weth.balanceOf(evaluator2.address);
      expect(bal1After).to.equal(bal1Before);
      expect(bal2After).to.equal(bal2Before);

      // Check escrow is funded
      const escrow1 = await marketplace.getEscrowInfo(taskId, evaluator1.address);
      const escrow2 = await marketplace.getEscrowInfo(taskId, evaluator2.address);

      expect(escrow1.bondAmount).to.equal(EVAL_BOND);
      expect(escrow1.eligible).to.be.true;
      expect(escrow1.released).to.be.false;

      expect(escrow2.bondAmount).to.equal(EVAL_BOND);
      expect(escrow2.eligible).to.be.true;
      expect(escrow2.released).to.be.false;
    });

    it("releaseEscrow reverts before dispute deadline", async function () {
      const taskId = await createTask(3600); // 1 hour dispute window

      const salt1 = keccak256(solidityPacked(["string"], ["salt1"]));
      const salt2 = keccak256(solidityPacked(["string"], ["salt2"]));

      const commit1 = await commitEvaluator(taskId, evaluator1, 8000, salt1);
      const commit2 = await commitEvaluator(taskId, evaluator2, 8200, salt2);

      await time.increase(101);
      await marketplace.openReveal(taskId);

      await revealEvaluator(taskId, evaluator1, 8000, commit1.bundleHash, salt1);
      await revealEvaluator(taskId, evaluator2, 8200, commit2.bundleHash, salt2);

      await time.increase(101);
      await marketplace.finalize(taskId);

      // Try to release before dispute deadline (should fail)
      await expect(marketplace.releaseEscrow(taskId)).to.be.revertedWith(
        "dispute window open"
      );
    });

    it("releaseEscrow pays evaluators after dispute deadline", async function () {
      const taskId = await createTask(100); // Short dispute window

      const salt1 = keccak256(solidityPacked(["string"], ["salt1"]));
      const salt2 = keccak256(solidityPacked(["string"], ["salt2"]));

      const commit1 = await commitEvaluator(taskId, evaluator1, 8000, salt1);
      const commit2 = await commitEvaluator(taskId, evaluator2, 8200, salt2);

      await time.increase(101);
      await marketplace.openReveal(taskId);

      await revealEvaluator(taskId, evaluator1, 8000, commit1.bundleHash, salt1);
      await revealEvaluator(taskId, evaluator2, 8200, commit2.bundleHash, salt2);

      await time.increase(101);
      await marketplace.finalize(taskId);

      // Record balances before release
      const bal1Before = await weth.balanceOf(evaluator1.address);
      const bal2Before = await weth.balanceOf(evaluator2.address);

      // Wait for dispute deadline
      await time.increase(101);

      // Release escrow
      await expect(marketplace.releaseEscrow(taskId))
        .to.emit(marketplace, "TaskFinal")
        .to.emit(marketplace, "EscrowReleased");

      // Check state is Final (index 4)
      const meta = await marketplace.getTaskMeta(taskId);
      expect(meta.state).to.equal(4); // Final

      // Balances should have increased (bond + payout)
      const bal1After = await weth.balanceOf(evaluator1.address);
      const bal2After = await weth.balanceOf(evaluator2.address);

      expect(bal1After).to.be.gt(bal1Before);
      expect(bal2After).to.be.gt(bal2Before);

      // Escrow should be released
      const escrow1 = await marketplace.getEscrowInfo(taskId, evaluator1.address);
      const escrow2 = await marketplace.getEscrowInfo(taskId, evaluator2.address);

      expect(escrow1.released).to.be.true;
      expect(escrow2.released).to.be.true;
    });
  });

  // ============================================================================
  // NON-REVEAL SLASHING TESTS
  // ============================================================================

  describe("Non-Reveal Slashing", function () {
    it("committed-but-not-revealed gets slashed", async function () {
      // Use maxEvals=4 so state doesn't auto-transition to Revealing on 3rd commit
      const taskId = await createTask(3600, 4);

      // Three evaluators commit
      const salt1 = keccak256(solidityPacked(["string"], ["salt1"]));
      const salt2 = keccak256(solidityPacked(["string"], ["salt2"]));
      const salt3 = keccak256(solidityPacked(["string"], ["salt3"]));

      const commit1 = await commitEvaluator(taskId, evaluator1, 8000, salt1);
      const commit2 = await commitEvaluator(taskId, evaluator2, 8200, salt2);
      await commitEvaluator(taskId, evaluator3, 8100, salt3); // Will NOT reveal

      // Record evaluator3 balance after commit (bond deducted)
      const bal3AfterCommit = await weth.balanceOf(evaluator3.address);

      // Move to reveal phase
      await time.increase(101);
      await marketplace.openReveal(taskId);

      // Only evaluators 1 and 2 reveal
      await revealEvaluator(taskId, evaluator1, 8000, commit1.bundleHash, salt1);
      await revealEvaluator(taskId, evaluator2, 8200, commit2.bundleHash, salt2);
      // evaluator3 does NOT reveal

      // Finalize
      await time.increase(101);
      await expect(marketplace.finalize(taskId))
        .to.emit(marketplace, "NonRevealSlashed")
        .withArgs(taskId, evaluator3.address, EVAL_BOND);

      // Check evaluator3 is slashed
      const eval3 = await marketplace.getEvaluation(taskId, evaluator3.address);
      expect(eval3.slashed).to.be.true;
      expect(eval3.revealed).to.be.false;

      // Escrow entry shows ineligible
      const escrow3 = await marketplace.getEscrowInfo(taskId, evaluator3.address);
      expect(escrow3.bondAmount).to.equal(0); // Bond slashed
      expect(escrow3.payoutAmount).to.equal(0);
      expect(escrow3.eligible).to.be.false;

      // Evaluator3 balance should NOT have changed (no refund)
      const bal3AfterFinalize = await weth.balanceOf(evaluator3.address);
      expect(bal3AfterFinalize).to.equal(bal3AfterCommit);
    });

    it("slashed verifier does not receive payout", async function () {
      // Use maxEvals=4 so state doesn't auto-transition to Revealing on 3rd commit
      const taskId = await createTask(100, 4);

      const salt1 = keccak256(solidityPacked(["string"], ["salt1"]));
      const salt2 = keccak256(solidityPacked(["string"], ["salt2"]));
      const salt3 = keccak256(solidityPacked(["string"], ["salt3"]));

      const commit1 = await commitEvaluator(taskId, evaluator1, 8000, salt1);
      const commit2 = await commitEvaluator(taskId, evaluator2, 8200, salt2);
      await commitEvaluator(taskId, evaluator3, 8100, salt3);

      await time.increase(101);
      await marketplace.openReveal(taskId);

      await revealEvaluator(taskId, evaluator1, 8000, commit1.bundleHash, salt1);
      await revealEvaluator(taskId, evaluator2, 8200, commit2.bundleHash, salt2);

      await time.increase(101);
      await marketplace.finalize(taskId);

      // Record evaluator3 balance before release
      const bal3BeforeRelease = await weth.balanceOf(evaluator3.address);

      // Wait for dispute deadline and release
      await time.increase(101);
      await marketplace.releaseEscrow(taskId);

      // Evaluator3 should NOT have received any payout
      const bal3AfterRelease = await weth.balanceOf(evaluator3.address);
      expect(bal3AfterRelease).to.equal(bal3BeforeRelease);

      // Escrow should still show released but with 0 amounts
      const escrow3 = await marketplace.getEscrowInfo(taskId, evaluator3.address);
      expect(escrow3.released).to.be.true;
      expect(escrow3.bondAmount).to.equal(0);
      expect(escrow3.payoutAmount).to.equal(0);
    });

    it("slashed bond goes to protocol owner", async function () {
      // Use maxEvals=4 so state doesn't auto-transition to Revealing on 3rd commit
      const taskId = await createTask(3600, 4);

      const salt1 = keccak256(solidityPacked(["string"], ["salt1"]));
      const salt2 = keccak256(solidityPacked(["string"], ["salt2"]));
      const salt3 = keccak256(solidityPacked(["string"], ["salt3"]));

      const commit1 = await commitEvaluator(taskId, evaluator1, 8000, salt1);
      const commit2 = await commitEvaluator(taskId, evaluator2, 8200, salt2);
      await commitEvaluator(taskId, evaluator3, 8100, salt3);

      await time.increase(101);
      await marketplace.openReveal(taskId);

      await revealEvaluator(taskId, evaluator1, 8000, commit1.bundleHash, salt1);
      await revealEvaluator(taskId, evaluator2, 8200, commit2.bundleHash, salt2);

      // Record owner balance before finalize
      const ownerBalBefore = await weth.balanceOf(owner.address);

      await time.increase(101);
      await marketplace.finalize(taskId);

      // Owner should have received the slashed bond + protocol fee
      const ownerBalAfter = await weth.balanceOf(owner.address);
      const protocolFee = (FEE_POOL * BigInt(500)) / BigInt(10000); // 5%
      const expectedIncrease = EVAL_BOND + protocolFee;

      expect(ownerBalAfter - ownerBalBefore).to.equal(expectedIncrease);
    });
  });

  // ============================================================================
  // DISPUTE PATH TESTS
  // ============================================================================

  describe("Dispute Path", function () {
    it("markDisputed changes state to Disputed", async function () {
      const taskId = await createTask(3600);

      const salt1 = keccak256(solidityPacked(["string"], ["salt1"]));
      const salt2 = keccak256(solidityPacked(["string"], ["salt2"]));

      const commit1 = await commitEvaluator(taskId, evaluator1, 8000, salt1);
      const commit2 = await commitEvaluator(taskId, evaluator2, 8200, salt2);

      await time.increase(101);
      await marketplace.openReveal(taskId);

      await revealEvaluator(taskId, evaluator1, 8000, commit1.bundleHash, salt1);
      await revealEvaluator(taskId, evaluator2, 8200, commit2.bundleHash, salt2);

      await time.increase(101);
      await marketplace.finalize(taskId);

      // Mark as disputed
      await marketplace.connect(owner).markDisputed(taskId);

      const meta = await marketplace.getTaskMeta(taskId);
      expect(meta.state).to.equal(3); // Disputed

      // Disputes should be tracked
      expect(await marketplace.disputesAgainst(evaluator1.address)).to.equal(1);
      expect(await marketplace.disputesAgainst(evaluator2.address)).to.equal(1);
    });

    it("markDisputed reverts after dispute window closes", async function () {
      const taskId = await createTask(100);

      const salt1 = keccak256(solidityPacked(["string"], ["salt1"]));
      const salt2 = keccak256(solidityPacked(["string"], ["salt2"]));

      const commit1 = await commitEvaluator(taskId, evaluator1, 8000, salt1);
      const commit2 = await commitEvaluator(taskId, evaluator2, 8200, salt2);

      await time.increase(101);
      await marketplace.openReveal(taskId);

      await revealEvaluator(taskId, evaluator1, 8000, commit1.bundleHash, salt1);
      await revealEvaluator(taskId, evaluator2, 8200, commit2.bundleHash, salt2);

      await time.increase(101);
      await marketplace.finalize(taskId);

      // Wait for dispute window to close
      await time.increase(101);

      await expect(marketplace.connect(owner).markDisputed(taskId)).to.be.revertedWith(
        "dispute window closed"
      );
    });

    it("settleAfterDispute reallocates escrow and marks Final", async function () {
      const taskId = await createTask(3600);

      const salt1 = keccak256(solidityPacked(["string"], ["salt1"]));
      const salt2 = keccak256(solidityPacked(["string"], ["salt2"]));

      const commit1 = await commitEvaluator(taskId, evaluator1, 8000, salt1);
      const commit2 = await commitEvaluator(taskId, evaluator2, 8200, salt2);

      await time.increase(101);
      await marketplace.openReveal(taskId);

      await revealEvaluator(taskId, evaluator1, 8000, commit1.bundleHash, salt1);
      await revealEvaluator(taskId, evaluator2, 8200, commit2.bundleHash, salt2);

      await time.increase(101);
      await marketplace.finalize(taskId);
      await marketplace.connect(owner).markDisputed(taskId);

      // Record balances
      const bal1Before = await weth.balanceOf(evaluator1.address);
      const bal2Before = await weth.balanceOf(evaluator2.address);

      // Settle dispute - penalize evaluator1
      await expect(
        marketplace
          .connect(owner)
          .settleAfterDispute(taskId, 8200, [evaluator1.address])
      )
        .to.emit(marketplace, "DisputeSettled")
        .to.emit(marketplace, "TaskFinal");

      const meta = await marketplace.getTaskMeta(taskId);
      expect(meta.state).to.equal(4); // Final
      expect(meta.finalScoreBps).to.equal(8200);

      // Evaluator1 penalized - should NOT get bond or payout
      const bal1After = await weth.balanceOf(evaluator1.address);
      expect(bal1After).to.equal(bal1Before); // No change

      // Evaluator2 should get bond + full payout
      const bal2After = await weth.balanceOf(evaluator2.address);
      expect(bal2After).to.be.gt(bal2Before);

      // Escrow states
      const escrow1 = await marketplace.getEscrowInfo(taskId, evaluator1.address);
      const escrow2 = await marketplace.getEscrowInfo(taskId, evaluator2.address);

      expect(escrow1.eligible).to.be.false;
      expect(escrow1.released).to.be.true;

      expect(escrow2.eligible).to.be.true;
      expect(escrow2.released).to.be.true;
    });

    it("disputeResolver can settle disputes", async function () {
      const taskId = await createTask(3600);

      // Set dispute resolver
      await marketplace.connect(owner).setDisputeResolver(disputeResolver.address);

      const salt1 = keccak256(solidityPacked(["string"], ["salt1"]));
      const salt2 = keccak256(solidityPacked(["string"], ["salt2"]));

      const commit1 = await commitEvaluator(taskId, evaluator1, 8000, salt1);
      const commit2 = await commitEvaluator(taskId, evaluator2, 8200, salt2);

      await time.increase(101);
      await marketplace.openReveal(taskId);

      await revealEvaluator(taskId, evaluator1, 8000, commit1.bundleHash, salt1);
      await revealEvaluator(taskId, evaluator2, 8200, commit2.bundleHash, salt2);

      await time.increase(101);
      await marketplace.finalize(taskId);
      await marketplace.connect(disputeResolver).markDisputed(taskId);

      // Dispute resolver can settle
      await marketplace
        .connect(disputeResolver)
        .settleAfterDispute(taskId, 8100, []);

      const meta = await marketplace.getTaskMeta(taskId);
      expect(meta.state).to.equal(4); // Final
    });

    it("non-authorized cannot settle disputes", async function () {
      const taskId = await createTask(3600);

      const salt1 = keccak256(solidityPacked(["string"], ["salt1"]));
      const salt2 = keccak256(solidityPacked(["string"], ["salt2"]));

      const commit1 = await commitEvaluator(taskId, evaluator1, 8000, salt1);
      const commit2 = await commitEvaluator(taskId, evaluator2, 8200, salt2);

      await time.increase(101);
      await marketplace.openReveal(taskId);

      await revealEvaluator(taskId, evaluator1, 8000, commit1.bundleHash, salt1);
      await revealEvaluator(taskId, evaluator2, 8200, commit2.bundleHash, salt2);

      await time.increase(101);
      await marketplace.finalize(taskId);
      await marketplace.connect(owner).markDisputed(taskId);

      // Random user cannot settle
      await expect(
        marketplace.connect(evaluator1).settleAfterDispute(taskId, 8100, [])
      ).to.be.revertedWith("not authorized");
    });

    it("disputesWon incremented when score change is small", async function () {
      const taskId = await createTask(3600);

      const salt1 = keccak256(solidityPacked(["string"], ["salt1"]));
      const salt2 = keccak256(solidityPacked(["string"], ["salt2"]));

      const commit1 = await commitEvaluator(taskId, evaluator1, 8000, salt1);
      const commit2 = await commitEvaluator(taskId, evaluator2, 8200, salt2);

      await time.increase(101);
      await marketplace.openReveal(taskId);

      await revealEvaluator(taskId, evaluator1, 8000, commit1.bundleHash, salt1);
      await revealEvaluator(taskId, evaluator2, 8200, commit2.bundleHash, salt2);

      await time.increase(101);
      await marketplace.finalize(taskId);
      await marketplace.connect(owner).markDisputed(taskId);

      // Settle with small score change (8100 vs 8100 median is 8100)
      await marketplace.connect(owner).settleAfterDispute(taskId, 8100, []);

      // Both evaluators should have disputesWon incremented (change < 500 bps)
      expect(await marketplace.disputesWon(evaluator1.address)).to.equal(1);
      expect(await marketplace.disputesWon(evaluator2.address)).to.equal(1);
    });
  });

  // ============================================================================
  // STATE MACHINE TESTS
  // ============================================================================

  describe("State Machine", function () {
    it("follows correct state transitions", async function () {
      const taskId = await createTask(100);

      // Initial state: Open
      let meta = await marketplace.getTaskMeta(taskId);
      expect(meta.state).to.equal(0); // Open

      const salt1 = keccak256(solidityPacked(["string"], ["salt1"]));
      const salt2 = keccak256(solidityPacked(["string"], ["salt2"]));

      const commit1 = await commitEvaluator(taskId, evaluator1, 8000, salt1);
      const commit2 = await commitEvaluator(taskId, evaluator2, 8200, salt2);

      await time.increase(101);
      await marketplace.openReveal(taskId);

      // State: Revealing
      meta = await marketplace.getTaskMeta(taskId);
      expect(meta.state).to.equal(1); // Revealing

      await revealEvaluator(taskId, evaluator1, 8000, commit1.bundleHash, salt1);
      await revealEvaluator(taskId, evaluator2, 8200, commit2.bundleHash, salt2);

      await time.increase(101);
      await marketplace.finalize(taskId);

      // State: Provisional
      meta = await marketplace.getTaskMeta(taskId);
      expect(meta.state).to.equal(2); // Provisional

      await time.increase(101);
      await marketplace.releaseEscrow(taskId);

      // State: Final
      meta = await marketplace.getTaskMeta(taskId);
      expect(meta.state).to.equal(4); // Final
    });

    it("cannot release escrow from wrong state", async function () {
      const taskId = await createTask();

      // Try to release from Open state
      await expect(marketplace.releaseEscrow(taskId)).to.be.revertedWith(
        "not provisional"
      );
    });

    it("cannot finalize from wrong state", async function () {
      const taskId = await createTask();

      // Try to finalize from Open state
      await expect(marketplace.finalize(taskId)).to.be.revertedWith("bad state");
    });
  });
});
