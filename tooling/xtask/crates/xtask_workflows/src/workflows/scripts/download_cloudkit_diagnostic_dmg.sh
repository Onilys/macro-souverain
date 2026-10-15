set -euo pipefail

mkdir -p cloudkit-dmg
if ! command -v gh >/dev/null 2>&1; then
  brew install gh
fi

gh release download v2026.10.13.1 \
  --repo "$GH_REPO" \
  --pattern 'Macro-2026.1013.1-aarch64-darwin.dmg' \
  --dir cloudkit-dmg
shasum -a 256 cloudkit-dmg/Macro-2026.1013.1-aarch64-darwin.dmg
