import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { MockWETH, VerifierMarketplace, TruthChain } from "../typechain-types";

describe("TruthChain integration", function () {
  const EVAL_BOND = ethers.parseEther("1");
  const DISPUTE_BOND = ethers.parseEther("1");
  const FEE_POOL = ethers.parseEther("10");

  let weth: MockWETH;
  let marketplace: VerifierMarketplace;
  let truthChain: TruthChain;

  let owner: any;
  let requester: any;
  let verifier1: any;
  let verifier2: any;

  beforeEach(async function () {
    [owner, requester, verifier1, verifier2] = await ethers.getSigners();

    const WETHFactory = await ethers.getContractFactory("MockWETH");
    weth = await WETHFactory.deploy();
    await weth.waitForDeployment();

    const MarketplaceFactory = await ethers.getContractFactory("VerifierMarketplace");
    marketplace = await MarketplaceFactory.deploy(
      await weth.getAddress(),
      EVAL_BOND,
      DISPUTE_BOND
    );
    await marketplace.waitForDeployment();

    const TruthChainFactory = await ethers.getContractFactory("TruthChain");
    truthChain = await TruthChainFactory.deploy(await marketplace.getAddress());
    await truthChain.waitForDeployment();

    await marketplace.connect(owner).setTruthChain(await truthChain.getAddress(), true);

    await weth.connect(requester).deposit({ value: ethers.parseEther("50") });
    await weth.connect(verifier1).deposit({ value: ethers.parseEther("10") });
    await weth.connect(verifier2).deposit({ value: ethers.parseEther("10") });

    await weth.connect(requester).approve(await marketplace.getAddress(), ethers.MaxUint256);
    await weth.connect(verifier1).approve(await marketplace.getAddress(), ethers.MaxUint256);
    await weth.connect(verifier2).approve(await marketplace.getAddress(), ethers.MaxUint256);
  });

  async function createTask() {
    const now = await time.latest();
    const commitDeadline = now + 100;
    const revealDeadline = now + 200;
    const disputeWindow = 100;

    const tx = await marketplace
      .connect(requester)
      .createTask(
        ethers.keccak256(ethers.toUtf8Bytes("prompt")),
        ethers.keccak256(ethers.toUtf8Bytes("rubric")),
        commitDeadline,
        revealDeadline,
        disputeWindow,
        2,
        2,
        FEE_POOL
      );
    const receipt = await tx.wait();
    let taskId: bigint | undefined;
    for (const log of receipt?.logs ?? []) {
      try {
        const parsed = marketplace.interface.parseLog(log);
        if (parsed?.name === "TaskCreated") {
          taskId = parsed.args?.taskId;
          break;
        }
      } catch {
        continue;
      }
    }
    expect(taskId).to.not.equal(undefined);
    return { taskId: taskId as bigint, commitDeadline, revealDeadline, disputeWindow };
  }

  async function commitAndReveal(taskId: bigint) {
    const bundleHash = ethers.keccak256(ethers.toUtf8Bytes("bundle"));
    const bundleURI = "ipfs://bundle";
    const salt1 = ethers.keccak256(ethers.toUtf8Bytes("salt1"));
    const salt2 = ethers.keccak256(ethers.toUtf8Bytes("salt2"));

    const commitHash1 = ethers.solidityPackedKeccak256(
      ["uint256", "address", "uint16", "bytes32", "bytes32"],
      [taskId, verifier1.address, 5000, bundleHash, salt1]
    );
    const commitHash2 = ethers.solidityPackedKeccak256(
      ["uint256", "address", "uint16", "bytes32", "bytes32"],
      [taskId, verifier2.address, 5200, bundleHash, salt2]
    );

    await marketplace.connect(verifier1).commitEvaluation(taskId, commitHash1);
    await marketplace.connect(verifier2).commitEvaluation(taskId, commitHash2);

    const { commitDeadline, revealDeadline } = await marketplace.getTaskMeta(taskId);
    await time.increaseTo(Number(commitDeadline) + 1);
    await marketplace.openReveal(taskId);

    await marketplace
      .connect(verifier1)
      .revealEvaluation(taskId, 5000, bundleHash, bundleURI, salt1);
    await marketplace
      .connect(verifier2)
      .revealEvaluation(taskId, 5200, bundleHash, bundleURI, salt2);

    await time.increaseTo(Number(revealDeadline) + 1);
    await marketplace.finalize(taskId);

    return { bundleHash, revealDeadline };
  }

  it("appends truth blocks only after finalization", async function () {
    const { taskId, revealDeadline, disputeWindow } = await createTask();

    await commitAndReveal(taskId);

    expect(await truthChain.taskToBlock(ethers.zeroPadValue(ethers.toBeHex(taskId), 32))).to.equal(
      ethers.ZeroHash
    );

    await time.increaseTo(Number(revealDeadline) + Number(disputeWindow) + 1);
    await marketplace.finalizeUndisputed(taskId);

    const blockHash = await truthChain.taskToBlock(
      ethers.zeroPadValue(ethers.toBeHex(taskId), 32)
    );
    expect(blockHash).to.not.equal(ethers.ZeroHash);
    expect(await truthChain.truthHead()).to.equal(blockHash);
  });

  it("links truth blocks in order and prevents duplicates", async function () {
    const first = await createTask();
    await commitAndReveal(first.taskId);
    await time.increaseTo(Number(first.revealDeadline) + Number(first.disputeWindow) + 1);
    await marketplace.finalizeUndisputed(first.taskId);

    const firstBlock = await truthChain.taskToBlock(
      ethers.zeroPadValue(ethers.toBeHex(first.taskId), 32)
    );

    const second = await createTask();
    await commitAndReveal(second.taskId);
    await time.increaseTo(Number(second.revealDeadline) + Number(second.disputeWindow) + 1);
    await marketplace.finalizeUndisputed(second.taskId);

    const secondBlock = await truthChain.taskToBlock(
      ethers.zeroPadValue(ethers.toBeHex(second.taskId), 32)
    );
    expect(await truthChain.prevByBlock(secondBlock)).to.equal(firstBlock);
    expect(await truthChain.truthHead()).to.equal(secondBlock);

    await ethers.provider.send("hardhat_impersonateAccount", [await marketplace.getAddress()]);
    await ethers.provider.send("hardhat_setBalance", [
      await marketplace.getAddress(),
      "0x1000000000000000000",
    ]);
    const impersonatedMarketplace = await ethers.getSigner(await marketplace.getAddress());

    await expect(
      truthChain
        .connect(impersonatedMarketplace)
        .appendTruthBlock(
          ethers.zeroPadValue(ethers.toBeHex(second.taskId), 32),
          ethers.ZeroHash,
          ethers.ZeroHash,
          ethers.ZeroHash,
          ethers.ZeroHash
        )
    ).to.be.revertedWith("task already recorded");

    await ethers.provider.send("hardhat_stopImpersonatingAccount", [
      await marketplace.getAddress(),
    ]);
  });
});
