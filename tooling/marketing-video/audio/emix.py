"""Mix the explainer's soundtrack. The voiceover leads; the music bed and a few UI sounds sit well under it.

Inputs (run from audio/):
  explainer-cues.json   `PAGE=explainer.html FMT=169 node render.mjs cues audio/explainer-cues.json`
                        (duration, the music plan as [song s, film s, seconds, options], the UI cues)
  vo.wav                the placed voiceover (vo/build_vo.py), and ../explainer-vo.js for its line times
Output: explainer-mix.wav (48 kHz stereo, 16-bit) at about -14 LUFS integrated with true peaks under -1 dBTP,
plus stems (explainer-vo.wav, explainer-music.wav, explainer-ui.wav) for level checks.

Levels: each voice line is matched to the same loudness; the music sits about 18 dB under the voice while it
speaks and comes up a little in the pauses and on the end card; its presence band is dipped to leave room for
speech.
"""

import json
import os
import wave

import numpy as np
from scipy.io import wavfile
from scipy.signal import lfilter

from mix import LEVEL, SR, SYNTH, limiter, load_stereo

VO_LUFS = -16.0  # each line, before the master gain
MUSIC_OPEN = -24.0  # the bed with no voice over it (integrated, before ducking)
DUCK_DB = 8.0  # how far the bed drops under the voice
END_LIFT_DB = 4.0  # the bed comes up this much once the voice is done
TARGET = -14.0  # master, integrated (YouTube's reference)
CEIL_DB = -2.3  # limiter ceiling (sample peak); true peak is checked with ffmpeg after


# ---------- loudness (ITU-R BS.1770 / EBU R128) ----------
def kweight(x):
    b1, a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585]
    b2, a2 = [1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621]
    return lfilter(b2, a2, lfilter(b1, a1, x, axis=0), axis=0)


def lufs(x):
    """Integrated loudness with the absolute (-70) and relative (-10 LU) gates."""
    x = x if x.ndim == 2 else x[:, None]
    y = kweight(x)
    blk, hop = int(0.4 * SR), int(0.1 * SR)
    if len(y) < blk:
        return -70.0
    ms = np.array([np.sum(np.mean(y[i : i + blk] ** 2, axis=0)) for i in range(0, len(y) - blk + 1, hop)])
    ld = -0.691 + 10 * np.log10(ms + 1e-12)
    g = ms[ld > -70]
    if not len(g):
        return -70.0
    rel = -0.691 + 10 * np.log10(np.mean(g)) - 10
    g = ms[(ld > -70) & (ld > rel)]
    return float(-0.691 + 10 * np.log10(np.mean(g) + 1e-12))


def short_term(x, at, win=3.0):
    a, b = int(max(0, at - win / 2) * SR), int((at + win / 2) * SR)
    return lufs(x[a:b])


# ---------- filters ----------
def peaking(x, f0, gain_db, q):
    A = 10 ** (gain_db / 40)
    w = 2 * np.pi * f0 / SR
    al = np.sin(w) / (2 * q)
    b = [1 + al * A, -2 * np.cos(w), 1 - al * A]
    a = [1 + al / A, -2 * np.cos(w), 1 - al / A]
    return lfilter(np.array(b) / a[0], np.array(a) / a[0], x, axis=0)


def onepole(x, up, down):
    """Smooth a control signal (100 Hz) with separate attack and release times (s)."""
    ku, kd = np.exp(-0.01 / up), np.exp(-0.01 / down)
    y = np.empty_like(x)
    c = x[0]
    for i, v in enumerate(x):
        k = ku if v > c else kd
        c = v + (c - v) * k
        y[i] = c
    return y


def write16(path, x):
    x = x if x.ndim == 2 else x[:, None]
    with wave.open(path, "wb") as w:
        w.setnchannels(x.shape[1])
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())


