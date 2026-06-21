#!/usr/bin/env bash

# MAMV Quickstart
# One-command setup for mock or real providers.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${QUICKSTART_ENV_FILE:-$ROOT_DIR/.env.runtime}"

MODE="mock"
RESET=false
NO_DASHBOARD=false
ENV_ONLY=false

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

usage() {
  cat <<'USAGE'
Usage: ./quickstart.sh [--real] [--reset] [--no-dashboard] [--env-only]

Options:
  --real          Switch to real providers + chain submit.
  --reset         Wipe docker volumes before starting.
  --no-dashboard  Skip starting the dashboard dev server.
  --env-only      Only write the runtime env file; do not start services.
USAGE
}

log_step() {
  echo -e "${YELLOW}$1${NC}"
}

fail() {
  echo -e "${RED}❌ $1${NC}"
  exit 1
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

escape_sed() {
  printf '%s' "$1" | sed -e 's/[\\/&]/\\\\&/g'
}

set_env() {
  local key="$1"
  local value="$2"
  local escaped
  escaped="$(escape_sed "$value")"

  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i.bak "s|^${key}=.*|${key}=${escaped}|" "$ENV_FILE"
  else
    echo "${key}=${value}" >> "$ENV_FILE"
  fi
  rm -f "${ENV_FILE}.bak"
}

require_env() {
  local key="$1"
  local value
  value="${!key:-}"
  if [[ -z "$value" ]]; then
    fail "Missing required environment variable: ${key}. Set it in ${ENV_FILE}."
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --real)
      MODE="real"
      shift
      ;;
    --reset)
      RESET=true
      shift
      ;;
    --no-dashboard)
      NO_DASHBOARD=true
      shift
      ;;
    --env-only)
      ENV_ONLY=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
done

if [[ "$ENV_ONLY" == "false" ]]; then
  log_step "[1/4] Checking prerequisites..."
  if ! command_exists docker; then
    fail "Docker not found. Please install Docker first."
  fi
  if ! command_exists docker-compose; then
    fail "docker-compose not found. Please install docker-compose first."
  fi
  echo -e "${GREEN}✓${NC} Prerequisites met"
fi

log_step "[2/4] Preparing runtime environment file..."
if [[ ! -f "$ENV_FILE" ]]; then
  if [[ -f "$ROOT_DIR/.env.example" ]]; then
    cp "$ROOT_DIR/.env.example" "$ENV_FILE"
  else
    touch "$ENV_FILE"
  fi
fi

if [[ "$MODE" == "mock" ]]; then
  set_env MOCK_VERIFIER true
  set_env MOCK_PROVIDERS true
  set_env MOCK_CHAIN true
  set_env MOCK_SCENARIO happy
  set_env PROVIDER_MODE mock
  set_env CHAIN_MODE mock
  set_env HASHED_ONLY_DEFAULT true
else
  set_env MOCK_VERIFIER false
  set_env MOCK_PROVIDERS false
  set_env MOCK_CHAIN false
  set_env PROVIDER_MODE real
  set_env CHAIN_MODE real
  set_env HASHED_ONLY_DEFAULT true
fi

echo -e "${GREEN}✓${NC} Runtime env file ready at ${ENV_FILE}"

set -a
source "$ENV_FILE"
set +a

if [[ "$MODE" == "real" ]]; then
  log_step "[3/4] Validating required real-mode configuration..."
  require_env ARBITRUM_SEPOLIA_RPC_URL
  require_env MARKETPLACE_ADDRESS
  require_env STAKING_ADDRESS
  require_env PRIVATE_KEY
  require_env VERIFIER_PRIVATE_KEY

  if [[ -z "${OPENAI_API_KEY:-}" && -z "${ANTHROPIC_API_KEY:-}" && -z "${GOOGLE_API_KEY:-}" && -z "${COHERE_API_KEY:-}" && -z "${HUGGINGFACE_API_KEY:-}" ]]; then
    fail "At least one provider API key must be set (OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_API_KEY, COHERE_API_KEY, or HUGGINGFACE_API_KEY)."
  fi

  if [[ ! "$MARKETPLACE_ADDRESS" =~ ^0x[a-fA-F0-9]{40}$ ]]; then
    fail "MARKETPLACE_ADDRESS must be a valid 0x address."
  fi
  if [[ ! "$STAKING_ADDRESS" =~ ^0x[a-fA-F0-9]{40}$ ]]; then
    fail "STAKING_ADDRESS must be a valid 0x address."
  fi
  echo -e "${GREEN}✓${NC} Real-mode configuration looks good"
fi

if [[ "$ENV_ONLY" == "true" ]]; then
  echo -e "${GREEN}✓${NC} Environment file updated. Skipping service startup (--env-only)."
  exit 0
fi

log_step "[4/4] Starting services..."
if [[ "$RESET" == "true" ]]; then
  docker-compose down -v
fi

services=(redis)
if [[ "${MOCK_VERIFIER:-true}" != "true" ]]; then
  services+=(postgres ipfs)
fi

if [[ "${CHAIN_MODE:-mock}" == "local" ]]; then
  services+=(hardhat)
fi

if [[ "${#services[@]}" -gt 0 ]]; then
  docker-compose --env-file "$ENV_FILE" up -d "${services[@]}"
fi

docker-compose --env-file "$ENV_FILE" up -d api verifier-node

cat <<SUMMARY

┌──────────────────────────────────────────────────────────┐
│          ${GREEN}✓ MAMV stack booted (${MODE} mode)${NC}           │
└──────────────────────────────────────────────────────────┘

Runtime env: ${ENV_FILE}
API:         http://localhost:${API_PORT:-3000}
Dashboard:   http://localhost:${DASHBOARD_PORT:-5173}

Summary:
  MOCK_VERIFIER=${MOCK_VERIFIER}
  MOCK_PROVIDERS=${MOCK_PROVIDERS}
  PROVIDER_MODE=${PROVIDER_MODE}
  CHAIN_MODE=${CHAIN_MODE}
  HASHED_ONLY_DEFAULT=${HASHED_ONLY_DEFAULT}
SUMMARY

if [[ "$NO_DASHBOARD" == "false" ]]; then
  if [[ ! -d "$ROOT_DIR/apps/dashboard/node_modules" ]]; then
    npm --prefix "$ROOT_DIR/apps/dashboard" install
  fi
  echo "Starting dashboard dev server..."
  npm --prefix "$ROOT_DIR/apps/dashboard" run dev
else
  echo "Dashboard skipped (--no-dashboard)."
fi
