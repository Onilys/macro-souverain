#!/usr/bin/env bash
# v3 (flow.html): every cut × opener × format. After the opener (beat 9 = 5.4 s) the film is identical for every
# opener, so each cut renders that tail once per format and each opener only renders its first 5.4 s; the pieces are
# joined without re-encoding and muxed with that opener's own mix.
#   CUTS="full 30 15" HOOKS="notion slack replace" FMTS="45 916 11" FF=/path/to/ffmpeg WORKERS=5 SEG=/tmp/x ./fbuild.sh
set -euo pipefail
cd "$(dirname "$0")"
FF=${FF:-ffmpeg}; WORKERS=${WORKERS:-5}; SEG=${SEG:-/tmp/macro-flow}; SPLIT=5.4; OUT=${OUT:-macro-flow}
mkdir -p "$SEG"
for cut in ${CUTS:-full 30 15}; do
  for h in ${HOOKS:-notion slack replace}; do
    if [ ! -f "audio/mix-$cut-$h.wav" ]; then
      PAGE=flow.html QS="&cut=$cut&hook=$h" FMT=45 node render.mjs cues audio/cues.json
      (cd audio && FF="$FF" python3 mix.py && cp mix.wav "mix-$cut-$h.wav")
    fi
  done
done
for f in ${FMTS:-45 916 11}; do
  for cut in ${CUTS:-full 30 15}; do
    tail="$SEG/$cut-$f-tail"
    if [ ! -f "$tail/done" ]; then
      rm -rf "$tail"; FROM=$SPLIT PAGE=flow.html QS="&cut=$cut" FMT=$f FF="$FF" node render.mjs segments "$tail" "$WORKERS"; touch "$tail/done"
    fi
    for h in ${HOOKS:-notion slack replace}; do
      head="$SEG/$cut-$f-$h-head"
      if [ ! -f "$head/done" ]; then
        rm -rf "$head"; TO=$SPLIT PAGE=flow.html QS="&cut=$cut&hook=$h" FMT=$f FF="$FF" node render.mjs segments "$head" "$WORKERS"; touch "$head/done"
      fi
      (for s in "$head"/seg*.mp4 "$tail"/seg*.mp4; do echo "file '$s'"; done) > "$SEG/list.txt"
      "$FF" -y -loglevel error -f concat -safe 0 -i "$SEG/list.txt" -i "audio/mix-$cut-$h.wav" -map 0:v -map 1:a -c:v copy \
        -c:a aac -b:a 256k -movflags +faststart -shortest "$OUT-$cut-$h-$f.mp4"
      echo "encoded $OUT-$cut-$h-$f.mp4"
    done
  done
done
