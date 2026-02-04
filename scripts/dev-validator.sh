#!/usr/bin/env bash
set -euo pipefail

echo "Starting validator service..."
cd services/validator
npm run dev
