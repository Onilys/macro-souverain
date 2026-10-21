# Icon Assets TODO

Export the following PNG icons from `/workspace/apps/web/public/macro-favicon.svg`:

1. **icon-512.png**: 512x512px PNG
2. **icon-256.png**: 256x256px PNG  
3. **icon-128.png**: 128x128px PNG

## Using ImageMagick or similar

```bash
# From the repository root
cd /workspace/apps/web/public

# Convert SVG to PNGs at required sizes
convert -background none -density 1024 macro-favicon.svg -resize 512x512 \
    /workspace/services/mcp_service/openai-plugin-package/assets/icon-512.png

convert -background none -density 512 macro-favicon.svg -resize 256x256 \
    /workspace/services/mcp_service/openai-plugin-package/assets/icon-256.png

convert -background none -density 256 macro-favicon.svg -resize 128x128 \
    /workspace/services/mcp_service/openai-plugin-package/assets/icon-128.png
```

## Using Inkscape

```bash
inkscape macro-favicon.svg --export-filename=icon-512.png --export-width=512 --export-height=512
inkscape macro-favicon.svg --export-filename=icon-256.png --export-width=256 --export-height=256
inkscape macro-favicon.svg --export-filename=icon-128.png --export-width=128 --export-height=128
```

## Or use any design tool

Open the SVG in Figma, Sketch, or Adobe Illustrator and export at the required sizes with transparent backgrounds.
