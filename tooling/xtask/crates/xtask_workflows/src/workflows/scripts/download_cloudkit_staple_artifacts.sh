set -euo pipefail

mkdir -p cloudkit-staple-input
if ! command -v gh >/dev/null 2>&1; then
  brew install gh
fi

gh release download v2026.10.13.1 \
  --repo "$GH_REPO" \
  --pattern 'Macro-2026.1013.1-aarch64-darwin.dmg' \
  --dir cloudkit-staple-input
gh release download v2026.10.13.1 \
  --repo "$GH_REPO" \
  --pattern 'Macro-2026.1013.1-aarch64-darwin.app.tar.gz' \
  --dir cloudkit-staple-input

tar -xzf cloudkit-staple-input/Macro-2026.1013.1-aarch64-darwin.app.tar.gz \
  -C cloudkit-staple-input
chmod u+w cloudkit-staple-input/Macro-2026.1013.1-aarch64-darwin.dmg
chmod -R u+w cloudkit-staple-input/Macro.app

shasum -a 256 cloudkit-staple-input/Macro-2026.1013.1-aarch64-darwin.dmg
codesign --verify --strict --verbose=2 \
  cloudkit-staple-input/Macro-2026.1013.1-aarch64-darwin.dmg
codesign --verify --deep --strict --verbose=2 cloudkit-staple-input/Macro.app