def main():
    meta = json.load(open("explainer-cues.json"))
    dur = meta["duration"]
    n = int(round(dur * SR))
    js = open(os.path.join("..", "explainer-vo.js")).read()
    lines = json.loads(js[js.index("{") : js.rstrip().rindex("}") + 1])["lines"]

    # ----- voice: every line at the same loudness -----
    import warnings

    warnings.simplefilter("ignore", wavfile.WavFileWarning)
    sr, vo = wavfile.read("vo.wav")
    assert sr == SR
    vo = np.pad(vo.astype(np.float64), (0, max(0, n - len(vo))))[:n]
    for k, v in lines.items():
        a, b = int(v["t0"] * SR), int(v["t1"] * SR) + int(0.05 * SR)
        vo[a:b] *= 10 ** ((VO_LUFS - lufs(vo[a:b])) / 20)

    # ----- music: the planned excerpts of the song, declicked at every join -----
    song_file = next(iter(meta["songs"].values()))[0]
    song = load_stereo(song_file)
    music = np.zeros((n, 2))
    for s0, f0, length, opt in meta["music"]:
        a = int(round(s0 * SR))
        m = int(round(length * SR))
        o = int(round(f0 * SR))
        seg = song[a : a + m].copy()
        d = int(0.004 * SR)
        seg[:d] *= np.linspace(0, 1, d)[:, None]
        seg[-d:] *= np.linspace(1, 0, d)[:, None]
        if opt.get("fadeIn"):
            k = int(opt["fadeIn"] * SR)
            seg[:k] *= (np.linspace(0, 1, k) ** 2)[:, None]
        if opt.get("fadeOut"):
            k = int(opt["fadeOut"] * SR)
            seg[-k:] *= (np.linspace(1, 0, k) ** 1.6)[:, None]
        music[o : o + len(seg)] += seg[: max(0, min(len(seg), n - o))]
    # the opening (the song's breakdown) is far quieter than the drops: bring it partway up
    first = meta["music"][1][1] if len(meta["music"]) > 1 else dur
    drop = 14.4
    gap_db = lufs(music[int(drop * SR) : int(first * SR)]) - lufs(music[: int(drop * SR)])
    lift = 10 ** (max(0.0, gap_db - 5.0) / 20)
    ramp = np.ones(n)
    k0, k1 = int((drop - 0.25) * SR), int(drop * SR)
    ramp[:k0] = lift
    ramp[k0:k1] = np.linspace(lift, 1, k1 - k0)
    music *= ramp[:, None]
    music = peaking(music, 2400, -4.0, 0.8)  # leave the speech band to the voice
    music *= 10 ** ((MUSIC_OPEN - lufs(music)) / 20)

    # ----- ducking: follow the voice (10 ms control rate, a little look-ahead) -----
    hop = SR // 100
    nb = n // hop
    rms = np.sqrt(np.mean(vo[: nb * hop].reshape(nb, hop) ** 2, axis=1) + 1e-12)
    db = 20 * np.log10(rms)
    pres = np.clip((db + 52) / 14, 0, 1)
    pres = np.concatenate([pres[12:], np.zeros(12)])  # start ducking 120 ms before the voice
    pres = onepole(pres, 0.07, 0.55)
    last = max(v["t1"] for v in lines.values())
    endlift = np.clip((np.arange(nb) * 0.01 - last - 0.3) / 1.2, 0, 1)
    gdb = -DUCK_DB * pres + END_LIFT_DB * endlift
    g = np.interp(np.arange(n), np.arange(nb) * hop + hop / 2, 10 ** (gdb / 20))
    music *= g[:, None]

    # ----- UI sounds: synthesized, each placed by its own peak -----
    ui = np.zeros(n)
    for c in meta["cues"]:
        y = SYNTH[c["type"]](c) * c["gain"] * LEVEL[c["type"]]
        start = int(round(c["t"] * SR)) - int(np.argmax(np.abs(y)))
        lo, hi = max(0, start), min(n, start + len(y))
        if hi > lo:
            ui[lo:hi] += y[lo - start : hi - start]
    ui *= 10 ** (-17 / 20) / (np.abs(ui).max() + 1e-9)  # the loudest UI sound peaks 17 dB under full scale

    # ----- master -----
    mix = music + ui[:, None] + vo[:, None]
    mix *= 10 ** ((TARGET - lufs(mix)) / 20)
    gain = 10 ** ((TARGET - lufs(music + ui[:, None] + vo[:, None])) / 20)
    mix = limiter(mix, ceil=10 ** (CEIL_DB / 20))
    write16("explainer-mix.wav", mix)
    write16("explainer-vo.wav", vo * gain)
    write16("explainer-music.wav", music * gain)
    write16("explainer-ui.wav", ui * gain)

    # ----- report -----
    v = vo * gain
    m = music * gain
    spoken = [(x["t0"] + x["t1"]) / 2 for x in lines.values() if x["t1"] - x["t0"] > 3]
    under = np.mean([short_term(m, t) for t in spoken])
    print(
        f"mix {lufs(mix):.1f} LUFS, peak {20 * np.log10(np.abs(mix).max()):.2f} dBFS | voice {lufs(v):.1f} | "
        f"music {lufs(m):.1f} overall, {under:.1f} under the voice, {short_term(m, dur - 3.5):.1f} on the end card | "
        f"ui {lufs(ui * gain):.1f} | opening lift {20 * np.log10(lift):.1f} dB"
    )


if __name__ == "__main__":
    main()
