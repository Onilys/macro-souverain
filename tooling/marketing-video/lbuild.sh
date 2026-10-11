#!/usr/bin/env bash
# Long cuts (launch.html, ~1 min): soundtrack once, then each format renders as piped segments
# (render.mjs segments: subframes stream into ffmpeg, so no frames hit the disk), concatenated with the mix.
set -euo pipefail
cd "$(dirname "$0")"
FF=${FF:-ffmpeg}; WORKERS=${WORKERS:-5}; SEG=${SEG:-/tmp/macro-segments}; PAGE=${PAGE:-launch.html}
PAGE=$PAGE FMT=45 node render.mjs cues audio/cues.json
(cd audio && FF="$FF" python3 mix.py)
for f in ${FMTS:-916 45 11}; do
  rm -rf "$SEG"; mkdir -p "$SEG"
  PAGE=$PAGE FMT=$f FF="$FF" node render.mjs segments "$SEG" "$WORKERS"
  (for s in "$SEG"/seg*.mp4; do echo "file '$s'"; done) > "$SEG/list.txt"
  "$FF" -y -loglevel error -f concat -safe 0 -i "$SEG/list.txt" -i audio/mix.wav -map 0:v -map 1:a -c:v copy \
    -c:a aac -b:a 256k -movflags +faststart -shortest "${OUT:-macro-launch}-$f.mp4"
  echo "encoded ${OUT:-macro-launch}-$f.mp4"
done
