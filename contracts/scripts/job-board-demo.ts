import { ethers } from "hardhat";

async function main() {
  const [owner, agent, validator] = await ethers.getSigners();

  console.log("JobBoardEscrow demo (local Anvil)");
  console.log("Owner:", owner.address);
  console.log("Agent:", agent.address);
  console.log("Validator:", validator.address);

  // Deploy standalone JobBoardEscrow (no external registries)
  const EscrowFactory = await ethers.getContractFactory("JobBoardEscrow");
  const escrow = await EscrowFactory.deploy();
  await escrow.waitForDeployment();

  console.log("✅ JobBoardEscrow deployed:", await escrow.getAddress());

  const budget = ethers.parseEther("0.2");
  const deadline = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

  // Post a job
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

  // Add milestones
  await escrow.connect(owner).addMilestones(
    1,
    ["ipfs://milestone-1", "ipfs://milestone-2"],
    [
      ethers.keccak256(ethers.toUtf8Bytes("milestone-1")),
      ethers.keccak256(ethers.toUtf8Bytes("milestone-2")),
    ],
    [5000, 5000]
  );

  // Award directly to agent address (no external registry)
  await escrow.connect(owner).award(1, agent.address);

  console.log("✅ Job posted and awarded to agent");

  // Agent submits proof
  await escrow.connect(agent).submitProof(
    1,
    0,
    "ipfs://proof-1",
    ethers.keccak256(ethers.toUtf8Bytes("proof-1"))
  );

  console.log("✅ Agent submitted proof for milestone 0");

  // Owner requests validation
  const requestHash = ethers.keccak256(ethers.toUtf8Bytes("request-1"));
  await escrow.connect(owner).requestValidation(
    1,
    validator.address,
    0,
    "ipfs://request-1",
    requestHash
  );

  console.log("✅ Owner requested validation from validator");

  // Validator submits response directly to escrow
  await escrow.connect(validator).submitValidation(
    requestHash,
    85,
    "ipfs://response-1",
    ethers.keccak256(ethers.toUtf8Bytes("response-1")),
    "milestone-0"
  );

  console.log("✅ Validator submitted validation response (score: 85)");

  // Finalize milestone
  await escrow.connect(owner).finalize(1, 0, requestHash);

  console.log("✅ Milestone 0 finalized, agent paid 0.1 ETH");

  // Check agent balance change
  const job = await escrow.jobs(1);
  console.log("\nJob status:");
  console.log("  Budget:", ethers.formatEther(job.budgetAmount), "ETH");
  console.log("  Total released:", ethers.formatEther(job.totalReleased), "ETH");
  console.log("  Closed:", job.closed);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
