#!/usr/bin/env bash
set -euo pipefail

echo "Starting MMV API (includes demo protected endpoint)..."
cd api
npm run dev
