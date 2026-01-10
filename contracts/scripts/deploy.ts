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

  const feeCollector = deployer.address; // Using deployer as fee collector for now

  // Deploy StakingManager
  console.log("Deploying StakingManager...");
  const StakingManager = await ethers.getContractFactory("StakingManager");
  const stakingManager = await StakingManager.deploy();
  await stakingManager.waitForDeployment();
  const stakingManagerAddress = await stakingManager.getAddress();
  console.log("✅ StakingManager deployed to:", stakingManagerAddress, "\n");

  // Deploy AuditorRegistry
  console.log("Deploying AuditorRegistry...");
  const AuditorRegistry = await ethers.getContractFactory("AuditorRegistry");
  const auditorRegistry = await AuditorRegistry.deploy(
    VRF_COORDINATOR,
    VRF_KEY_HASH,
    VRF_SUBSCRIPTION_ID
  );
  await auditorRegistry.waitForDeployment();
  const auditorRegistryAddress = await auditorRegistry.getAddress();
  console.log("✅ AuditorRegistry deployed to:", auditorRegistryAddress, "\n");

  // Deploy DisputeResolver
  console.log("Deploying DisputeResolver...");
  const DisputeResolver = await ethers.getContractFactory("DisputeResolver");
  const disputeResolver = await DisputeResolver.deploy(
    stakingManagerAddress,
    auditorRegistryAddress
  );
  await disputeResolver.waitForDeployment();
  const disputeResolverAddress = await disputeResolver.getAddress();
  console.log("✅ DisputeResolver deployed to:", disputeResolverAddress, "\n");

  // Deploy VerificationMarketplace (WETH-based)
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

  // Set up contract relationships
  console.log("Setting up contract relationships...");

  // Transfer ownership of StakingManager to marketplace (for V1 contracts)
  console.log("Transferring StakingManager ownership to marketplace...");
  await stakingManager.transferOwnership(marketplaceAddress);
  console.log("✅ Ownership transferred\n");

  // Transfer ownership of AuditorRegistry to DisputeResolver
  console.log("Transferring AuditorRegistry ownership to DisputeResolver...");
  await auditorRegistry.transferOwnership(disputeResolverAddress);
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
  console.log("  DisputeResolver:         ", disputeResolverAddress);
  console.log("  VerifierMarketplace:     ", marketplaceAddress);
  console.log("\nChainlink VRF Configuration:");
  console.log("  VRF Coordinator:         ", VRF_COORDINATOR);
  console.log("  Key Hash:                ", VRF_KEY_HASH);
  console.log("  Subscription ID:         ", VRF_SUBSCRIPTION_ID);
  console.log("\nWETH & Bond Configuration:");
  console.log("  WETH Address:            ", WETH_ADDRESS);
  console.log("  Evaluator Bond:          ", ethers.formatEther(EVAL_BOND), "WETH");
  console.log("  Dispute Bond:            ", ethers.formatEther(DISPUTE_BOND), "WETH");
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
      DisputeResolver: disputeResolverAddress,
      VerifierMarketplace: marketplaceAddress,
    },
    chainlink: {
      vrfCoordinator: VRF_COORDINATOR,
      keyHash: VRF_KEY_HASH,
      subscriptionId: VRF_SUBSCRIPTION_ID,
    },
    weth: {
      address: WETH_ADDRESS,
      evalBond: ethers.formatEther(EVAL_BOND),
      disputeBond: ethers.formatEther(DISPUTE_BOND),
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
