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

  // Deploy VerificationMarketplace
  console.log("Deploying VerificationMarketplace...");
  const VerificationMarketplace = await ethers.getContractFactory("VerificationMarketplace");
  const marketplace = await VerificationMarketplace.deploy(
    stakingManagerAddress,
    feeCollector
  );
  await marketplace.waitForDeployment();
  const marketplaceAddress = await marketplace.getAddress();
  console.log("✅ VerificationMarketplace deployed to:", marketplaceAddress, "\n");

  // Set up contract relationships
  console.log("Setting up contract relationships...");

  // Transfer ownership of StakingManager to marketplace
  console.log("Transferring StakingManager ownership to VerificationMarketplace...");
  await stakingManager.transferOwnership(marketplaceAddress);
  console.log("✅ Ownership transferred\n");

  // Transfer ownership of AuditorRegistry to DisputeResolver
  console.log("Transferring AuditorRegistry ownership to DisputeResolver...");
  await auditorRegistry.transferOwnership(disputeResolverAddress);
  console.log("✅ Ownership transferred\n");

  // Set DisputeResolver in marketplace
  console.log("Setting DisputeResolver in VerificationMarketplace...");
  await marketplace.setDisputeResolver(disputeResolverAddress);
  console.log("✅ DisputeResolver set\n");

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
  console.log("  VerificationMarketplace: ", marketplaceAddress);
  console.log("\nChainlink VRF Configuration:");
  console.log("  VRF Coordinator:         ", VRF_COORDINATOR);
  console.log("  Key Hash:                ", VRF_KEY_HASH);
  console.log("  Subscription ID:         ", VRF_SUBSCRIPTION_ID);
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
      VerificationMarketplace: marketplaceAddress,
    },
    chainlink: {
      vrfCoordinator: VRF_COORDINATOR,
      keyHash: VRF_KEY_HASH,
      subscriptionId: VRF_SUBSCRIPTION_ID,
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
