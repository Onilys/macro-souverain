"""Build the trailer soundtrack.

Song: Mixkit "Swish Swed" (Arulo), 120 BPM. The excerpt starts on the drop's
downbeat (kick onset measured at 40.0318 s) and runs exactly 28 beats.
UI sounds are synthesized here and each is placed by its measured peak, so the
loudest sample of every click/pop/tick lands exactly on its cue.
"""
import json
import subprocess
import wave

import numpy as np

FF = __import__("os").environ.get("FF", "/root/bin/ffmpeg")
SR = 48000
SONG = "song-swish-swed-arulo.mp3"   # Mixkit 201, "Swish Swed" by Arulo
DOWNBEAT = 40.0318      # kick onset of the drop (measured)
PREROLL = 0.004         # keep the kick's first few ms
rng = np.random.default_rng(7)


def load_stereo(path):
    raw = subprocess.run([FF, "-v", "quiet", "-i", path, "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64)


# ---------- synthesis helpers ----------
def tt(n):
    return np.arange(n) / SR


def env(n, a, tau):
    t = tt(n)
    return np.minimum(1, t / max(a, 1e-5)) * np.exp(-np.maximum(0, t - a) / tau)


def band(x, lo, hi):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    m = (1 / (1 + (lo / np.maximum(f, 1)) ** 4)) * (1 / (1 + (f / hi) ** 4))
    return np.fft.irfft(X * m, len(x))


def sine(f, n, ph=0.0):
    return np.sin(2 * np.pi * f * tt(n) + ph)


def sweep(f0, f1, n):
    t = tt(n)
    f = f0 * (f1 / f0) ** (t / t[-1])
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def noise(n, seed=0):
    return np.random.default_rng(seed).standard_normal(n)


def norm(x):
    return x / (np.abs(x).max() + 1e-12)


def pad(x, n):
    return np.concatenate([x, np.zeros(max(0, n - len(x)))])[:n]


# ---------- the sound palette ----------
def click(seed=0):
    n = int(0.12 * SR)
    down = band(noise(n, seed), 2200, 9000) * env(n, 0.0003, 0.0032)
    down += 0.22 * sine(1150, n) * env(n, 0.0005, 0.010) + 0.28 * sine(185, n) * env(n, 0.0008, 0.016)
    up = np.roll(band(noise(n, seed + 1), 2600, 10000) * env(n, 0.0003, 0.0025), int(0.075 * SR)) * 0.32
    return norm(down + up)


def key(seed=0):
    n = int(0.06 * SR)
    r = np.random.default_rng(100 + seed)
    k = r.uniform(0.85, 1.18)
    y = band(noise(n, 200 + seed), 1500 * k, 6500 * k) * env(n, 0.0004, 0.0038)
    y += 0.3 * sine(310 * k, n) * env(n, 0.0006, 0.010)
    return norm(y) * r.uniform(0.8, 1.0)


def enter():
    n = int(0.12 * SR)
    y = band(noise(n, 31), 1200, 5500) * env(n, 0.0004, 0.005)
    y += 0.7 * sine(135, n) * env(n, 0.001, 0.035) + 0.2 * band(noise(n, 32), 400, 2500) * env(n, 0.001, 0.012)
    return norm(y)


def tick(pitch=1.0):
    n = int(0.09 * SR)
    f = 1760 * pitch
    y = sine(f, n) * env(n, 0.0012, 0.028) + 0.12 * sine(2 * f, n) * env(n, 0.001, 0.012)
    y += 0.25 * band(noise(n, 41), 3000, 9000) * env(n, 0.0002, 0.0015)
    return norm(y)


def pop(pitch=1.0):
    n = int(0.12 * SR)
    y = sweep(420 * pitch, 980 * pitch, n) * env(n, 0.002, 0.034)
    y += 0.18 * band(noise(n, 51), 1500, 6000) * env(n, 0.0003, 0.002)
    return norm(y)


def blip():
    n = int(0.2 * SR)
    y = sine(1318.5, n) * env(n, 0.003, 0.06) + 0.15 * sine(2637, n) * env(n, 0.002, 0.03)
    return norm(y)


def chime():
    n = int(0.75 * SR)
    y = np.zeros(n)
    for f, dt, g in [(1568.0, 0.0, 1.0), (2093.0, 0.055, 0.8)]:
        m = n - int(dt * SR)
        note = sine(f, m) + 0.1 * sine(f * 2.76, m) + 0.05 * sine(f * 5.4, m)
        e = env(m, 0.002, 0.2) * (1 - 0.3 * np.exp(-tt(m) / 0.02))
        y[int(dt * SR):] += g * note * e
    return norm(y)


def swish(dur=0.16, lo=900, hi=5200, seed=61):
    n = int(dur * SR)
    t = tt(n) / dur
    e = np.sin(np.pi * np.minimum(1, t / 0.35) / 2) ** 2 * np.exp(-np.maximum(0, t - 0.35) * 5)
    return norm(band(noise(n, seed), lo, hi) * e)


def swoosh():
    n = int(0.26 * SR)
    t = tt(n) / (n / SR)
    lo = band(noise(n, 71), 350, 1600)
    hi = band(noise(n, 72), 1400, 6000)
    y = lo * (1 - t) + hi * t
    e = np.sin(np.pi * np.minimum(1, t / 0.3) / 2) ** 2 * np.exp(-np.maximum(0, t - 0.3) * 4.5)
    return norm(y * e)


def grab():
    n = int(0.06 * SR)
    y = band(noise(n, 81), 1200, 5200) * env(n, 0.0003, 0.003) + 0.35 * sine(700, n) * env(n, 0.0006, 0.012)
    return norm(y)


def stretch():
    n = int(0.16 * SR)
    y = sweep(520, 610, n) * env(n, 0.02, 0.05) + 0.2 * band(noise(n, 91), 800, 3000) * env(n, 0.01, 0.03)
    return norm(y)


def release():
    n = int(0.16 * SR)
    y = sweep(190, 118, n) * env(n, 0.002, 0.05) + 0.4 * band(noise(n, 95), 2400, 9000) * env(n, 0.0003, 0.0025)
    return norm(y)


def beep(pitch=1.0):
    n = int(0.22 * SR)
    f = 1046.5 * pitch
    y = sine(f, n) * env(n, 0.002, 0.07) + 0.18 * sine(2 * f, n) * env(n, 0.001, 0.03) + 0.08 * sine(3 * f, n) * env(n, 0.001, 0.015)
    return norm(y)


def shot():
    """A punchy, cartoonish snipe: sharp crack, a pitched-down thump and a short tail."""
    n = int(0.42 * SR)
    crack = band(noise(n, 501), 1800, 11000) * env(n, 0.0002, 0.010)
    body = band(noise(n, 502), 250, 1800) * env(n, 0.0004, 0.035)
    thump = sweep(190, 42, n) * env(n, 0.0008, 0.07)
    tail = band(noise(n, 503), 700, 4000) * env(n, 0.004, 0.14)
    return norm(1.0 * crack + 0.7 * body + 0.9 * thump + 0.12 * tail)


def tink(pitch=1.0):
    n = int(0.3 * SR)
    y = sum(g * sine(f * pitch, n) * env(n, 0.0005, tau) for f, g, tau in [(3150, 1, 0.07), (4730, 0.6, 0.05), (6120, 0.35, 0.03)])
    return norm(y)


def boom():
    n = int(1.1 * SR)
    y = 1.0 * sweep(95, 26, n) * env(n, 0.002, 0.32) + 0.9 * band(noise(n, 601), 30, 380) * env(n, 0.003, 0.28)
    y += 0.45 * band(noise(n, 602), 1200, 7000) * env(n, 0.0003, 0.025)
    return norm(y)


def shatter():
    n = int(0.6 * SR)
    r = np.random.default_rng(77)
    y = 0.5 * band(noise(n, 611), 2500, 11000) * env(n, 0.0005, 0.07)
    for _ in range(16):
        off = int(r.uniform(0, 0.28) * SR); f = r.uniform(2400, 7600); m = n - off
        y[off:] += r.uniform(0.25, 0.7) * sine(f, m) * env(m, 0.0004, r.uniform(0.012, 0.04))
    return norm(y)


def hover():
    n = int(0.05 * SR)
    return norm(sine(1240, n) * env(n, 0.001, 0.012))


def tap():
    """A fingertip on glass: a dull, short knock."""
    n = int(0.08 * SR)
    y = band(noise(n, 701), 180, 1800) * env(n, 0.0004, 0.006) + 0.6 * sine(170, n) * env(n, 0.0008, 0.014)
    return norm(y)


# ---------- orchestration: hits and transitions on the song's structure ----------
def impact():
    """The hit on a drop: a sub thump with a short, bright transient."""
    n = int(1.4 * SR)
    y = 1.0 * sweep(78, 34, n) * env(n, 0.001, 0.42) + 0.5 * band(noise(n, 711), 40, 260) * env(n, 0.002, 0.18)
    y += 0.55 * band(noise(n, 712), 900, 6000) * env(n, 0.0004, 0.035) + 0.25 * band(noise(n, 713), 3000, 12000) * env(n, 0.0003, 0.012)
    return norm(y)


def crash(seed=721):
    """A crash cymbal: bright noise with an inharmonic shimmer, long decay."""
    n = int(2.4 * SR)
    r = np.random.default_rng(seed)
    y = band(noise(n, seed), 3200, 15000) * env(n, 0.001, 0.75) + 0.35 * band(noise(n, seed + 1), 1200, 4000) * env(n, 0.001, 0.25)
    for _ in range(10):
        f = r.uniform(3000, 9500)
        y += r.uniform(0.04, 0.1) * sine(f, n, r.uniform(0, 6.28)) * env(n, 0.001, r.uniform(0.3, 0.9))
    return norm(y)


def revcrash():
    """A reversed crash swelling into the hit (its peak is the last sample)."""
    n = int(1.5 * SR)
    y = crash(731)[:n][::-1].copy()
    y *= np.linspace(0.2, 1, n) ** 1.5
    return norm(y)


def riser(dur=2.4):
    """Noise sweeping up with a rising tone; loudest at the very end."""
    n = int(dur * SR)
    t = tt(n) / dur
    X = np.zeros(n)
    hop = 2048
    src = noise(n + hop, 741)
    for i in range(0, n, hop):
        u = i / n
        fc = 350 * (9500 / 350) ** (u ** 1.3)
        seg = band(src[i:i + 2 * hop], fc * 0.55, fc * 1.6)[:min(hop, n - i)]
        X[i:i + len(seg)] = seg
    k = int(0.02 * SR)
    X = np.convolve(X, np.ones(k) / k, mode="same") * 0.15 + X * 0.85   # soften block edges
    tone = 0.35 * sweep(180, 1400, n)
    y = (X + tone) * (0.04 + 0.96 * t ** 2.6)
    y[-int(0.01 * SR):] *= np.linspace(1, 0.85, int(0.01 * SR))
    return norm(y)


def downlift():
    """Noise falling away after a section ends."""
    n = int(1.3 * SR)
    t = tt(n) / (n / SR)
    lo = band(noise(n, 751), 200, 1400)
    hi = band(noise(n, 752), 1800, 9000)
    y = (hi * (1 - t) + lo * t) * env(n, 0.005, 0.45)
    return norm(y)


SYNTH = {
    "click": lambda c: click(int(c["t"] * 1000) % 97),
    "key": lambda c: key(c.get("seed", int(c["t"] * 1000) % 50)),
    "enter": lambda c: enter(),
    "tick": lambda c: tick(c.get("pitch", 1.0)),
    "pop": lambda c: pop(c.get("pitch", 1.0)),
    "blip": lambda c: blip(),
    "chime": lambda c: chime(),
    "swish": lambda c: swish(),
    "swoosh": lambda c: swoosh(),
    "grab": lambda c: grab(),
    "stretch": lambda c: stretch(),
    "release": lambda c: release(),
    "hover": lambda c: hover(),
    "beep": lambda c: beep(c.get("pitch", 1.0)),
    "shot": lambda c: shot(),
    "tink": lambda c: tink(c.get("pitch", 1.0)),
    "boom": lambda c: boom(),
    "shatter": lambda c: shatter(),
    "tap": lambda c: tap(),
    "impact": lambda c: impact(),
    "crash": lambda c: crash(c.get("seed", 721)),
    "revcrash": lambda c: revcrash(),
    "riser": lambda c: riser(c.get("dur", 2.4)),
    "downlift": lambda c: downlift(),
}
LEVEL = {  # per-type bus level (linear, relative to the UI bus)
    "click": 1.0, "key": 0.55, "enter": 0.8, "tick": 0.55, "pop": 0.55, "blip": 0.5, "chime": 0.5,
    "swish": 0.35, "swoosh": 0.4, "grab": 0.8, "stretch": 0.35, "release": 0.5, "hover": 0.35, "beep": 0.55, "shot": 1.9, "tink": 0.4, "boom": 1.6, "shatter": 0.7,
    "tap": 0.5, "impact": 1.25, "crash": 0.42, "revcrash": 0.5, "riser": 0.42, "downlift": 0.4,
}


SONGS = {  # Mixkit Stock Music Free License
    "ambient": ("song-ambient-kodama-night-town.mp3", 11.6186),  # section entry downbeat  # "Kodama Night Town", Alejandro Magaña; section entry downbeat
    "funk": ("song-funk-are-u-ready.mp3", 17.8605),              # "Are U Ready For This?"; accented bar downbeat
}


def limiter(mix, ceil=0.94, rel=0.12):
    """Peak limiter: instant attack (one block of look-ahead), smooth release. Leaves the rest of the mix alone."""
    a = np.abs(mix).max(axis=1)
    blk = 64
    nb = int(np.ceil(len(a) / blk))
    pa = np.pad(a, (0, nb * blk - len(a))).reshape(nb, blk).max(axis=1)
    need = np.minimum(1.0, ceil / np.maximum(pa, 1e-9))
    need = np.minimum(need, np.minimum(np.roll(need, 1), np.roll(need, -1)))
    g = np.empty(nb)
    cur, k = 1.0, np.exp(-blk / (rel * SR))
    for i in range(nb):
        cur = need[i] if need[i] < cur else need[i] + (cur - need[i]) * k
        g[i] = cur
    gs = np.interp(np.arange(len(a)), np.arange(nb) * blk + blk / 2, g)
    return mix * gs[:, None]


def lowpass_tail(seg, dur, f0, f1):
    """Sweep a resonant low-pass from f0 down to f1 over the last `dur` seconds (STFT, overlap-add)."""
    pre = 0.12
    a = max(0, len(seg) - int((dur + pre) * SR))
    x = seg[a:].copy()
    N, H = 2048, 512
    win = np.hanning(N + 1)[:-1]
    freqs = np.fft.rfftfreq(N, 1 / SR)
    out = np.zeros_like(x)
    wsum = np.zeros(len(x))
    for start in range(-N + H, len(x), H):
        idx = np.arange(start, start + N)
        ok = (idx >= 0) & (idx < len(x))
        frame = np.zeros((N, x.shape[1]))
        frame[ok] = x[idx[ok]]
        u = min(1.0, max(0.0, ((start + N / 2) / SR - pre) / dur))
        fc = f0 * (f1 / f0) ** (u ** 1.4)
        mask = 1 / np.sqrt(1 + (freqs / fc) ** 8)
        mask = mask * (1 + 0.7 * np.exp(-((np.log(freqs + 1) - np.log(fc)) / 0.14) ** 2))
        y = np.fft.irfft(np.fft.rfft(frame * win[:, None], axis=0) * mask[:, None], N, axis=0) * win[:, None]
        out[idx[ok]] += y[ok]
        wsum[idx[ok]] += win[ok] ** 2
    out /= np.maximum(wsum, 1e-6)[:, None]
    k = int(pre * SR)
    ramp = np.linspace(0, 1, k)[:, None]
    out[:k] = x[:k] * (1 - ramp) + out[:k] * ramp
    seg = seg.copy()
    seg[a:] = out
    return seg


def main():
    meta = json.load(open("cues.json"))
    dur = meta["duration"]
    n = int(round(dur * SR))

    # Alternate the two songs; each resumes where it left off. Cuts land on bar lines,
    # with a 4 ms declick. The loop end is a cut too: no fade-out.
    songs = {k: tuple(v) for k, v in (meta.get("songs") or SONGS).items()}
    cache = {}
    decoded = {k: cache[f] if f in cache else cache.setdefault(f, load_stereo(f)) for k, (f, _) in songs.items()}
    pos = {k: off for k, (_, off) in songs.items()}
    # One key per entry point, so a cut can jump within a song (e.g. drop → breakdown → second drop).
    # Optional per-entry effects: lpEnd [seconds, from Hz, to Hz] sweeps a low-pass down over the entry's
    # last seconds; gapEnd seconds mutes its tail (the breath before a hit).
    same_song = len(cache) == 1
    parts = []
    for entry in meta["music"]:
        song, bpm, beats = entry[:3]
        opts = entry[3] if len(entry) > 3 else {}
        length = sum(beats) * 60 / bpm
        x = decoded[song]
        a0 = int(round((pos[song] - PREROLL) * SR))
        seg = x[a0:a0 + int(round(length * SR))].copy()
        if not same_song:
            seg /= np.sqrt(np.mean(seg ** 2)) + 1e-9      # match loudness across songs
            seg *= 0.2
        if "lpEnd" in opts:
            seg = lowpass_tail(seg, *opts["lpEnd"])
        d = int(0.004 * SR)
        seg[:d] *= np.linspace(0, 1, d)[:, None]
        seg[-d:] *= np.linspace(1, 0, d)[:, None]
        if "gapEnd" in opts:
            g, f = int(opts["gapEnd"] * SR), int(0.006 * SR)
            seg[-g - f:-g] *= np.linspace(1, 0, f)[:, None]
            seg[-g:] = 0
        parts.append(seg)
        pos[song] += length
    music = np.concatenate(parts)
    if same_song:                                         # cuts of one song keep their relative levels
        music /= np.sqrt(np.mean(music ** 2)) + 1e-9
        music *= 0.2
    music = np.pad(music, ((0, max(0, n - len(music))), (0, 0)))[:n]

    ui = np.zeros(n)
    placed = []
    for c in meta["cues"]:
        y = SYNTH[c["type"]](c) * c["gain"] * LEVEL[c["type"]]
        peak = int(np.argmax(np.abs(y)))                  # measured peak of this sound
        start = int(round(c["t"] * SR)) - peak           # peak lands on the cue (video time)
        for k in (0, -n):                                 # wrap sounds across the loop point
            a, b = start + k, start + k + len(y)
            lo, hi = max(0, a), min(n, b)
            if hi > lo:
                ui[lo:hi] += y[lo - a:hi - a]
        placed.append((c["type"], round(c["t"], 3), peak))

    music_gain, ui_gain, master_db = 1.0, 0.42, -3.0
    mix = (music * music_gain + ui[:, None] * ui_gain) * 10 ** (master_db / 20)
    mix = limiter(mix)                                    # only the hits that would clip get turned down
    peak = np.abs(mix).max()
    if peak > 0.97:
        mix *= 0.97 / peak
    pcm = (np.clip(mix, -1, 1) * 32767).astype("<i2")
    with wave.open("mix.wav", "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    # UI-only stem for level checks
    pcm_ui = (np.clip(ui * ui_gain * 10 ** (master_db / 20), -1, 1) * 32767).astype("<i2")
    with wave.open("ui.wav", "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm_ui.tobytes())
    print(f"mix.wav {n / SR:.3f}s  peak {20 * np.log10(np.abs(mix).max()):.2f} dBFS  ui peak {20 * np.log10(np.abs(ui * ui_gain * 10 ** (master_db / 20)).max()):.2f} dBFS")
    print("placed", len(placed), "cues; e.g.", placed[:4])


if __name__ == "__main__":
    main()
