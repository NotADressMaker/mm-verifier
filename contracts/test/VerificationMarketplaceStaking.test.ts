import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import {
  MockWETH,
  StakingManager,
  VerifierMarketplace,
} from "../typechain-types";

describe("VerifierMarketplace staking integration", function () {
  const EVAL_BOND = ethers.parseEther("1");
  const DISPUTE_BOND = ethers.parseEther("1");
  const FEE_POOL = ethers.parseEther("10");

  let weth: MockWETH;
  let staking: StakingManager;
  let marketplace: VerifierMarketplace;

  let owner: any;
  let requester: any;
  let verifier1: any;
  let verifier2: any;

  beforeEach(async function () {
    [owner, requester, verifier1, verifier2] = await ethers.getSigners();

    const WETHFactory = await ethers.getContractFactory("MockWETH");
    weth = await WETHFactory.deploy();
    await weth.waitForDeployment();

    const StakingFactory = await ethers.getContractFactory("StakingManager");
    staking = await StakingFactory.deploy();
    await staking.waitForDeployment();

    const MarketplaceFactory = await ethers.getContractFactory("VerifierMarketplace");
    marketplace = await MarketplaceFactory.deploy(
      await weth.getAddress(),
      EVAL_BOND,
      DISPUTE_BOND
    );
    await marketplace.waitForDeployment();

    await staking.connect(owner).transferOwnership(await marketplace.getAddress());

    await marketplace
      .connect(owner)
      .setStakingManager(await staking.getAddress(), true, ethers.parseEther("0.1"), 500);

    await staking.connect(verifier1).stakeAsVerifier({ value: ethers.parseEther("1") });
    await staking.connect(verifier2).stakeAsVerifier({ value: ethers.parseEther("1") });

    await weth.connect(requester).deposit({ value: ethers.parseEther("100") });
    await weth.connect(verifier1).deposit({ value: ethers.parseEther("10") });
    await weth.connect(verifier2).deposit({ value: ethers.parseEther("10") });

    await weth.connect(requester).approve(await marketplace.getAddress(), ethers.MaxUint256);
    await weth.connect(verifier1).approve(await marketplace.getAddress(), ethers.MaxUint256);
    await weth.connect(verifier2).approve(await marketplace.getAddress(), ethers.MaxUint256);
  });

  it("locks stake on commit and slashes inaccurate evaluator after dispute resolution", async function () {
    const now = await time.latest();
    const commitDeadline = now + 100;
    const revealDeadline = now + 200;
    const disputeWindow = 100;

    await marketplace
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

    const taskId = 1n;
    const bundleHash = ethers.keccak256(ethers.toUtf8Bytes("bundle"));
    const bundleURI = "ipfs://bundle";

    const salt1 = ethers.keccak256(ethers.toUtf8Bytes("salt1"));
    const salt2 = ethers.keccak256(ethers.toUtf8Bytes("salt2"));
    const score1 = 9000;
    const score2 = 1000;

    const commitHash1 = ethers.solidityPackedKeccak256(
      ["uint256", "address", "uint16", "bytes32", "bytes32"],
      [taskId, verifier1.address, score1, bundleHash, salt1]
    );
    const commitHash2 = ethers.solidityPackedKeccak256(
      ["uint256", "address", "uint16", "bytes32", "bytes32"],
      [taskId, verifier2.address, score2, bundleHash, salt2]
    );

    await marketplace.connect(verifier1).commitEvaluation(taskId, commitHash1);
    await marketplace.connect(verifier2).commitEvaluation(taskId, commitHash2);

    const lockedAfterCommit1 = await staking.getStake(verifier1.address);
    const lockedAfterCommit2 = await staking.getStake(verifier2.address);
    expect(lockedAfterCommit1.lockedAmount).to.equal(ethers.parseEther("0.1"));
    expect(lockedAfterCommit2.lockedAmount).to.equal(ethers.parseEther("0.1"));

    await time.increaseTo(commitDeadline + 1);
    await marketplace.openReveal(taskId);
    await marketplace.connect(verifier1).revealEvaluation(taskId, score1, bundleHash, bundleURI, salt1);
    await marketplace.connect(verifier2).revealEvaluation(taskId, score2, bundleHash, bundleURI, salt2);

    await time.increaseTo(revealDeadline + 1);
    await marketplace.finalize(taskId);

    await marketplace.connect(owner).markDisputed(taskId);
    await marketplace.connect(owner).markResolved(taskId, score2);

    const stake1 = await staking.getStake(verifier1.address);
    const stake2 = await staking.getStake(verifier2.address);

    expect(stake1.lockedAmount).to.equal(0n);
    expect(stake2.lockedAmount).to.equal(0n);
    expect(stake1.amount).to.equal(ethers.parseEther("0.95"));
    expect(stake2.amount).to.equal(ethers.parseEther("1"));
  });
});
