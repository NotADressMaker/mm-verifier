#!/usr/bin/env bash
set -euo pipefail

echo "Starting local Hardhat chain..."
cd contracts
npx hardhat node
