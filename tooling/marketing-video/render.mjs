// Render the trailer with Playwright.
//   node render.mjs stills <outDir> <beat> [<beat> ...]   one PNG per beat position
//   node render.mjs frames <outDir> [workers]             60 fps x 4 subframes (for tmix)
//   node render.mjs cues <out.json>                       export sound cues
let chromium; // local `npm i playwright`, else the global install in this container
try { ({ chromium } = await import("playwright")); } catch { ({ chromium } = await import("/opt/node22/lib/node_modules/playwright/index.mjs")); }
import fs from "node:fs";
import path from "node:path";

const HTML = "file://" + path.resolve(process.env.PAGE || "trailer.html") + "?render=1" + (process.env.VIBE ? "&vibe=" + process.env.VIBE : "") + (process.env.FMT ? "&fmt=" + process.env.FMT : "");
const [VW, VH] = { "916": [1080, 1920], "45": [1080, 1350], "11": [1440, 1440], "169": [1920, 1080] }[process.env.FMT || "11"];
const FPS = 60, SUB = 4, SHUTTER = 0.5; // 180° shutter, 4 samples per frame

async function openPage(browser) {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error("pageerror:", e.message));
  page.on("console", (m) => { if (m.type() === "error") console.error("console:", m.text()); });
  await page.goto(HTML);
  await page.evaluate(() => window.ready);
  const cdp = await ctx.newCDPSession(page);
  return { page, cdp };
}

async function shot(p, t, file) {
  await p.page.evaluate((tt) => window.seek(tt), t);
  const { data } = await p.cdp.send("Page.captureScreenshot", {
    format: "png", clip: { x: 0, y: 0, width: VW, height: VH, scale: 1 }, optimizeForSpeed: true,
  });
  fs.writeFileSync(file, Buffer.from(data, "base64"));
}

const [, , mode, out, ...rest] = process.argv;
const browser = await chromium.launch({ args: ["--force-color-profile=srgb", "--font-render-hinting=none", "--disable-lcd-text"] });
try {
  if (mode === "cues") {
    const p = await openPage(browser);
    const cues = await p.page.evaluate(() => ({ duration: window.DURATION, music: window.MUSIC, cues: window.CUES, songs: window.SONGS }));
    fs.writeFileSync(out, JSON.stringify(cues, null, 1));
    console.log("cues:", cues.cues.length);
  } else if (mode === "stills") {
    fs.mkdirSync(out, { recursive: true });
    const p = await openPage(browser);
        for (const b of rest) {
      const t = await p.page.evaluate((x) => window.B(x), parseFloat(b));
      await shot(p, t, path.join(out, `b${parseFloat(b).toFixed(2).padStart(5, "0")}.png`));
    }
    console.log("stills:", rest.length);
  } else if (mode === "segments") {
    // Like "frames", but each worker pipes its subframes straight into its own ffmpeg, which blends
    // every 4 subframes (tmix) and encodes one H.264 segment; nothing touches the disk but the segments.
    const { spawn } = await import("node:child_process");
    fs.mkdirSync(out, { recursive: true });
    const workers = parseInt(rest[0] || "4", 10);
    const probe = await openPage(browser);
    const dur = process.env.LIMIT ? parseFloat(process.env.LIMIT) : await probe.page.evaluate(() => window.DURATION);
    await probe.page.context().close();
    const frames = Math.round(dur * FPS), t0 = Date.now();
    let done = 0;
    await Promise.all(Array.from({ length: workers }, async (_, w) => {
      const p = await openPage(browser);
      const a = Math.floor((w * frames) / workers), b = Math.floor(((w + 1) * frames) / workers);
      const ff = spawn(process.env.FF || "ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS * SUB), "-c:v", "png", "-i", "-",
        "-vf", `tmix=frames=${SUB}:weights='${Array(SUB).fill(1).join(" ")}',select='eq(mod(n\\,${SUB})\\,${SUB - 1})',setpts=N/(${FPS}*TB),scale=out_color_matrix=bt709:out_range=tv`,
        "-r", String(FPS), "-c:v", "libx264", "-preset", "slow", "-tune", "animation", "-profile:v", "high", "-crf", "15", "-pix_fmt", "yuv420p", "-x264-params", "threads=2",
        "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", path.join(out, `seg${String(w).padStart(2, "0")}.mp4`)], { stdio: ["pipe", "inherit", "inherit"] });
      const closed = new Promise((res, rej) => ff.on("close", (c) => (c === 0 ? res() : rej(new Error("ffmpeg exit " + c)))));
      for (let f = a; f < b; f++) {
        for (let k = 0; k < SUB; k++) {
          const t = f / FPS + ((k - (SUB - 1) / 2) * (SHUTTER / FPS)) / SUB;
          await p.page.evaluate((tt) => window.seek(tt), t);
          const { data } = await p.cdp.send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: VW, height: VH, scale: 1 }, optimizeForSpeed: true });
          if (!ff.stdin.write(Buffer.from(data, "base64"))) await new Promise((r) => ff.stdin.once("drain", r));
          done++;
        }
        if (w === 0 && f % 30 === 0) {
          const el = (Date.now() - t0) / 1000;
          console.log(`${done}/${frames * SUB}  ${el.toFixed(0)}s  eta ${((el / done) * (frames * SUB - done)).toFixed(0)}s`);
        }
      }
      ff.stdin.end();
      await closed;
    }));
    console.log("segments:", workers, "frames:", frames, "in", ((Date.now() - t0) / 1000).toFixed(0), "s");
  } else if (mode === "frames") {
    fs.mkdirSync(out, { recursive: true });
    const workers = parseInt(rest[0] || "4", 10);
    const probe = await openPage(browser);
    const dur = await probe.page.evaluate(() => window.DURATION);
    await probe.page.context().close();
    const frames = Math.round(dur * FPS);
    const total = frames * SUB;
    const jobs = [];
    const t0 = Date.now();
    let done = 0;
    for (let w = 0; w < workers; w++) {
      jobs.push((async () => {
        const p = await openPage(browser);
        const a = Math.floor((w * frames) / workers), b = Math.floor(((w + 1) * frames) / workers);
        for (let f = a; f < b; f++) {
          for (let k = 0; k < SUB; k++) {
            const t = f / FPS + ((k - (SUB - 1) / 2) * (SHUTTER / FPS)) / SUB;
            await shot(p, t, path.join(out, `${String(f * SUB + k).padStart(5, "0")}.png`));
            done++;
          }
          if (w === 0 && f % 20 === 0) {
            const el = (Date.now() - t0) / 1000;
            console.log(`${done}/${total}  ${el.toFixed(0)}s  eta ${((el / done) * (total - done)).toFixed(0)}s`);
          }
        }
      })());
    }
    await Promise.all(jobs);
    console.log("frames:", total, "in", ((Date.now() - t0) / 1000).toFixed(0), "s");
  }
} finally {
  await browser.close();
}
