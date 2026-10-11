// Contact sheet of many beat positions at low resolution: node sweep.mjs out.png cols beat...
let chromium;
try { ({ chromium } = await import("playwright")); } catch { ({ chromium } = await import("/opt/node22/lib/node_modules/playwright/index.mjs")); }
import path from "node:path";
const [, , out, cols, ...beats] = process.argv;
const FMT = process.env.FMT || "45", SCALE = parseFloat(process.env.SCALE || "0.3");
const [W, H] = { "916": [1080, 1920], "45": [1080, 1350], "11": [1440, 1440] }[FMT];
const b = await chromium.launch({ args: ["--force-color-profile=srgb", "--font-render-hinting=none", "--disable-lcd-text"] });
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE });
p.on("pageerror", (e) => console.log("ERR", e.message));
await p.goto("file://" + path.resolve(process.env.PAGE || "launch.html") + "?render=1&fmt=" + FMT); await p.evaluate(() => window.ready);
const shots = [];
for (const s of beats.map(Number)) { const t = await p.evaluate((x) => window.B(x), s); await p.evaluate((tt) => window.seek(tt), t); shots.push([s, (await p.screenshot()).toString("base64")]); }
const c = parseInt(cols, 10), w = Math.round(W * SCALE), h = Math.round(H * SCALE);
const html = `<body style="margin:0;background:#fff;display:grid;grid-template-columns:repeat(${c},${w}px);gap:6px;font:12px sans-serif">${shots.map(([s, d]) => `<div style="position:relative"><img src="data:image/png;base64,${d}" style="display:block;width:${w}px;height:${h}px"><span style="position:absolute;left:4px;top:2px;background:#fff8;padding:0 3px">${s}</span></div>`).join("")}</body>`;
const q = await b.newPage({ viewport: { width: c * (w + 6), height: 100 } });
await q.setContent(html); await q.screenshot({ path: out, fullPage: true });
await b.close();
