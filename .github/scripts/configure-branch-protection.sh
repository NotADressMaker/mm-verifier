#!/usr/bin/env bash
set -euo pipefail

# Applies the versioned main-branch policy. Run as a repository administrator.
# Usage: .github/scripts/configure-branch-protection.sh OWNER/REPOSITORY
repository="${1:?Usage: $0 OWNER/REPOSITORY}"
root="$(git rev-parse --show-toplevel)"

command -v gh >/dev/null || {
  echo "GitHub CLI (gh) is required. Install it, authenticate as an administrator, and retry." >&2
  exit 1
}

gh api --method PATCH \
  -H "Accept: application/vnd.github+json" \
  "/repos/${repository}" \
  -f default_branch=main

gh api --method PUT \
  -H "Accept: application/vnd.github+json" \
  "/repos/${repository}/branches/main/protection" \
  --input "${root}/.github/branch-protection.json"

echo "Applied main branch protection to ${repository}."
