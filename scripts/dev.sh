#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f .env.runtime ]]; then
  set -a
  source .env.runtime
  set +a
fi

DOCKER_ENV_FILE="${DOCKER_ENV_FILE:-.env.runtime}"

MOCK_VERIFIER="${MOCK_VERIFIER:-true}"
MOCK_CHAIN="${MOCK_CHAIN:-true}"
CHAIN_MODE="${CHAIN_MODE:-${MOCK_CHAIN:-true}}"
MOCK_SCENARIO="${MOCK_SCENARIO:-happy}"
MOCK_VERIFIER_DELAY_MS="${MOCK_VERIFIER_DELAY_MS:-150}"

services=(redis)
if [[ "$MOCK_VERIFIER" != "true" ]]; then
  services+=(postgres ipfs)
  if [[ "$CHAIN_MODE" == "local" ]]; then
    services+=(hardhat)
  fi
fi

if [[ "${#services[@]}" -gt 0 ]]; then
  echo "Starting infrastructure: ${services[*]}"
  docker-compose --env-file "$DOCKER_ENV_FILE" up -d "${services[@]}"
fi

pids=()

run_with_prefix() {
  local name="$1"
  shift
  local cmd=("$@")
  ("${cmd[@]}" 2>&1 | sed -u "s/^/[${name}] /") &
  pids+=("$!")
}

export MOCK_VERIFIER
export MOCK_CHAIN
export CHAIN_MODE
export MOCK_SCENARIO
export MOCK_VERIFIER_DELAY_MS

run_with_prefix "api" npm --prefix api run dev
run_with_prefix "verifier" npm --prefix verifier-node run dev
run_with_prefix "dashboard" npm --prefix apps/dashboard run dev

cleanup() {
  echo "Shutting down dev stack..."
  for pid in "${pids[@]}"; do
    kill "$pid" >/dev/null 2>&1 || true
  done
  wait || true
}

trap cleanup EXIT INT TERM

wait
