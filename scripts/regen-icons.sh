#!/bin/bash
set -e

# One-time install
command -v magick >/dev/null || brew install imagemagick librsvg

cd public

# 1. favicon.svg — canonical SVG, no rasterization
cp volnar-mark.svg favicon.svg

# 2. favicon.ico — multi-res 16+32 embedded
magick -background none volnar-mark.svg \
  -define icon:auto-resize=16,32 favicon.ico

# 3. apple-touch-icon.png (180x180, dark bg, iOS auto-rounds)
magick -size 180x180 xc:'#1A1814' \
  \( volnar-mark.svg -resize 120x120 \) \
  -gravity center -composite \
  apple-touch-icon.png

# 4. PWA icons
magick -size 192x192 xc:'#1A1814' \
  \( volnar-mark.svg -resize 128x128 \) \
  -gravity center -composite \
  icon-192.png

magick -size 512x512 xc:'#1A1814' \
  \( volnar-mark.svg -resize 340x340 \) \
  -gravity center -composite \
  icon-512.png

echo "Icons regenerated. OG image still needs manual design — see notes."
