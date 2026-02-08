import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { parseEther, keccak256, toUtf8Bytes } from "ethers";
import {
  ReceiptDisputeManager,
  VerifierRegistry,
} from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("ReceiptDisputeManager", function () {
  let registry: VerifierRegistry;
  let disputeManager: ReceiptDisputeManager;
  let owner: SignerWithAddress;
  let verifier: SignerWithAddress;
  let challenger: SignerWithAddress;

  const MIN_STAKE = parseEther("5");
  const CHALLENGE_BOND = parseEther("1");
  const RESPONSE_BOND = parseEther("1");
  const DISPUTE_WINDOW = 3 * 24 * 60 * 60;
  const RESPONSE_WINDOW = 2 * 24 * 60 * 60;
  const SLASH_BPS = 2000;
  const SLASH_BPS_NO_RESPONSE = 1000;

  beforeEach(async function () {
    [owner, verifier, challenger] = await ethers.getSigners();

    const RegistryFactory = await ethers.getContractFactory("VerifierRegistry");
    registry = await RegistryFactory.deploy(
      MIN_STAKE,
      2 * 24 * 60 * 60,
      0,
      10,
      5,
      8,
      6
    );
    await registry.waitForDeployment();

    const DisputeFactory = await ethers.getContractFactory("ReceiptDisputeManager");
    disputeManager = await DisputeFactory.deploy(
      await registry.getAddress(),
      CHALLENGE_BOND,
      RESPONSE_BOND,
      DISPUTE_WINDOW,
      RESPONSE_WINDOW,
      SLASH_BPS,
      SLASH_BPS_NO_RESPONSE
    );
    await disputeManager.waitForDeployment();

    await registry.connect(owner).setAuthorizedCaller(await disputeManager.getAddress(), true);

    await registry
      .connect(verifier)
      .registerVerifier("ipfs://verifier", verifier.address, { value: parseEther("10") });
  });

  it("enforces withdrawal delay", async function () {
    await registry.connect(verifier).requestExit();

    await expect(registry.connect(verifier).withdrawStake(parseEther("1"))).to.be.revertedWith(
      "cooldown"
    );

    await time.increase(2 * 24 * 60 * 60 + 1);

    await expect(registry.connect(verifier).withdrawStake(parseEther("10")))
      .to.emit(registry, "StakeWithdrawn")
      .withArgs(verifier.address, parseEther("10"), 0);
  });

  it("slashes for incorrect receipts and pays challenger", async function () {
    const receiptHash = keccak256(toUtf8Bytes("receipt"));
    const bundleHash = keccak256(toUtf8Bytes("bundle"));

    const submitTx = await disputeManager
      .connect(verifier)
      .submitReceipt(receiptHash, bundleHash, "ipfs://bundle");
    const submitReceipt = await submitTx.wait();
    const receiptEvent = submitReceipt?.logs.find(
      (log) => (log as any).fragment?.name === "ReceiptSubmitted"
    );
    const receiptId = (receiptEvent as any).args.receiptId as bigint;

    await disputeManager.connect(challenger).challengeReceipt(receiptId, { value: CHALLENGE_BOND });
    await disputeManager.connect(verifier).respondToDispute(receiptId, { value: RESPONSE_BOND });

    const expectedSlash = parseEther("2");

    await expect(disputeManager.connect(owner).resolveDispute(receiptId, true)).to.changeEtherBalances(
      [challenger, verifier, disputeManager],
      [CHALLENGE_BOND + RESPONSE_BOND + expectedSlash, 0, 0]
    );

    const info = await registry.getVerifier(verifier.address);
    expect(info.stake).to.equal(parseEther("8"));
    expect(info.disputesLost).to.equal(1);
    expect(info.jobsCompleted).to.equal(1);
  });

  it("auto-resolves disputes for non-response", async function () {
    const receiptHash = keccak256(toUtf8Bytes("receipt-2"));
    const bundleHash = keccak256(toUtf8Bytes("bundle-2"));

    const submitTx = await disputeManager
      .connect(verifier)
      .submitReceipt(receiptHash, bundleHash, "ipfs://bundle-2");
    const submitReceipt = await submitTx.wait();
    const receiptEvent = submitReceipt?.logs.find(
      (log) => (log as any).fragment?.name === "ReceiptSubmitted"
    );
    const receiptId = (receiptEvent as any).args.receiptId as bigint;

    await disputeManager.connect(challenger).challengeReceipt(receiptId, { value: CHALLENGE_BOND });

    await time.increase(RESPONSE_WINDOW + 1);

    await disputeManager.connect(challenger).finalizeExpiredDispute(receiptId);

    const info = await registry.getVerifier(verifier.address);
    expect(info.stake).to.equal(parseEther("9"));
    expect(info.disputesLost).to.equal(1);
  });

  it("finalizes undisputed receipts after window", async function () {
    const receiptHash = keccak256(toUtf8Bytes("receipt-3"));
    const bundleHash = keccak256(toUtf8Bytes("bundle-3"));

    const submitTx = await disputeManager
      .connect(verifier)
      .submitReceipt(receiptHash, bundleHash, "ipfs://bundle-3");
    const submitReceipt = await submitTx.wait();
    const receiptEvent = submitReceipt?.logs.find(
      (log) => (log as any).fragment?.name === "ReceiptSubmitted"
    );
    const receiptId = (receiptEvent as any).args.receiptId as bigint;

    await time.increase(DISPUTE_WINDOW + 1);

    await disputeManager.connect(challenger).finalizeReceipt(receiptId);

    const info = await registry.getVerifier(verifier.address);
    expect(info.jobsCompleted).to.equal(1);
    expect(info.reputationScore).to.equal(10);
  });
});
