import machineSource from '../core/machine.js?raw';
import { evaluate, layout } from '../core/model.js';
import { validateProject } from '../core/project';
import playerSource from '../runtime/player.js?raw';
import { Renderer } from './renderer.js';
import { zip } from './zip.js';

const blob = (canvas, type) =>
  new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(Error('Encoding failed'))),
      type,
      0.96
    )
  );
function bounds(frame) {
  const { state: s, poses } = frame,
    { yaw, pitch } = s.camera;
  const right = [Math.cos(yaw), 0, -Math.sin(yaw)],
    up = [
      -Math.sin(yaw) * Math.sin(pitch),
      Math.cos(pitch),
      -Math.cos(yaw) * Math.sin(pitch),
    ];
  let extent = 0;
  for (const o of poses) {
    const [a, b, c] = o.rotation.map((v) => (v * Math.PI) / 180);
    for (const sx of [-1, 1])
      for (const sy of [-1, 1])
        for (const sz of [-1, 1]) {
          let [x, y, z] = o.scale.map((v, i) => v * 0.5 * [sx, sy, sz][i]);
          [y, z] = [
            Math.cos(a) * y - Math.sin(a) * z,
            Math.sin(a) * y + Math.cos(a) * z,
          ];
          [x, z] = [
            Math.cos(b) * x + Math.sin(b) * z,
            -Math.sin(b) * x + Math.cos(b) * z,
          ];
          [x, y] = [
            Math.cos(c) * x - Math.sin(c) * y,
            Math.sin(c) * x + Math.cos(c) * y,
          ];
          const p = [x + o.position[0], y + o.position[1], z + o.position[2]];
          extent = Math.max(
            extent,
            Math.abs(p.reduce((n, v, i) => n + v * right[i], 0)),
            Math.abs(p.reduce((n, v, i) => n + v * up[i], 0))
          );
        }
  }
  return 2 * (extent + 0.12 + s.surface.blend * 0.25 + s.eyes.radius);
}
export async function bake(
  project,
  format,
  { signal, onProgress = () => {}, fit = true } = {}
) {
  const p = validateProject(project),
    plan = layout(p),
    atlas = document.createElement('canvas'),
    canvas = document.createElement('canvas'),
    cell = document.createElement('canvas');
  atlas.width = plan.width;
  atlas.height = plan.height;
  cell.width = plan.cellWidth;
  cell.height = plan.cellHeight;
  const ctx = atlas.getContext('2d'),
    cx = cell.getContext('2d', { willReadFrequently: true });
  let renderer;
  const zoom = fit
    ? Math.max(
        p.base.camera.zoom,
        ...plan.frames.map((f) => bounds(evaluate(p, f.pose)))
      )
    : null;
  try {
    renderer = new Renderer(canvas);
    let clipped = 0;
    for (let i = 0; i < plan.frames.length; i++) {
      signal?.throwIfAborted();
      const f = plan.frames[i],
        render = evaluate(p, f.pose);
      render.state.size = plan.cellWidth;
      render.state.antialias = 4;
      render.state.transparent = true;
      if (zoom) render.state.camera.zoom = zoom;
      renderer.draw(render.state, render.poses);
      if (renderer.gl.isContextLost() || renderer.gl.getError() !== 0)
        throw Error(
          'Rendering failed. Try again after closing other 3D previews.'
        );
      cx.clearRect(0, 0, cell.width, cell.height);
      cx.drawImage(canvas, 0, (cell.height - cell.width) / 2);
      const data = cx.getImageData(0, 0, cell.width, cell.height).data;
      let occupied = false,
        touches = false;
      for (let j = 3; j < data.length; j += 4)
        if (data[j]) {
          occupied = true;
          break;
        }
      for (let x = 0; x < cell.width; x++)
        if (
          data[x * 4 + 3] ||
          data[((cell.height - 1) * cell.width + x) * 4 + 3]
        )
          touches = true;
      for (let y = 0; y < cell.height; y++)
        if (
          data[y * cell.width * 4 + 3] ||
          data[(y * cell.width + cell.width - 1) * 4 + 3]
        )
          touches = true;
      if (!occupied)
        throw Error('An exported frame is empty. Check the rig and camera.');
      if (touches) clipped++;
      ctx.drawImage(cell, f.col * cell.width, f.row * cell.height);
      onProgress(
        (i + 1) / plan.frames.length,
        `${f.id} · ${i + 1} / ${plan.frames.length}`
      );
      await new Promise((r) => setTimeout(r, 0));
    }
    signal?.throwIfAborted();
    if (clipped)
      throw Error(
        `${clipped} frames touch the edge. Enable Fit every pose or increase camera zoom.`
      );
    const png = await blob(atlas, 'image/png'),
      webp = await blob(atlas, 'image/webp');
    if (webp.type !== 'image/webp') throw Error('WebP encoding unavailable');
    signal?.throwIfAborted();
    const sheet = {
      src: 'mascot.webp',
      fallback: 'mascot.png',
      width: atlas.width,
      height: atlas.height,
      bytes: webp.size,
      pngBytes: png.size,
    };
    const looks = plan.frames
      .filter((f) => f.id === 'look')
      .map((f) => ({
        x: f.col * cell.width,
        y: f.row * cell.height,
        w: cell.width,
        h: cell.height,
        angle: f.index * 45,
      }));
    const manifest = {
      version: 2,
      name: p.name,
      format,
      width: cell.width,
      height: cell.height,
      columns: 8,
      rows: atlas.height / cell.height,
      sheet,
      clips: plan.clips,
      looks,
      cameraZoom: zoom ?? p.base.camera.zoom,
    };
    const player = playerSource.replace('../core/machine.js', './machine.js');
    const html = `<!doctype html><meta charset="utf-8"><title>Mascot player</title><canvas id="pet" aria-label="Mascot"></canvas><div id="states"></div><p id="error"></p><script type="module">import{StateMachinePlayer}from'./player.js';try{const player=await new StateMachinePlayer(document.querySelector('#pet')).load('./manifest.json',{initial:'idle'});for(const id of ['logo','idle','smile','failure','confused','thinking',...Array.from({length:8},(_,i)=>'look:'+i)]){const b=document.createElement('button');b.textContent=id;b.onclick=()=>player.request(id);document.querySelector('#states').append(b);}const blink=document.createElement('button');blink.textContent='Blink';blink.onclick=()=>player.blink();document.querySelector('#states').append(blink);window.addEventListener('pagehide',()=>player.destroy());}catch(e){document.querySelector('#error').textContent=e.message;}</script>`;
    const json = JSON.stringify(manifest, null, 2),
      projectJSON = JSON.stringify(p, null, 2),
      archive = await zip({
        'mascot.png': png,
        'mascot.webp': webp,
        'manifest.json': json,
        'project.json': projectJSON,
        'player.js': player,
        'machine.js': machineSource,
        'index.html': html,
        'README.txt':
          'Serve with a static HTTP server. StateMachinePlayer supports load, request, look, blink, pause, resume, destroy. Latest target wins; expressions and logo route through neutral. Source project and baked manifest share version 2. Runtime uses Canvas 2D only.',
      });
    signal?.throwIfAborted();
    return { atlas, manifest, png, webp, json, archive, plan };
  } finally {
    renderer?.destroy();
    canvas.width = canvas.height = cell.width = cell.height = 1;
  }
}
