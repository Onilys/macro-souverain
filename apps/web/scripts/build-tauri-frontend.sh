#!/usr/bin/env bash
# Builds the Tauri frontend into dist once the WASM packages are in place, then
# rejects a bundle that would break at runtime. `just build-tauri`,
# `just build-tauri-dev` and the Nix desktop release (nix/tauri-desktop.nix)
# all run this, so the shipped bundle does not depend on which one built it.
#
# usage: build-tauri-frontend.sh <production|development>
set -euo pipefail

mode="$1"
cd "$(dirname "$0")/.."

printf '%s' "$mode" > tauri/src-tauri/.macro-tauri-env
# Vite's chunk rendering can exceed 6GB as the app grows.
MODE="$mode" NODE_ENV=production NODE_OPTIONS="--max-old-space-size=8192" bun run --bun build
bun scripts/cache-wasm/cli.ts package-dist --dist dist
bun scripts/cache-wasm/cli.ts remove-sidecar --dist dist
bun scripts/verify-tauri-bundle.ts --dist dist
