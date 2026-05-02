#!/bin/bash
# Update @9wick/eslint-plugin-strict-type-rules from GitHub (hash-pinned) and prebuild.
# bun doesn't run the prepare lifecycle hook for GitHub deps, so we
# manually install devDependencies (tsup, typescript, etc.) and build.
set -euo pipefail

cd "$(dirname "$0")/.."

PACKAGE_DIR="node_modules/@9wick/eslint-plugin-strict-type-rules"
REPO="9wick/eslint-strict-type-rules"

echo "=== Updating @9wick/eslint-plugin-strict-type-rules ==="

# 1. Get latest commit hash from main branch
echo "[1/4] Fetching latest commit hash from GitHub..."
LATEST_HASH=$(git ls-remote "https://github.com/${REPO}.git" refs/heads/main | cut -f1)
if [ -z "$LATEST_HASH" ]; then
  echo "ERROR: Failed to fetch latest commit hash" >&2
  exit 1
fi
echo "  Latest commit: ${LATEST_HASH}"

# 2. Update package.json to pin the exact commit hash
CURRENT=$(grep -o "github:${REPO}#[a-f0-9]*\|github:${REPO}#main" package.json | head -1)
NEW_REF="github:${REPO}#${LATEST_HASH}"
if [ "$CURRENT" = "$NEW_REF" ]; then
  echo "  Already up to date."
  exit 0
fi
echo "[2/4] Updating package.json (${CURRENT} -> hash-pinned)..."
sed -i "s|\"${CURRENT}\"|\"${NEW_REF}\"|" package.json

# 3. Remove existing and re-install with new hash
echo "[3/4] Installing pinned version..."
rm -rf "$PACKAGE_DIR"
bun install

# 4. Install package devDependencies and build
echo "[4/4] Building (tsup)..."
(cd "$PACKAGE_DIR" && npm install --ignore-scripts 2>&1 | tail -1)
(cd "$PACKAGE_DIR" && ./node_modules/.bin/tsup)

echo "=== Done ==="
