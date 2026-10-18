"""Render a pacing video for recording the explainer's voiceover yourself, and the script as text.

The current line is shown large with the word to say highlighted at the moment the synthetic voice says it; the
next line waits underneath, with a countdown in the pauses. The finished explainer plays in the corner and its
soundtrack is the audio, so you can follow along in headphones.

    python vo/pacing.py OUT_DIR [explainer.mp4]     (run from the tooling folder; needs Pillow and ffmpeg)

Writes OUT_DIR/pacing.mp4 and OUT_DIR/script.txt.
"""

import json
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FF = os.environ.get("FF", "ffmpeg")
W, H, FPS = 1920, 1080, 30
BG, INK, MUTED, FAINT, HI = (245, 241, 232), (29, 28, 26), (150, 145, 136), (205, 199, 188), (178, 90, 58)
SANS = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
BIG, SMALL = ImageFont.truetype(BOLD, 68), ImageFont.truetype(SANS, 40)
LABEL, MONO = (
    ImageFont.truetype(SANS, 28),
    ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 30),
)
TEXT_W, TEXT_X, LINE_H = 1560, 180, 96

js = open(os.path.join(ROOT, "explainer-vo.js")).read()
VO = json.loads(js[js.index("{") : js.rstrip().rindex("}") + 1])
T = VO["T"]
LINES = sorted(VO["lines"].items(), key=lambda kv: kv[1]["t0"])


def layout(words, font, width):
    """Place words in rows: [(word, x, row)]."""
    out, x, row, space = [], 0, 0, font.getlength(" ")
    for w in words:
        wl = font.getlength(w)
        if x and x + wl > width:
            x, row = 0, row + 1
        out.append((w, x, row))
        x += wl + space
    return out


LAY = [layout([w[0] for w in v["words"]], BIG, TEXT_W) for _, v in LINES]


def mmss(t):
    return f"{int(t // 60)}:{t % 60:04.1f}"


def frame(t):
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    # which line: the one being spoken, else the next one
    cur = next((i for i, (_, v) in enumerate(LINES) if t < v["t1"] + 0.15), None)
    d.text((70, 56), mmss(t), font=MONO, fill=INK)
    d.text(
        (70, 100), "Read the highlighted word. Headphones on: the finished video is the audio.", font=LABEL, fill=MUTED
    )
    if cur is None:
        d.text((TEXT_X, 500), "Done. Thanks!", font=BIG, fill=INK)
    else:
        lid, v = LINES[cur]
        words = v["words"]
        speaking = t >= v["t0"] - 0.02
        rows = LAY[cur][-1][2] + 1
        y0 = 560 - rows * LINE_H // 2
        if not speaking:
            wait = v["t0"] - t
            d.text((TEXT_X, y0 - 90), f"next line in {wait:.1f} s", font=LABEL, fill=HI)
            frac = min(1.0, wait / 3.0)
            d.rounded_rectangle((TEXT_X, y0 - 44, TEXT_X + int(420 * frac), y0 - 36), 4, fill=HI)
        for k, (w, x, row) in enumerate(LAY[cur]):
            nxt = words[k + 1][1] if k + 1 < len(words) else v["t1"] + 0.15
            y = y0 + row * LINE_H
            if speaking and words[k][1] - 0.02 <= t < nxt:
                pad = 12
                d.rounded_rectangle((TEXT_X + x - pad, y - 6, TEXT_X + x + BIG.getlength(w) + pad, y + 82), 14, fill=HI)
                d.text((TEXT_X + x, y), w, font=BIG, fill=(255, 255, 255))
            else:
                done = speaking and t >= nxt
                d.text((TEXT_X + x, y), w, font=BIG, fill=INK if done else (MUTED if speaking else FAINT))
        d.text(
            (TEXT_X, 770),
            f"line {cur + 1} of {len(LINES)}  ·  {mmss(v['t0'])} – {mmss(v['t1'])}",
            font=LABEL,
            fill=MUTED,
        )
        if cur + 1 < len(LINES):
            n = LINES[cur + 1][1]
            gap = n["t0"] - v["t1"]
            d.text((TEXT_X, 812), f"then, after a {gap:.1f} s pause:", font=LABEL, fill=MUTED)
            for w, x, row in layout([w[0] for w in n["words"]], SMALL, TEXT_W):
                d.text((TEXT_X + x, 852 + row * 50), w, font=SMALL, fill=MUTED)
    # timeline with a mark per line
    y = 1010
    d.rounded_rectangle((70, y, W - 70, y + 8), 4, fill=FAINT)
    for _, v in LINES:
        a, b = 70 + (W - 140) * v["t0"] / T, 70 + (W - 140) * v["t1"] / T
        d.rectangle((a, y, b, y + 8), fill=MUTED)
    px = 70 + (W - 140) * t / T
    d.ellipse((px - 11, y - 7, px + 11, y + 15), fill=HI)
    return im


def script_txt():
    out = [
        "HOW MACRO WORKS: VOICEOVER SCRIPT (explainer v2, 81.6 s)",
        "",
        "Each line starts at the time shown and should end near the second time. Pauses between lines are marked;",
        "the animation is timed to these starts. Slightly faster is fine, slower will run into the next beat.",
        'Say numbers in words: "twenty-seven", "eighty-four dollars", "forty", "fifty milliseconds",',
        '"macro dot com". "MCP" is spelled out: M-C-P. "CRM" is C-R-M.',
        "",
    ]
    prev = 0.0
    for i, (lid, v) in enumerate(LINES):
        gap = v["t0"] - prev
        if i and gap >= 0.3:
            out.append(f"        (pause {gap:.1f} s)")
        out.append(f"{i + 1:2d}. [{mmss(v['t0'])} – {mmss(v['t1'])}, {v['t1'] - v['t0']:.1f} s]  {v['text']}")
        prev = v["t1"]
    out += ["", f"        (music to the end, {T - prev:.1f} s)", ""]
    return "\n".join(out)


def main():
    out_dir = sys.argv[1]
    video = sys.argv[2] if len(sys.argv) > 2 else None
    os.makedirs(out_dir, exist_ok=True)
    open(os.path.join(out_dir, "script.txt"), "w").write(script_txt())
    n = int(round(T * FPS))
    cmd = [
        FF,
        "-y",
        "-loglevel",
        "error",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-s",
        f"{W}x{H}",
        "-r",
        str(FPS),
        "-i",
        "-",
    ]
    if video:
        cmd += [
            "-i",
            video,
            "-filter_complex",
            "[1:v]fps=30,scale=480:-2,pad=iw+4:ih+4:2:2:color=0xc9c3b6[p];[0:v][p]overlay=W-w-70:50[v]",
            "-map",
            "[v]",
            "-map",
            "1:a",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
        ]
    cmd += [
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-t",
        f"{T}",
        os.path.join(out_dir, "pacing.mp4"),
    ]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for i in range(n):
        p.stdin.write(frame(i / FPS).tobytes())
    p.stdin.close()
    p.wait()
    print(f"{out_dir}/pacing.mp4 ({n} frames), {out_dir}/script.txt")


if __name__ == "__main__":
    main()
