import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import {
  AuditorRegistry,
  BundleRegistry,
  DisputeLadder,
  MockWETH,
} from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { parseEther, keccak256, toUtf8Bytes } from "ethers";

describe("DisputeLadder", function () {
  let disputeLadder: DisputeLadder;
  let weth: MockWETH;
  let bundleRegistry: BundleRegistry;
  let auditorRegistry: AuditorRegistry;
  let owner: SignerWithAddress;
  let challenger: SignerWithAddress;
  let verifier: SignerWithAddress;
  let juror1: SignerWithAddress;
  let juror2: SignerWithAddress;
  let juror3: SignerWithAddress;

  const CHALLENGE_BOND = parseEther("1");
  const DEFENSE_BOND = parseEther("1");
  const BRANCH_ID = 1;
  const EVIDENCE_HASH = keccak256(toUtf8Bytes("bundle"));
  const BUNDLE_URI = "ipfs://bundle-1";

  const VRF_COORDINATOR = "0x0000000000000000000000000000000000000001";
  const KEY_HASH = "0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c";
  const SUBSCRIPTION_ID = 1;

  async function registerBundle() {
    const tx = await bundleRegistry.connect(verifier).registerBundle(
      1,
      1,
      keccak256(toUtf8Bytes("branches-root")),
      EVIDENCE_HASH,
      BUNDLE_URI
    );
    const receipt = await tx.wait();
    const event = receipt?.logs.find((log) => (log as any).fragment?.name === "BundleRegistered");
    const bundleId = (event as any).args.bundleId as string;
    return bundleId;
  }

  async function seedAuditors() {
    const jurors = [juror1, juror2, juror3];
    for (const juror of jurors) {
      await weth.connect(juror).deposit({ value: parseEther("5") });
      await weth.connect(juror).approve(await auditorRegistry.getAddress(), parseEther("5"));
      await auditorRegistry.connect(juror).stake(parseEther("2"));
    }
  }

  before(async function () {
    [owner, challenger, verifier, juror1, juror2, juror3] = await ethers.getSigners();
  });

  beforeEach(async function () {
    const WETHFactory = await ethers.getContractFactory("MockWETH");
    weth = await WETHFactory.deploy();
    await weth.waitForDeployment();

    const BundleRegistryFactory = await ethers.getContractFactory("BundleRegistry");
    bundleRegistry = await BundleRegistryFactory.deploy();
    await bundleRegistry.waitForDeployment();

    const AuditorRegistryFactory = await ethers.getContractFactory("AuditorRegistry");
    auditorRegistry = await AuditorRegistryFactory.deploy(await weth.getAddress(), parseEther("1"));
    await auditorRegistry.waitForDeployment();

    const DisputeLadderFactory = await ethers.getContractFactory("DisputeLadder");
    disputeLadder = await DisputeLadderFactory.deploy(
      await weth.getAddress(),
      await bundleRegistry.getAddress(),
      await auditorRegistry.getAddress(),
      VRF_COORDINATOR,
      KEY_HASH,
      SUBSCRIPTION_ID
    );
    await disputeLadder.waitForDeployment();
    await disputeLadder.connect(owner).setUseVrf(false);
    await disputeLadder.connect(owner).setJurySize(1, 3);

    await seedAuditors();

    await weth.connect(challenger).deposit({ value: parseEther("10") });
    await weth.connect(verifier).deposit({ value: parseEther("10") });

    await weth.connect(challenger).approve(await disputeLadder.getAddress(), ethers.MaxUint256);
    await weth.connect(verifier).approve(await disputeLadder.getAddress(), ethers.MaxUint256);
  });

  async function openDisputeToVoting(): Promise<string[]> {
    const bundleId = await registerBundle();
    await disputeLadder.connect(challenger).openDispute(bundleId, BRANCH_ID, 0, CHALLENGE_BOND);
    await disputeLadder
      .connect(verifier)
      .respondToDispute(1, EVIDENCE_HASH, 'ipfs://response');
    await disputeLadder.connect(verifier).postDefenseBond(1, DEFENSE_BOND);
    await disputeLadder.connect(challenger).runL0AutoCheck(1);

    const evidenceMeta = {
      evidenceRoot: EVIDENCE_HASH,
      ipfsCidHash: keccak256(toUtf8Bytes(BUNDLE_URI)),
      maxTierClaimed: 2,
    };
    await disputeLadder.connect(challenger).submitEvidence(1, true, evidenceMeta);
    await time.increase(60 * 60);
    await disputeLadder.connect(challenger).startVoting(1);

    const round = await disputeLadder.getRound(1, 1);
    return round.jurors;
  }

  it("prevents verifier from challenging own bundle", async function () {
    const bundleId = await registerBundle();
    await expect(
      disputeLadder.connect(verifier).openDispute(bundleId, BRANCH_ID, 0, CHALLENGE_BOND)
    ).to.be.revertedWith("Cannot dispute own bundle");
  });

  it("enforces challenge window", async function () {
    const bundleId = await registerBundle();
    await disputeLadder.connect(owner).setChallengeWindow(60);
    await time.increase(120);

    await expect(
      disputeLadder.connect(challenger).openDispute(bundleId, BRANCH_ID, 0, CHALLENGE_BOND)
    ).to.be.revertedWith("Challenge window closed");
  });

  it("enforces response window", async function () {
    const bundleId = await registerBundle();
    await disputeLadder.connect(owner).setResponseWindow(60);
    await disputeLadder.connect(challenger).openDispute(bundleId, BRANCH_ID, 0, CHALLENGE_BOND);

    await expect(disputeLadder.connect(challenger).runL0AutoCheck(1)).to.be.revertedWith(
      "Awaiting response"
    );

    await time.increase(120);

    await expect(disputeLadder.connect(challenger).resolveForNonResponse(1)).to.emit(
      disputeLadder,
      "RoundResolved"
    );
  });

  it("assigns auditors deterministically when VRF disabled", async function () {
    const bundleId = await registerBundle();
    await disputeLadder.connect(challenger).openDispute(bundleId, BRANCH_ID, 0, CHALLENGE_BOND);
    await disputeLadder
      .connect(verifier)
      .respondToDispute(1, EVIDENCE_HASH, "ipfs://response");

    await disputeLadder.connect(challenger).runL0AutoCheck(1);
    const round = await disputeLadder.getRound(1, 1);
    expect(round.jurors.length).to.equal(3);
  });

  it("requires selected jurors and blocks double voting", async function () {
    const bundleId = await registerBundle();
    await disputeLadder.connect(challenger).openDispute(bundleId, BRANCH_ID, 0, CHALLENGE_BOND);
    await disputeLadder
      .connect(verifier)
      .respondToDispute(1, EVIDENCE_HASH, "ipfs://response");
    await disputeLadder.connect(challenger).runL0AutoCheck(1);

    const evidenceMeta = {
      evidenceRoot: EVIDENCE_HASH,
      ipfsCidHash: keccak256(toUtf8Bytes(BUNDLE_URI)),
      maxTierClaimed: 2,
    };
    await disputeLadder.connect(challenger).submitEvidence(1, true, evidenceMeta);
    await time.increase(60 * 60);
    await disputeLadder.connect(challenger).startVoting(1);

    const round = await disputeLadder.getRound(1, 1);
    const juror = round.jurors[0];

    const vote = {
      winner: 1,
      invalidBranchCount: 0,
      fabricationProven: false,
      winningEvidenceTier: 2,
      rationaleHash: keccak256(toUtf8Bytes("vote")),
    };

    await expect(disputeLadder.connect(challenger).submitAuditVote(1, vote, 9000, EVIDENCE_HASH))
      .to.be.revertedWith("Not a juror");

    await disputeLadder.connect(await ethers.getSigner(juror)).submitAuditVote(1, vote, 9000, EVIDENCE_HASH);

    await expect(
      disputeLadder.connect(await ethers.getSigner(juror)).submitAuditVote(1, vote, 9000, EVIDENCE_HASH)
    ).to.be.revertedWith("Already voted");
  });

  it("resolves with challenger payout and appeal logic", async function () {
    const bundleId = await registerBundle();
    await disputeLadder.connect(challenger).openDispute(bundleId, BRANCH_ID, 0, CHALLENGE_BOND);
    await disputeLadder
      .connect(verifier)
      .respondToDispute(1, EVIDENCE_HASH, "ipfs://response");
    await disputeLadder.connect(verifier).postDefenseBond(1, DEFENSE_BOND);

    await disputeLadder.connect(challenger).runL0AutoCheck(1);
    const evidenceMeta = {
      evidenceRoot: EVIDENCE_HASH,
      ipfsCidHash: keccak256(toUtf8Bytes(BUNDLE_URI)),
      maxTierClaimed: 2,
    };
    await disputeLadder.connect(challenger).submitEvidence(1, true, evidenceMeta);
    await time.increase(60 * 60);
    await disputeLadder.connect(challenger).startVoting(1);
    const round = await disputeLadder.getRound(1, 1);
    const jurors = round.jurors.slice(0, 3);

    const vote = {
      winner: 1,
      invalidBranchCount: 0,
      fabricationProven: false,
      winningEvidenceTier: 2,
      rationaleHash: keccak256(toUtf8Bytes("vote")),
    };

    for (const juror of jurors) {
      await disputeLadder.connect(await ethers.getSigner(juror)).submitAuditVote(1, vote, 9200, EVIDENCE_HASH);
    }

    await time.increase(60 * 60 * 2);
    await disputeLadder.connect(challenger).closeVoting(1);
    await disputeLadder.connect(challenger).tally(1);

    await expect(
      disputeLadder.connect(verifier).appeal(1, parseEther("0.01"))
    ).to.be.revertedWith("Insufficient appeal bond");

    await disputeLadder.connect(verifier).appeal(1, parseEther("0.05"));
    const dispute = await disputeLadder.disputes(1);
    expect(dispute.currentLevel).to.equal(1);
  });

  it("finalizes with challenger win payouts", async function () {
    const jurors = await openDisputeToVoting();
    const vote = {
      winner: 1,
      invalidBranchCount: 0,
      fabricationProven: false,
      winningEvidenceTier: 2,
      rationaleHash: keccak256(toUtf8Bytes("vote")),
    };

    for (const juror of jurors) {
      await disputeLadder.connect(await ethers.getSigner(juror)).submitAuditVote(1, vote, 9500, EVIDENCE_HASH);
    }

    await time.increase(60 * 60 * 2);
    await disputeLadder.connect(challenger).closeVoting(1);
    await disputeLadder.connect(challenger).tally(1);

    await time.increase(60 * 60 * 3);
    const balanceBefore = await weth.balanceOf(challenger.address);
    await disputeLadder.connect(challenger).finalize(1);
    const balanceAfter = await weth.balanceOf(challenger.address);

    expect(balanceAfter - balanceBefore).to.equal(parseEther("1.5"));
  });

  it("finalizes with verifier win payouts", async function () {
    const jurors = await openDisputeToVoting();
    const vote = {
      winner: 2,
      invalidBranchCount: 0,
      fabricationProven: false,
      winningEvidenceTier: 2,
      rationaleHash: keccak256(toUtf8Bytes("vote")),
    };

    for (const juror of jurors) {
      await disputeLadder.connect(await ethers.getSigner(juror)).submitAuditVote(1, vote, 8500, EVIDENCE_HASH);
    }

    await time.increase(60 * 60 * 2);
    await disputeLadder.connect(challenger).closeVoting(1);
    await disputeLadder.connect(challenger).tally(1);

    await time.increase(60 * 60 * 3);
    const balanceBefore = await weth.balanceOf(verifier.address);
    await disputeLadder.connect(challenger).finalize(1);
    const balanceAfter = await weth.balanceOf(verifier.address);

    expect(balanceAfter - balanceBefore).to.equal(parseEther("1.5"));
  });

  it("rejects evidence hash mismatches", async function () {
    const bundleId = await registerBundle();
    await disputeLadder.connect(challenger).openDispute(bundleId, BRANCH_ID, 0, CHALLENGE_BOND);
    await disputeLadder
      .connect(verifier)
      .respondToDispute(1, EVIDENCE_HASH, "ipfs://response");
    await disputeLadder.connect(challenger).runL0AutoCheck(1);

    const badMeta = {
      evidenceRoot: keccak256(toUtf8Bytes("bad")),
      ipfsCidHash: keccak256(toUtf8Bytes("bad")),
      maxTierClaimed: 2,
    };

    await expect(
      disputeLadder.connect(challenger).submitEvidence(1, true, badMeta)
    ).to.be.revertedWith("Evidence hash mismatch");
  });
});
