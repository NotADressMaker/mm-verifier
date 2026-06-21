#!/usr/bin/env bash
set -euo pipefail

echo "Preparing MAMV Lens extension..."
cd apps/trust-lens
npm install
npm run build
