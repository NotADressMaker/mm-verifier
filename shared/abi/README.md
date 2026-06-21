# Shared Contract ABIs

This directory contains exported contract ABIs for use across the MAMV system.

## Purpose

- **Single source of truth**: All contract ABIs are exported from compiled artifacts
- **No hardcoded ABIs**: API and verifier-node import ABIs from this shared location
- **Type safety**: TypeScript definitions ensure correct ABI usage

## Setup

### 1. Compile Contracts

First, compile the smart contracts to generate artifacts:

```bash
cd contracts/
npm install
npm run compile
```

This generates artifacts in `contracts/artifacts/contracts/`.

### 2. Export ABIs

Run the export script to copy ABIs to this directory:

```bash
npm run export-abis
```

Or manually copy from artifacts:

```bash
# From project root
cp contracts/artifacts/contracts/VerifierMarketplace.sol/VerifierMarketplace.json shared/abi/
cp contracts/artifacts/contracts/BondVaultWETH.sol/BondVaultWETH.json shared/abi/
cp contracts/artifacts/contracts/DisputeLadder.sol/DisputeLadder.json shared/abi/
cp contracts/artifacts/contracts/AuditorRegistry.sol/AuditorRegistry.json shared/abi/
cp contracts/artifacts/contracts/BundleRegistry.sol/BundleRegistry.json shared/abi/
cp contracts/artifacts/contracts/BLSSlashingManager.sol/BLSSlashingManager.json shared/abi/
```

## Usage

### In API (Node.js/TypeScript)

```typescript
import { VerifierMarketplace, BondVaultWETH, DisputeLadder } from '../shared/abi';
import { ethers } from 'ethers';

const provider = new ethers.JsonRpcProvider(RPC_URL);

// Create contract instances
const marketplace = new ethers.Contract(
  MARKETPLACE_ADDRESS,
  VerifierMarketplace.abi,
  provider
);

const bondVault = new ethers.Contract(
  BOND_VAULT_ADDRESS,
  BondVaultWETH.abi,
  provider
);
```

### In Verifier Node

```typescript
import { DisputeLadder, AuditorRegistry } from '../shared/abi';
// ... same usage as above
```

## Contract ABIs

The following contract ABIs are exported:

- **VerifierMarketplace**: Task creation, commit-reveal, rewards
- **BondVaultWETH**: Centralized WETH bond management
- **DisputeLadder**: Multi-tier dispute resolution (L0→L1→L2→L3)
- **AuditorRegistry**: Auditor staking and registry
- **BundleRegistry**: Evidence bundle commitments
- **BLSSlashingManager**: Branch Legitimacy Scoring slashing

## Type Definitions

Each exported ABI includes TypeScript types:

```typescript
export interface ContractABI {
  abi: any[]; // Full ABI array
  bytecode: string; // Contract bytecode
  contractName: string;
}
```

## Updating ABIs

After modifying smart contracts:

1. Recompile: `cd contracts/ && npm run compile`
2. Re-export: `npm run export-abis`
3. Restart API/verifier-node services

## Architecture Benefits

✅ **No version drift**: ABIs always match deployed contracts
✅ **Easy refactoring**: Update contract → recompile → auto-propagates
✅ **Type safety**: Catch ABI mismatches at build time
✅ **Reduced duplication**: One ABI export, many consumers
