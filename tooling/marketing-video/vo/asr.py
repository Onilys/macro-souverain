# Transcribe VO wavs with faster-whisper (small.en) and print words with timings: an intelligibility check
# for synthetic speech, and the word clock that the scene and captions are timed to.
# usage: asr.py a.wav [b.wav …]   (needs `pip install faster-whisper` and $VO_MODELS/whisper-small.en)
import sys
import os
from faster_whisper import WhisperModel

M = os.environ.get("VO_MODELS", os.path.join(os.path.dirname(os.path.abspath(__file__)), "models"))
m = WhisperModel(os.path.join(M, "whisper-small.en"), device="cpu", compute_type="int8")
for f in sys.argv[1:]:
    segs, info = m.transcribe(
        f, language="en", beam_size=5, word_timestamps=True, vad_filter=False, condition_on_previous_text=False
    )
    words = [
        (w.word.strip(), round(w.start, 3), round(w.end, 3), round(w.probability, 3)) for s in segs for w in s.words
    ]
    print(f, "|", " ".join(w[0] for w in words))
    low = [w for w in words if w[3] < 0.6]
    if low:
        print("   low-confidence:", low)
