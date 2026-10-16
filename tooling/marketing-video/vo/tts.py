# Synthesize each script line to its own wav with Kokoro-82M (Apache-2.0): vo/lines/<voice>-<speed>/<id>.wav
# usage: tts.py VOICE SPEED   (a line's own speed in script.json multiplies SPEED)
# Needs `pip install kokoro-onnx soundfile` and the model in $VO_MODELS/kokoro (see README: kokoro-v1.0.onnx, voices-v1.0.bin).
import sys
import json
import os
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

voice, speed = sys.argv[1], float(sys.argv[2])
M = os.path.join(
    os.environ.get("VO_MODELS", os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")), "kokoro"
)
k = Kokoro(os.path.join(M, "kokoro-v1.0.onnx"), os.path.join(M, "voices-v1.0.bin"))
lines = json.load(open(os.path.join(os.path.dirname(__file__), "script.json")))
d = os.path.join(os.path.dirname(__file__), "lines", f"{voice}-{speed:g}")
os.makedirs(d, exist_ok=True)
tot = 0
words = 0
for lid, text, ls in lines:
    a, sr = k.create(text, voice=voice, speed=speed * ls, lang="en-us")
    # trim the model's leading/trailing near-silence to 10 ms of margin so line timing is exact
    env = np.abs(a) > 0.003
    i0 = max(0, int(np.argmax(env)) - int(0.01 * sr))
    i1 = min(len(a), len(a) - int(np.argmax(env[::-1])) + int(0.03 * sr))
    a = a[i0:i1]
    sf.write(os.path.join(d, lid + ".wav"), a, sr, subtype="FLOAT")
    n = len(text.split())
    tot += len(a) / sr
    words += n
    print(f"{lid:4s} {len(a) / sr:5.2f}s {n:2d}w {60 * n / (len(a) / sr):5.0f}wpm  {text}")
print(f"total speech {tot:.1f}s, {words} words, {60 * words / tot:.0f} wpm")
