import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import {
  MMVCoin,
  MockWETH,
  VerifierMarketplace,
  VerifierRewards,
} from "../typechain-types";

describe("VerifierRewards", function () {
  const EVAL_BOND = ethers.parseEther("1");
  const DISPUTE_BOND = ethers.parseEther("1");
  const BASE_REWARD = ethers.parseEther("100");
  const TOLERANCE_BPS = 250;
  const FEE_POOL = ethers.parseEther("10");

  let weth: MockWETH;
  let marketplace: VerifierMarketplace;
  let rewards: VerifierRewards;
  let coin: MMVCoin;

  let owner: any;
  let requester: any;
  let verifier1: any;
  let verifier2: any;
  let verifier3: any;

  beforeEach(async function () {
    [owner, requester, verifier1, verifier2, verifier3] = await ethers.getSigners();

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

    const CoinFactory = await ethers.getContractFactory("MMVCoin");
    coin = await CoinFactory.deploy();
    await coin.waitForDeployment();

    const RewardsFactory = await ethers.getContractFactory("VerifierRewards");
    rewards = await RewardsFactory.deploy(
      await coin.getAddress(),
      await marketplace.getAddress(),
      BASE_REWARD,
      TOLERANCE_BPS
    );
    await rewards.waitForDeployment();

    await coin.connect(owner).setMinter(await rewards.getAddress());
    await marketplace.connect(owner).setRewardsDistributor(await rewards.getAddress());

    await weth.connect(requester).deposit({ value: ethers.parseEther("50") });
    await weth.connect(verifier1).deposit({ value: ethers.parseEther("10") });
    await weth.connect(verifier2).deposit({ value: ethers.parseEther("10") });
    await weth.connect(verifier3).deposit({ value: ethers.parseEther("10") });

    await weth.connect(requester).approve(await marketplace.getAddress(), ethers.MaxUint256);
    await weth.connect(verifier1).approve(await marketplace.getAddress(), ethers.MaxUint256);
    await weth.connect(verifier2).approve(await marketplace.getAddress(), ethers.MaxUint256);
    await weth.connect(verifier3).approve(await marketplace.getAddress(), ethers.MaxUint256);
  });

  async function createTask(minEvals = 2, maxEvals = 3) {
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
        minEvals,
        maxEvals,
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

  async function commitEvaluation(
    taskId: bigint,
    signer: any,
    scoreBps: number,
    bundleHash: string,
    bundleURI: string,
    salt: string
  ) {
    const commitHash = ethers.solidityPackedKeccak256(
      ["uint256", "address", "uint16", "bytes32", "bytes32"],
      [taskId, signer.address, scoreBps, bundleHash, salt]
    );
    await marketplace.connect(signer).commitEvaluation(taskId, commitHash);
    return { scoreBps, bundleHash, bundleURI, salt };
  }

  async function revealEvaluation(
    taskId: bigint,
    signer: any,
    scoreBps: number,
    bundleHash: string,
    bundleURI: string,
    salt: string
  ) {
    await marketplace
      .connect(signer)
      .revealEvaluation(taskId, scoreBps, bundleHash, bundleURI, salt);
  }

  it("does not mint rewards at provisional finalize", async function () {
    const { taskId, commitDeadline, revealDeadline } = await createTask();

    const bundleHash = ethers.keccak256(ethers.toUtf8Bytes("bundle-1"));
    const bundleURI = "ipfs://bundle-1";
    const salt1 = ethers.keccak256(ethers.toUtf8Bytes("salt1"));
    const salt2 = ethers.keccak256(ethers.toUtf8Bytes("salt2"));

    await commitEvaluation(taskId, verifier1, 5000, bundleHash, bundleURI, salt1);
    await commitEvaluation(taskId, verifier2, 5200, bundleHash, bundleURI, salt2);

    await time.increaseTo(commitDeadline + 1);
    await marketplace.openReveal(taskId);

    await revealEvaluation(taskId, verifier1, 5000, bundleHash, bundleURI, salt1);
    await revealEvaluation(taskId, verifier2, 5200, bundleHash, bundleURI, salt2);

    await time.increaseTo(revealDeadline + 1);
    await marketplace.finalize(taskId);

    expect(await coin.totalSupply()).to.equal(0n);
  });

  it("mints rewards only after dispute window finalization", async function () {
    const { taskId, commitDeadline, revealDeadline, disputeWindow } = await createTask();

    const bundleHash = ethers.keccak256(ethers.toUtf8Bytes("bundle-2"));
    const bundleURI = "ipfs://bundle-2";
    const salt1 = ethers.keccak256(ethers.toUtf8Bytes("salt3"));
    const salt2 = ethers.keccak256(ethers.toUtf8Bytes("salt4"));
    const salt3 = ethers.keccak256(ethers.toUtf8Bytes("salt5"));

    await commitEvaluation(taskId, verifier1, 5000, bundleHash, bundleURI, salt1);
    await commitEvaluation(taskId, verifier2, 8000, bundleHash, bundleURI, salt2);
    await commitEvaluation(taskId, verifier3, 7000, bundleHash, bundleURI, salt3);

    await time.increaseTo(commitDeadline + 1);
    await marketplace.openReveal(taskId);

    await revealEvaluation(taskId, verifier1, 5000, bundleHash, bundleURI, salt1);
    await revealEvaluation(taskId, verifier2, 8000, bundleHash, bundleURI, salt2);

    await time.increaseTo(revealDeadline + 1);
    await marketplace.finalize(taskId);

    expect(await coin.totalSupply()).to.equal(0n);

    await time.increaseTo(revealDeadline + disputeWindow + 1);
    await marketplace.finalizeUndisputed(taskId);

    expect(await coin.totalSupply()).to.equal(BASE_REWARD);
    expect(await coin.balanceOf(verifier2.address)).to.equal(BASE_REWARD);
    expect(await coin.balanceOf(verifier1.address)).to.equal(0n);
    expect(await coin.balanceOf(verifier3.address)).to.equal(0n);
  });

  it("excludes non-reveal verifiers and splits rewards among correct winners", async function () {
    const { taskId, commitDeadline, revealDeadline, disputeWindow } = await createTask(2, 3);

    const bundleHash = ethers.keccak256(ethers.toUtf8Bytes("bundle-3"));
    const bundleURI = "ipfs://bundle-3";
    const salt1 = ethers.keccak256(ethers.toUtf8Bytes("salt6"));
    const salt2 = ethers.keccak256(ethers.toUtf8Bytes("salt7"));
    const salt3 = ethers.keccak256(ethers.toUtf8Bytes("salt8"));

    await commitEvaluation(taskId, verifier1, 5000, bundleHash, bundleURI, salt1);
    await commitEvaluation(taskId, verifier2, 5100, bundleHash, bundleURI, salt2);
    await commitEvaluation(taskId, verifier3, 9000, bundleHash, bundleURI, salt3);

    await time.increaseTo(commitDeadline + 1);
    await marketplace.openReveal(taskId);

    await revealEvaluation(taskId, verifier1, 5000, bundleHash, bundleURI, salt1);
    await revealEvaluation(taskId, verifier2, 5100, bundleHash, bundleURI, salt2);

    await time.increaseTo(revealDeadline + 1);
    await marketplace.finalize(taskId);

    await time.increaseTo(revealDeadline + disputeWindow + 1);
    await marketplace.finalizeUndisputed(taskId);

    const expectedReward = BASE_REWARD / 2n;
    expect(await coin.totalSupply()).to.equal(BASE_REWARD);
    expect(await coin.balanceOf(verifier1.address)).to.equal(expectedReward);
    expect(await coin.balanceOf(verifier2.address)).to.equal(expectedReward);
    expect(await coin.balanceOf(verifier3.address)).to.equal(0n);
  });

  it("mints rewards after dispute settlement and prevents double payment", async function () {
    const { taskId, commitDeadline, revealDeadline } = await createTask(2, 2);

    const bundleHash = ethers.keccak256(ethers.toUtf8Bytes("bundle-4"));
    const bundleURI = "ipfs://bundle-4";
    const salt1 = ethers.keccak256(ethers.toUtf8Bytes("salt9"));
    const salt2 = ethers.keccak256(ethers.toUtf8Bytes("salt10"));

    await commitEvaluation(taskId, verifier1, 6000, bundleHash, bundleURI, salt1);
    await commitEvaluation(taskId, verifier2, 6200, bundleHash, bundleURI, salt2);

    await time.increaseTo(commitDeadline + 1);
    await marketplace.openReveal(taskId);

    await revealEvaluation(taskId, verifier1, 6000, bundleHash, bundleURI, salt1);
    await revealEvaluation(taskId, verifier2, 6200, bundleHash, bundleURI, salt2);

    await time.increaseTo(revealDeadline + 1);
    await marketplace.finalize(taskId);

    await marketplace.connect(owner).markDisputed(taskId);
    await marketplace.connect(owner).markResolved(taskId, 6100);

    expect(await coin.totalSupply()).to.equal(BASE_REWARD);

    await ethers.provider.send("hardhat_impersonateAccount", [await marketplace.getAddress()]);
    await ethers.provider.send("hardhat_setBalance", [
      await marketplace.getAddress(),
      "0x1000000000000000000",
    ]);
    const impersonatedMarketplace = await ethers.getSigner(await marketplace.getAddress());

    await expect(
      rewards.connect(impersonatedMarketplace).onTaskFinalized(taskId)
    ).to.be.revertedWith("rewards already paid");

    await ethers.provider.send("hardhat_stopImpersonatingAccount", [
      await marketplace.getAddress(),
    ]);
  });
});
