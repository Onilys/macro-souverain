#!/usr/bin/env bash
# The explainer (explainer.html): 16:9, about 80 s, led by a voiceover.
#   1. vo/tts.py        synthesizes each line of vo/script.json (Kokoro-82M), once per voice and speed
#   2. vo/build_vo.py   places the lines at vo/plan.json's starts, times every word (faster-whisper) and writes
#                       explainer-vo.js (the scene's clock), explainer.srt (captions) and audio/vo.wav
#   3. the scene's UI cues → audio/emix.py mixes voice, music bed and cues → audio/explainer-mix.wav
#   4. render (60 fps, 4-subframe motion blur) and mux
#   PY=/path/to/venv/python VO_MODELS=/path/to/models FF=/path/to/ffmpeg WORKERS=4 SEG=/tmp/x ./ebuild.sh
# Retiming a line: change its start in vo/plan.json and rerun; the scene follows the words.
set -euo pipefail
cd "$(dirname "$0")"
FF=${FF:-ffmpeg}; PY=${PY:-python3}; WORKERS=${WORKERS:-4}; SEG=${SEG:-/tmp/macro-explainer}; OUT=${OUT:-macro-explainer}
read -r VOICE SPEED < <(python3 -c 'import json; p = json.load(open("vo/plan.json")); print(p["voice"], "%g" % p["speed"])')
[ -d "vo/lines/$VOICE-$SPEED" ] || "$PY" vo/tts.py "$VOICE" "$SPEED"
"$PY" vo/build_vo.py
PAGE=explainer.html FMT=169 node render.mjs cues audio/explainer-cues.json
(cd audio && FF="$FF" python3 emix.py)
rm -rf "$SEG"; PAGE=explainer.html FMT=169 FF="$FF" node render.mjs segments "$SEG" "$WORKERS"
(for s in "$SEG"/seg*.mp4; do echo "file '$s'"; done) > "$SEG/list.txt"
"$FF" -y -loglevel error -f concat -safe 0 -i "$SEG/list.txt" -i audio/explainer-mix.wav -map 0:v -map 1:a -c:v copy \
  -c:a aac -b:a 256k -movflags +faststart -shortest "$OUT-169.mp4"
echo "encoded $OUT-169.mp4"
