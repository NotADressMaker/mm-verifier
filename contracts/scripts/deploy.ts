import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config({ path: "../.env" });

async function main() {
  console.log("Starting LLM Verifier deployment to Arbitrum...\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  // Chainlink VRF configuration for Arbitrum Sepolia
  const VRF_COORDINATOR = process.env.CHAINLINK_VRF_COORDINATOR || "0x5CE8D5A2BC84beb22a398CCA51996F7930313D61";
  const VRF_KEY_HASH = process.env.CHAINLINK_VRF_KEY_HASH || "0x1770bdc7eec7771f7ba4ffd640f34260d7f095b79c92d34a5b2551d6f6cfd2be";
  const VRF_SUBSCRIPTION_ID = process.env.CHAINLINK_SUBSCRIPTION_ID || "1";

  // WETH addresses (Arbitrum One: 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1, Sepolia: 0x980B62Da83eFf3D4576C647993b0c1D7faf17c73)
  const WETH_ADDRESS = process.env.WETH_ADDRESS || "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73";

  // Bond amounts (in wei) - configurable via .env
  const EVAL_BOND = process.env.EVAL_BOND || ethers.parseEther("0.02"); // 0.02 WETH
  const DISPUTE_BOND = process.env.DISPUTE_BOND || ethers.parseEther("0.01"); // 0.01 WETH
  const AUDITOR_MIN_STAKE = process.env.AUDITOR_MIN_STAKE || ethers.parseEther("0.25"); // 0.25 WETH

  const feeCollector = deployer.address; // Using deployer as fee collector for now

  // Deploy StakingManager
  console.log("Deploying StakingManager...");
  const StakingManager = await ethers.getContractFactory("StakingManager");
  const stakingManager = await StakingManager.deploy();
  await stakingManager.waitForDeployment();
  const stakingManagerAddress = await stakingManager.getAddress();
  console.log("✅ StakingManager deployed to:", stakingManagerAddress, "\n");

  // Deploy AuditorRegistry (WETH-based)
  console.log("Deploying AuditorRegistry (WETH-based)...");
  const AuditorRegistry = await ethers.getContractFactory("AuditorRegistry");
  const auditorRegistry = await AuditorRegistry.deploy(
    WETH_ADDRESS,
    AUDITOR_MIN_STAKE
  );
  await auditorRegistry.waitForDeployment();
  const auditorRegistryAddress = await auditorRegistry.getAddress();
  console.log("✅ AuditorRegistry deployed to:", auditorRegistryAddress);
  console.log("   Min Stake:", ethers.formatEther(AUDITOR_MIN_STAKE), "WETH\n");

  // Deploy BLSSlashingManager
  console.log("Deploying BLSSlashingManager...");
  const BLSSlashingManager = await ethers.getContractFactory("BLSSlashingManager");
  const blsSlashingManager = await BLSSlashingManager.deploy(
    WETH_ADDRESS,
    auditorRegistryAddress
  );
  await blsSlashingManager.waitForDeployment();
  const blsSlashingManagerAddress = await blsSlashingManager.getAddress();
  console.log("✅ BLSSlashingManager deployed to:", blsSlashingManagerAddress);
  console.log("   Default slashing params: a=0.10, b=0.60, gamma=2.7, c=0.05\n");

  // Deploy BundleRegistry
  console.log("Deploying BundleRegistry...");
  const BundleRegistry = await ethers.getContractFactory("BundleRegistry");
  const bundleRegistry = await BundleRegistry.deploy();
  await bundleRegistry.waitForDeployment();
  const bundleRegistryAddress = await bundleRegistry.getAddress();
  console.log("✅ BundleRegistry deployed to:", bundleRegistryAddress, "\n");

  // Deploy DisputeLadder (multi-tier dispute resolution with WETH)
  console.log("Deploying DisputeLadder...");
  const DisputeLadder = await ethers.getContractFactory("DisputeLadder");
  const disputeLadder = await DisputeLadder.deploy(
    WETH_ADDRESS,
    bundleRegistryAddress,
    auditorRegistryAddress,
    VRF_COORDINATOR,
    VRF_KEY_HASH,
    VRF_SUBSCRIPTION_ID
  );
  await disputeLadder.waitForDeployment();
  const disputeLadderAddress = await disputeLadder.getAddress();
  console.log("✅ DisputeLadder deployed to:", disputeLadderAddress);
  console.log("   Ladder: L0 (auto) → L1 (5 jurors) → L2 (15 jurors) → L3 (51 jurors)");
  console.log("   Bond mode: WETH\n");

  // Deploy DisputeResolver (legacy)
  console.log("Deploying DisputeResolver (legacy)...");
  const DisputeResolver = await ethers.getContractFactory("DisputeResolver");
  const disputeResolver = await DisputeResolver.deploy(
    stakingManagerAddress,
    auditorRegistryAddress
  );
  await disputeResolver.waitForDeployment();
  const disputeResolverAddress = await disputeResolver.getAddress();
  console.log("✅ DisputeResolver deployed to:", disputeResolverAddress, "\n");

  // Deploy VerificationMarketplace (WETH-based) - note: deployed before BondVault
  console.log("Deploying VerifierMarketplace...");
  const VerifierMarketplace = await ethers.getContractFactory("VerifierMarketplace");
  const marketplace = await VerifierMarketplace.deploy(
    WETH_ADDRESS,
    EVAL_BOND,
    DISPUTE_BOND
  );
  await marketplace.waitForDeployment();
  const marketplaceAddress = await marketplace.getAddress();
  console.log("✅ VerifierMarketplace deployed to:", marketplaceAddress);
  console.log("   WETH:", WETH_ADDRESS);
  console.log("   Eval Bond:", ethers.formatEther(EVAL_BOND), "WETH");
  console.log("   Dispute Bond:", ethers.formatEther(DISPUTE_BOND), "WETH\n");

  // Deploy BondVaultWETH (centralized bond management)
  console.log("Deploying BondVaultWETH...");
  const BondVaultWETH = await ethers.getContractFactory("BondVaultWETH");
  const bondVault = await BondVaultWETH.deploy(
    WETH_ADDRESS,
    marketplaceAddress,
    disputeLadderAddress
  );
  await bondVault.waitForDeployment();
  const bondVaultAddress = await bondVault.getAddress();
  console.log("✅ BondVaultWETH deployed to:", bondVaultAddress);
  console.log("   Authorized: Marketplace (lock/unlock), DisputeLadder (slash), Both (reward)\n");

  // Set up contract relationships
  console.log("Setting up contract relationships...");

  // Transfer ownership of StakingManager to marketplace (for V1 contracts)
  console.log("Transferring StakingManager ownership to marketplace...");
  await stakingManager.transferOwnership(marketplaceAddress);
  console.log("✅ Ownership transferred\n");

  // Transfer ownership of AuditorRegistry to BLSSlashingManager (for slashing)
  console.log("Transferring AuditorRegistry ownership to BLSSlashingManager...");
  await auditorRegistry.transferOwnership(blsSlashingManagerAddress);
  console.log("✅ Ownership transferred\n");

  // Note: VerifierMarketplace dispute integration happens via owner-only markDisputed/markResolved calls
  console.log("✅ Marketplace configured for dispute integration via owner calls\n");

  // Print deployment summary
  console.log("=" .repeat(60));
  console.log("DEPLOYMENT SUMMARY");
  console.log("=" .repeat(60));
  console.log("Network:", (await ethers.provider.getNetwork()).name);
  console.log("Chain ID:", (await ethers.provider.getNetwork()).chainId);
  console.log("\nContract Addresses:");
  console.log("  StakingManager:          ", stakingManagerAddress);
  console.log("  AuditorRegistry:         ", auditorRegistryAddress);
  console.log("  BLSSlashingManager:      ", blsSlashingManagerAddress);
  console.log("  BundleRegistry:          ", bundleRegistryAddress);
  console.log("  DisputeLadder:           ", disputeLadderAddress);
  console.log("  DisputeResolver (legacy):", disputeResolverAddress);
  console.log("  VerifierMarketplace:     ", marketplaceAddress);
  console.log("  BondVaultWETH:           ", bondVaultAddress);
  console.log("\nWETH & Bond Configuration:");
  console.log("  WETH Address:            ", WETH_ADDRESS);
  console.log("  Evaluator Bond:          ", ethers.formatEther(EVAL_BOND), "WETH");
  console.log("  Auditor Min Stake:       ", ethers.formatEther(AUDITOR_MIN_STAKE), "WETH");
  console.log("  Dispute Bond:            ", ethers.formatEther(DISPUTE_BOND), "WETH");
  console.log("\nBLS Slashing Configuration:");
  console.log("  Ordinary disagreement:   a=0.10 (quadratic)");
  console.log("  Unjustified branching:   b=0.60, gamma=2.7 (superlinear)");
  console.log("  Overlap bonus:           c=0.05");
  console.log("  Legit threshold:         0.65");
  console.log("\nFee Collector:             ", feeCollector);
  console.log("=" .repeat(60));

  // Save deployment addresses to file
  const fs = require("fs");
  const deploymentInfo = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    contracts: {
      StakingManager: stakingManagerAddress,
      AuditorRegistry: auditorRegistryAddress,
      BLSSlashingManager: blsSlashingManagerAddress,
      BundleRegistry: bundleRegistryAddress,
      DisputeLadder: disputeLadderAddress,
      DisputeResolver: disputeResolverAddress,
      VerifierMarketplace: marketplaceAddress,
      BondVaultWETH: bondVaultAddress,
    },
    weth: {
      address: WETH_ADDRESS,
      evalBond: ethers.formatEther(EVAL_BOND),
      auditorMinStake: ethers.formatEther(AUDITOR_MIN_STAKE),
      disputeBond: ethers.formatEther(DISPUTE_BOND),
    },
    bls: {
      a: "0.10",
      b: "0.60",
      gamma: "2.7",
      c: "0.05",
      legitThreshold: "0.65",
    },
    feeCollector: feeCollector,
    deployedAt: new Date().toISOString(),
  };

  const deploymentPath = "./deployments";
  if (!fs.existsSync(deploymentPath)) {
    fs.mkdirSync(deploymentPath, { recursive: true });
  }

  const filename = `${deploymentPath}/${(await ethers.provider.getNetwork()).name}-${Date.now()}.json`;
  fs.writeFileSync(filename, JSON.stringify(deploymentInfo, null, 2));
  console.log("\n✅ Deployment info saved to:", filename);

  console.log("\n🎉 Deployment complete!\n");
  console.log("Next steps:");
  console.log("1. Add VRF consumer to your Chainlink subscription");
  console.log("2. Fund the subscription with LINK");
  console.log("3. Verify contracts on Arbiscan");
  console.log("4. Update .env with contract addresses for API/verifier nodes\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
