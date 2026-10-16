import { MascotMachine, validateManifest } from '../core/machine.js';

// Shared decoded sheet per manifest URL, released after the final player unmounts.
const assets = new Map();
async function fetchAsset(url) {
  const response = await fetch(url);
  if (!response.ok) throw Error('Manifest unavailable');
  const manifest = validateManifest(await response.json());
  let image, lastError;
  for (const path of [manifest.sheet.src, manifest.sheet.fallback]) {
    if (!path) continue;
    try {
      const source = new URL(path, url);
      if (!['http:', 'https:'].includes(source.protocol))
        throw Error('Unsupported sheet URL');
      const result = await fetch(source);
      if (!result.ok) throw Error('Sheet unavailable');
      image = await createImageBitmap(await result.blob());
      if (
        image.width !== manifest.sheet.width ||
        image.height !== manifest.sheet.height
      ) {
        image.close();
        image = null;
        throw Error('Sheet dimensions do not match manifest');
      }
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!image) throw lastError || Error('No sprite sheet');
  return { manifest, image };
}
async function releaseImage(promise) {
  try {
    const asset = await promise;
    asset.image.close();
  } catch {
    /* Failed assets own no decoded image. */
  }
}
function acquire(url) {
  let entry = assets.get(url);
  if (!entry) {
    entry = { refs: 0, promise: fetchAsset(url) };
    assets.set(url, entry);
  }
  entry.refs++;
  let released = false;
  return {
    promise: entry.promise,
    release() {
      if (released) return;
      released = true;
      if (--entry.refs === 0) {
        assets.delete(url);
        void releaseImage(entry.promise);
      }
    },
  };
}
export class StateMachinePlayer {
  constructor(canvas, { onChange = () => {} } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    if (!this.ctx) throw Error('Canvas 2D unavailable');
    this.onChange = onChange;
    this.raf = 0;
    this.visible = true;
    this.paused = false;
    this.destroyed = false;
    this.motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
    this.motionChanged = () => {
      this.machine?.setReducedMotion(this.motionQuery.matches);
      this.paint();
      this.restart();
    };
    this.visibilityChanged = () => this.restart();
    this.motionQuery.addEventListener('change', this.motionChanged);
    document.addEventListener('visibilitychange', this.visibilityChanged);
    this.observer = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.restart();
    });
    this.observer.observe(canvas);
  }
  async load(manifestUrl, { initial = 'logo' } = {}) {
    if (this.destroyed) throw Error('Player is disposed');
    if (this.asset) throw Error('Create a new player to change the asset');
    this.asset = acquire(new URL(manifestUrl, location.href).href);
    try {
      const asset = await this.asset.promise;
      if (this.destroyed) return this;
      this.image = asset.image;
      this.machine = new MascotMachine(asset.manifest, {
        initial,
        reducedMotion: this.motionQuery.matches,
      });
      this.canvas.width = asset.manifest.width;
      this.canvas.height = asset.manifest.height;
      this.paint();
      this.restart();
      return this;
    } catch (error) {
      this.destroy();
      throw error;
    }
  }
  request(target) {
    if (this.destroyed || !this.machine) return;
    if (this.machine.target === target) return;
    this.machine.request(target);
    this.paint();
    this.restart();
  }
  blink() {
    if (this.destroyed || !this.machine) return;
    this.machine.blink();
    this.paint();
    this.restart();
  }
  look(index) {
    this.request(index === null ? 'idle' : 'look:' + index);
  }
  pause() {
    this.paused = true;
    this.stop();
  }
  resume() {
    this.paused = false;
    this.restart();
  }
  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }
  restart() {
    this.stop();
    this.last = performance.now();
    this.schedule();
  }
  schedule() {
    if (
      this.destroyed ||
      this.paused ||
      !this.visible ||
      document.hidden ||
      !this.machine?.active ||
      this.raf
    )
      return;
    this.raf = requestAnimationFrame((now) => this.tick(now));
  }
  tick(now) {
    this.raf = 0;
    this.machine.advance(Math.min(100, Math.max(0, now - this.last)));
    this.last = now;
    this.paint();
    this.schedule();
  }
  paint() {
    if (!this.machine || this.destroyed) return;
    const f = this.machine.frame(),
      key = f.x + ',' + f.y;
    if (key !== this.lastFrame) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.drawImage(
        this.image,
        f.x,
        f.y,
        f.w,
        f.h,
        0,
        0,
        this.canvas.width,
        this.canvas.height
      );
      this.lastFrame = key;
    }
    const state = this.machine.snapshot(),
      phase = JSON.stringify({ ...state, time: undefined });
    if (phase !== this.lastPhase) {
      this.lastPhase = phase;
      this.onChange(state);
    }
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stop();
    this.asset?.release();
    this.image = null;
    this.machine = null;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.observer.disconnect();
    this.motionQuery.removeEventListener('change', this.motionChanged);
    document.removeEventListener('visibilitychange', this.visibilityChanged);
  }
}
