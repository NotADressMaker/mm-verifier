import { ethers } from "hardhat";

async function main() {
  const [owner, agentOwner, validator] = await ethers.getSigners();

  console.log("JobBoardEscrow demo (local Anvil)");
  console.log("Owner:", owner.address);
  console.log("Agent owner:", agentOwner.address);

  const IdentityFactory = await ethers.getContractFactory("MockIdentityRegistry");
  const identity = await IdentityFactory.deploy();
  await identity.waitForDeployment();

  const ValidationFactory = await ethers.getContractFactory("MockValidationRegistry");
  const validation = await ValidationFactory.deploy();
  await validation.waitForDeployment();

  const EscrowFactory = await ethers.getContractFactory("JobBoardEscrow");
  const escrow = await EscrowFactory.deploy(
    await identity.getAddress(),
    await validation.getAddress()
  );
  await escrow.waitForDeployment();

  console.log("✅ JobBoardEscrow deployed:", await escrow.getAddress());

  const agentId = 1;
  await identity.setAgent(agentId, agentOwner.address, "ipfs://agent");

  const budget = ethers.parseEther("0.2");
  const deadline = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

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
    ["ipfs://milestone-1", "ipfs://milestone-2"],
    [
      ethers.keccak256(ethers.toUtf8Bytes("milestone-1")),
      ethers.keccak256(ethers.toUtf8Bytes("milestone-2")),
    ],
    [5000, 5000]
  );

  await escrow.connect(owner).award(1, agentId);

  console.log("✅ Job posted and awarded");

  await escrow.connect(agentOwner).submitProof(
    1,
    0,
    "ipfs://proof-1",
    ethers.keccak256(ethers.toUtf8Bytes("proof-1"))
  );

  const requestHash = ethers.keccak256(ethers.toUtf8Bytes("request-1"));
  await escrow.connect(owner).requestValidation(
    1,
    validator.address,
    0,
    "ipfs://request-1",
    requestHash
  );

  await validation.submitResponse(
    requestHash,
    85,
    "ipfs://response-1",
    ethers.keccak256(ethers.toUtf8Bytes("response-1")),
    "milestone-0"
  );

  await escrow.connect(owner).finalize(1, 0, requestHash);

  console.log("✅ Milestone 1 finalized");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
