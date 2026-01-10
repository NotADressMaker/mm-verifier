/**
 * Shared Contract ABIs
 *
 * Single source of truth for contract ABIs across API and verifier-node.
 *
 * SETUP REQUIRED:
 * 1. cd contracts/ && npm install && npm run compile
 * 2. Copy artifacts to this directory (see README.md)
 * 3. Uncomment the imports below
 */

// TODO: Uncomment after compiling contracts and copying artifacts
// import VerifierMarketplaceArtifact from './VerifierMarketplace.json';
// import BondVaultWETHArtifact from './BondVaultWETH.json';
// import DisputeLadderArtifact from './DisputeLadder.json';
// import AuditorRegistryArtifact from './AuditorRegistry.json';
// import BundleRegistryArtifact from './BundleRegistry.json';
// import BLSSlashingManagerArtifact from './BLSSlashingManager.json';

/**
 * Contract ABI exports
 *
 * Each export includes:
 * - abi: Full ABI array for ethers.js Contract instantiation
 * - bytecode: Contract bytecode for deployment
 * - contractName: Human-readable contract name
 */

// Core marketplace contracts
export const VerifierMarketplace = {
  // TODO: Uncomment after compilation
  // abi: VerifierMarketplaceArtifact.abi,
  // bytecode: VerifierMarketplaceArtifact.bytecode,
  contractName: 'VerifierMarketplace',
};

export const BondVaultWETH = {
  // TODO: Uncomment after compilation
  // abi: BondVaultWETHArtifact.abi,
  // bytecode: BondVaultWETHArtifact.bytecode,
  contractName: 'BondVaultWETH',
};

// Dispute resolution contracts
export const DisputeLadder = {
  // TODO: Uncomment after compilation
  // abi: DisputeLadderArtifact.abi,
  // bytecode: DisputeLadderArtifact.bytecode,
  contractName: 'DisputeLadder',
};

// Registry contracts
export const AuditorRegistry = {
  // TODO: Uncomment after compilation
  // abi: AuditorRegistryArtifact.abi,
  // bytecode: AuditorRegistryArtifact.bytecode,
  contractName: 'AuditorRegistry',
};

export const BundleRegistry = {
  // TODO: Uncomment after compilation
  // abi: BundleRegistryArtifact.abi,
  // bytecode: BundleRegistryArtifact.bytecode,
  contractName: 'BundleRegistry',
};

// Slashing contract
export const BLSSlashingManager = {
  // TODO: Uncomment after compilation
  // abi: BLSSlashingManagerArtifact.abi,
  // bytecode: BLSSlashingManagerArtifact.bytecode,
  contractName: 'BLSSlashingManager',
};

/**
 * Helper function to get contract ABI by name
 * @param contractName Name of the contract
 * @returns Contract ABI object
 */
export function getContractABI(contractName: string) {
  const contracts: Record<string, any> = {
    VerifierMarketplace,
    BondVaultWETH,
    DisputeLadder,
    AuditorRegistry,
    BundleRegistry,
    BLSSlashingManager,
  };

  const contract = contracts[contractName];
  if (!contract) {
    throw new Error(`Unknown contract: ${contractName}`);
  }

  return contract;
}

/**
 * Type definitions for contract ABIs
 */
export interface ContractABI {
  abi: any[];
  bytecode: string;
  contractName: string;
}

// Re-export all contracts
export default {
  VerifierMarketplace,
  BondVaultWETH,
  DisputeLadder,
  AuditorRegistry,
  BundleRegistry,
  BLSSlashingManager,
  getContractABI,
};
