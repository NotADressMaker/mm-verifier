import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import {
  JobBoardEscrow,
  MockERC20,
  MockIdentityRegistry,
  MockValidationRegistry,
} from "../typechain-types";

describe("JobBoardEscrow", function () {
  let escrow: JobBoardEscrow;
  let identity: MockIdentityRegistry;
  let validation: MockValidationRegistry;
  let token: MockERC20;
  let owner: any;
  let agentOwner: any;
  let validator: any;

  const agentId = 1;

  beforeEach(async function () {
    [owner, agentOwner, validator] = await ethers.getSigners();

    const IdentityFactory = await ethers.getContractFactory("MockIdentityRegistry");
    identity = await IdentityFactory.deploy();
    await identity.waitForDeployment();

    const ValidationFactory = await ethers.getContractFactory("MockValidationRegistry");
    validation = await ValidationFactory.deploy();
    await validation.waitForDeployment();

    const EscrowFactory = await ethers.getContractFactory("JobBoardEscrow");
    escrow = await EscrowFactory.deploy(
      await identity.getAddress(),
      await validation.getAddress()
    );
    await escrow.waitForDeployment();

    const TokenFactory = await ethers.getContractFactory("MockERC20");
    token = await TokenFactory.deploy("Mock Token", "MOCK");
    await token.waitForDeployment();

    await identity.setAgent(agentId, agentOwner.address, "ipfs://agent");
  });

  it("releases milestone payouts after validation", async function () {
    const budget = ethers.parseEther("1");
    const deadline = (await time.latest()) + 86400;

    const jobTx = await escrow.connect(owner).postJob(
      "ipfs://job",
      ethers.keccak256(ethers.toUtf8Bytes("job")),
      ethers.ZeroAddress,
      budget,
      deadline,
      2,
      0,
      { value: budget }
    );
    await jobTx.wait();

    await escrow.connect(owner).addMilestones(
      1,
      ["ipfs://ms1", "ipfs://ms2"],
      [
        ethers.keccak256(ethers.toUtf8Bytes("ms1")),
        ethers.keccak256(ethers.toUtf8Bytes("ms2")),
      ],
      [5000, 5000]
    );

    await escrow.connect(owner).award(1, agentId);

    await escrow.connect(agentOwner).submitProof(
      1,
      0,
      "ipfs://proof1",
      ethers.keccak256(ethers.toUtf8Bytes("proof1"))
    );

    const requestHash = ethers.keccak256(ethers.toUtf8Bytes("request1"));
    await escrow.connect(owner).requestValidation(
      1,
      validator.address,
      0,
      "ipfs://request1",
      requestHash
    );

    await validation.submitResponse(
      requestHash,
      80,
      "ipfs://response1",
      ethers.keccak256(ethers.toUtf8Bytes("response1")),
      "milestone-0"
    );

    const balanceBefore = await ethers.provider.getBalance(agentOwner.address);
    const finalizeTx = await escrow.connect(owner).finalize(1, 0, requestHash);
    await finalizeTx.wait();
    const balanceAfter = await ethers.provider.getBalance(agentOwner.address);

    expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther("0.5"));

    const finalRequestHash = ethers.keccak256(ethers.toUtf8Bytes("final"));
    await escrow.connect(owner).requestValidation(
      1,
      validator.address,
      2,
      "ipfs://final-request",
      finalRequestHash
    );

    await validation.submitResponse(
      finalRequestHash,
      90,
      "ipfs://final-response",
      ethers.keccak256(ethers.toUtf8Bytes("final-response")),
      "final"
    );

    await expect(escrow.connect(owner).finalize(1, 2, finalRequestHash))
      .to.emit(escrow, "JobFinalized")
      .withArgs(1, 2, finalRequestHash, 90, ethers.parseEther("0.5"), agentOwner.address);
  });

  it("handles dispute acceptance and remainder reclaim", async function () {
    const budget = 1000n;
    const deadline = (await time.latest()) + 86400;

    await token.mint(owner.address, budget);
    await token.connect(owner).approve(await escrow.getAddress(), budget);

    await escrow.connect(owner).postJob(
      "ipfs://job-erc20",
      ethers.keccak256(ethers.toUtf8Bytes("job-erc20")),
      await token.getAddress(),
      budget,
      deadline,
      1,
      75
    );

    await escrow.connect(owner).addMilestones(
      1,
      ["ipfs://ms"],
      [ethers.keccak256(ethers.toUtf8Bytes("ms"))],
      [10000]
    );

    await escrow.connect(owner).award(1, agentId);

    await escrow.connect(owner).openDispute(
      1,
      6000,
      "ipfs://dispute",
      ethers.keccak256(ethers.toUtf8Bytes("dispute"))
    );

    await expect(escrow.connect(agentOwner).acceptDispute(1))
      .to.emit(escrow, "DisputeAccepted")
      .withArgs(1, 600n, 400n);

    expect(await token.balanceOf(agentOwner.address)).to.equal(600n);
    expect(await token.balanceOf(owner.address)).to.equal(400n);

    const jobId = 2;
    await token.mint(owner.address, budget);
    await token.connect(owner).approve(await escrow.getAddress(), budget);

    await escrow.connect(owner).postJob(
      "ipfs://job-erc20-2",
      ethers.keccak256(ethers.toUtf8Bytes("job-erc20-2")),
      await token.getAddress(),
      budget,
      deadline,
      1,
      75
    );

    await escrow.connect(owner).addMilestones(
      jobId,
      ["ipfs://ms2"],
      [ethers.keccak256(ethers.toUtf8Bytes("ms2"))],
      [10000]
    );

    await escrow.connect(owner).award(jobId, agentId);

    await escrow.connect(owner).openDispute(
      jobId,
      4000,
      "ipfs://dispute2",
      ethers.keccak256(ethers.toUtf8Bytes("dispute2"))
    );

    await time.increase(7 * 24 * 60 * 60 + 1);

    await expect(escrow.connect(owner).reclaimRemainder(jobId))
      .to.emit(escrow, "RemainderReclaimed")
      .withArgs(jobId, budget);

    expect(await token.balanceOf(owner.address)).to.equal(1400n);
  });
});
