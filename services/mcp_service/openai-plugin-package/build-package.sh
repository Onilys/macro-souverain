#!/bin/bash
set -euo pipefail

# Build script for OpenAI ChatGPT plugin package
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$SCRIPT_DIR"
OUTPUT_DIR="$(dirname "$SCRIPT_DIR")"

VERSION=$(grep -o '"version": *"[^"]*"' "$PACKAGE_DIR/plugin.json" | cut -d'"' -f4)
OUTPUT_ZIP="$OUTPUT_DIR/macro-plugin-v${VERSION}.zip"

echo "Building Macro plugin package v${VERSION}..."
echo "Validating package structure..."

required_files=("plugin.json" "mcp.json" "README.md")
for file in "${required_files[@]}"; do
    if [[ ! -f "$PACKAGE_DIR/$file" ]]; then
        echo "ERROR: Required file missing: $file"
        exit 1
    fi
done

echo "Validating JSON files..."
for json_file in plugin.json mcp.json; do
    if ! python3 -m json.tool "$PACKAGE_DIR/$json_file" > /dev/null 2>&1; then
        echo "ERROR: Invalid JSON in $json_file"
        exit 1
    fi
done

if [[ -f "$OUTPUT_ZIP" ]]; then
    echo "Removing existing ZIP: $(basename "$OUTPUT_ZIP")"
    rm "$OUTPUT_ZIP"
fi

echo "Creating ZIP archive..."
cd "$PACKAGE_DIR"
zip -r "$OUTPUT_ZIP" plugin.json mcp.json README.md $(find assets -type f 2>/dev/null | tr '\n' ' ' || echo "")

echo ""
echo "Package created: $(basename "$OUTPUT_ZIP")"
echo "Size: $(du -h "$OUTPUT_ZIP" | cut -f1)"
unzip -l "$OUTPUT_ZIP"
echo ""
echo "✓ Ready for OpenAI portal submission"
