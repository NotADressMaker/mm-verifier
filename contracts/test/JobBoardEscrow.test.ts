import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import {
  JobBoardEscrow,
  MockERC20,
} from "../typechain-types";

describe("JobBoardEscrow", function () {
  let escrow: JobBoardEscrow;
  let token: MockERC20;
  let owner: any;
  let agent: any;
  let validator: any;

  beforeEach(async function () {
    [owner, agent, validator] = await ethers.getSigners();

    const EscrowFactory = await ethers.getContractFactory("JobBoardEscrow");
    escrow = await EscrowFactory.deploy();
    await escrow.waitForDeployment();

    const TokenFactory = await ethers.getContractFactory("MockERC20");
    token = await TokenFactory.deploy("Mock Token", "MOCK");
    await token.waitForDeployment();
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

    // Award to agent address directly (no external registry)
    await escrow.connect(owner).award(1, agent.address);

    await escrow.connect(agent).submitProof(
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

    // Validator submits response directly to the escrow contract
    await escrow.connect(validator).submitValidation(
      requestHash,
      80,
      "ipfs://response1",
      ethers.keccak256(ethers.toUtf8Bytes("response1")),
      "milestone-0"
    );

    const balanceBefore = await ethers.provider.getBalance(agent.address);
    const finalizeTx = await escrow.connect(owner).finalize(1, 0, requestHash);
    await finalizeTx.wait();
    const balanceAfter = await ethers.provider.getBalance(agent.address);

    expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther("0.5"));

    const finalRequestHash = ethers.keccak256(ethers.toUtf8Bytes("final"));
    await escrow.connect(owner).requestValidation(
      1,
      validator.address,
      2,
      "ipfs://final-request",
      finalRequestHash
    );

    await escrow.connect(validator).submitValidation(
      finalRequestHash,
      90,
      "ipfs://final-response",
      ethers.keccak256(ethers.toUtf8Bytes("final-response")),
      "final"
    );

    await expect(escrow.connect(owner).finalize(1, 2, finalRequestHash))
      .to.emit(escrow, "JobFinalized")
      .withArgs(1, 2, finalRequestHash, 90, ethers.parseEther("0.5"), agent.address);
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

    // Award to agent address directly
    await escrow.connect(owner).award(1, agent.address);

    await escrow.connect(owner).openDispute(
      1,
      6000,
      "ipfs://dispute",
      ethers.keccak256(ethers.toUtf8Bytes("dispute"))
    );

    await expect(escrow.connect(agent).acceptDispute(1))
      .to.emit(escrow, "DisputeAccepted")
      .withArgs(1, 600n, 400n);

    expect(await token.balanceOf(agent.address)).to.equal(600n);
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

    await escrow.connect(owner).award(jobId, agent.address);

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

  it("only allows designated validator to submit validation", async function () {
    const budget = ethers.parseEther("1");
    const deadline = (await time.latest()) + 86400;

    await escrow.connect(owner).postJob(
      "ipfs://job",
      ethers.keccak256(ethers.toUtf8Bytes("job")),
      ethers.ZeroAddress,
      budget,
      deadline,
      1,
      70,
      { value: budget }
    );

    await escrow.connect(owner).addMilestones(
      1,
      ["ipfs://ms"],
      [ethers.keccak256(ethers.toUtf8Bytes("ms"))],
      [10000]
    );

    await escrow.connect(owner).award(1, agent.address);

    const requestHash = ethers.keccak256(ethers.toUtf8Bytes("request1"));
    await escrow.connect(owner).requestValidation(
      1,
      validator.address,
      0,
      "ipfs://request1",
      requestHash
    );

    // Non-designated validator cannot submit
    await expect(
      escrow.connect(agent).submitValidation(
        requestHash,
        80,
        "ipfs://response1",
        ethers.keccak256(ethers.toUtf8Bytes("response1")),
        "milestone-0"
      )
    ).to.be.revertedWith("Not designated validator");

    // Designated validator can submit
    await escrow.connect(validator).submitValidation(
      requestHash,
      80,
      "ipfs://response1",
      ethers.keccak256(ethers.toUtf8Bytes("response1")),
      "milestone-0"
    );

    // Cannot submit twice
    await expect(
      escrow.connect(validator).submitValidation(
        requestHash,
        90,
        "ipfs://response2",
        ethers.keccak256(ethers.toUtf8Bytes("response2")),
        "milestone-0"
      )
    ).to.be.revertedWith("Already responded");
  });

  it("can read validation response via getValidationResponse", async function () {
    const budget = ethers.parseEther("1");
    const deadline = (await time.latest()) + 86400;

    await escrow.connect(owner).postJob(
      "ipfs://job",
      ethers.keccak256(ethers.toUtf8Bytes("job")),
      ethers.ZeroAddress,
      budget,
      deadline,
      1,
      70,
      { value: budget }
    );

    await escrow.connect(owner).addMilestones(
      1,
      ["ipfs://ms"],
      [ethers.keccak256(ethers.toUtf8Bytes("ms"))],
      [10000]
    );

    await escrow.connect(owner).award(1, agent.address);

    const requestHash = ethers.keccak256(ethers.toUtf8Bytes("request1"));
    await escrow.connect(owner).requestValidation(
      1,
      validator.address,
      0,
      "ipfs://request1",
      requestHash
    );

    // Before submission, response should not exist
    let response = await escrow.getValidationResponse(requestHash);
    expect(response.exists).to.equal(false);

    await escrow.connect(validator).submitValidation(
      requestHash,
      85,
      "ipfs://response1",
      ethers.keccak256(ethers.toUtf8Bytes("response1")),
      "milestone-0"
    );

    // After submission, response should exist with correct values
    response = await escrow.getValidationResponse(requestHash);
    expect(response.exists).to.equal(true);
    expect(response.score).to.equal(85);
    expect(response.responseURI).to.equal("ipfs://response1");
    expect(response.tag).to.equal("milestone-0");
  });
});
