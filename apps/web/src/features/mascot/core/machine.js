/** Deterministic sprite sequencer. No DOM, WebGL, timers, or agent dependencies. */
export const EXPRESSIONS = ['smile', 'failure', 'confused', 'thinking'];
const isLook = (value) => /^look:[0-7]$/.test(value);
export function validateManifest(m) {
  if (
    m?.version !== 2 ||
    m.width !== 256 ||
    m.height !== 256 ||
    m.columns !== 8 ||
    m.rows !== 7 ||
    m.sheet?.width !== 2048 ||
    m.sheet?.height !== 1792
  )
    throw Error('Unsupported mascot sheet');
  if (
    typeof m.sheet.src !== 'string' ||
    !m.sheet.src ||
    (m.sheet.fallback !== undefined && typeof m.sheet.fallback !== 'string')
  )
    throw Error('Missing sheet URL');
  const check = (f) => {
    if (
      !f ||
      ![f.x, f.y, f.w, f.h].every(Number.isInteger) ||
      f.x % 256 !== 0 ||
      f.y % 256 !== 0 ||
      f.x < 0 ||
      f.y < 0 ||
      f.w !== 256 ||
      f.h !== 256 ||
      f.x + f.w > 2048 ||
      f.y + f.h > 1792
    )
      throw Error('Invalid frame rectangle');
  };
  for (const id of ['intro', 'idle', ...EXPRESSIONS, 'blink']) {
    const c = m.clips?.[id],
      n = c?.frames?.length;
    if (
      !c ||
      (id === 'idle' ? n < 1 || n > 8 : n !== (id === 'intro' ? 16 : 4))
    )
      throw Error('Invalid clip: ' + id);
    c.frames.forEach((f, i) => {
      check(f);
      const start = {
        intro: 0,
        idle: 16,
        smile: 32,
        failure: 36,
        confused: 40,
        thinking: 44,
        blink: 48,
      }[id];
      if (
        f.page !== 0 ||
        f.x !== ((start + i) % 8) * 256 ||
        f.y !== Math.floor((start + i) / 8) * 256
      )
        throw Error('Invalid clip layout: ' + id);
      if (!Number.isFinite(f.duration) || f.duration <= 0)
        throw Error('Invalid frame duration');
    });
    if (
      !Number.isFinite(c.duration) ||
      Math.abs(c.duration - c.frames.reduce((sum, f) => sum + f.duration, 0)) >
        0.01
    )
      throw Error('Invalid clip duration');
  }
  if (m.looks?.length !== 8) throw Error('Eight looks required');
  m.looks.forEach((f, i) => {
    check(f);
    if (f.x !== i * 256 || f.y !== 768 || f.angle !== i * 45)
      throw Error('Invalid clockwise look layout');
  });
  return m;
}
export class MascotMachine {
  constructor(manifest, { initial = 'logo', reducedMotion = false } = {}) {
    this.manifest = validateManifest(structuredClone(manifest));
    this.reducedMotion = reducedMotion;
    this.target = 'logo';
    this.state = { kind: 'logo' };
    this.request(initial);
  }
  request(target) {
    if (!['logo', 'idle', ...EXPRESSIONS].includes(target) && !isLook(target))
      throw Error('Unknown mascot state: ' + target);
    this.target = target;
    if (this.reducedMotion) {
      this.settle(target);
      return;
    }
    this.route();
  }
  settle(target) {
    this.state =
      target === 'logo'
        ? { kind: 'logo' }
        : target === 'idle'
          ? { kind: 'idle', time: 0 }
          : isLook(target)
            ? { kind: 'look', index: Number(target.slice(5)) }
            : { kind: 'hold', pose: target };
  }
  transition(clip, time, direction) {
    this.state = { kind: 'transition', clip, time, direction };
  }
  route() {
    const s = this.state,
      target = this.target;
    if (s.kind === 'blink') return; // Finish a blink; then take the latest target.
    if (s.kind === 'transition') {
      s.direction =
        s.clip === 'intro'
          ? target === 'logo'
            ? -1
            : 1
          : target === s.clip
            ? 1
            : -1;
      return;
    }
    if (s.kind === 'logo') {
      if (target !== 'logo') this.transition('intro', 0, 1);
      return;
    }
    if (s.kind === 'hold') {
      if (target !== s.pose)
        this.transition(s.pose, this.manifest.clips[s.pose].duration, -1);
      return;
    }
    // Only neutral-based looks are available: they snap back to neutral before a clip.
    if (target === 'logo')
      this.transition('intro', this.manifest.clips.intro.duration, -1);
    else if (EXPRESSIONS.includes(target)) this.transition(target, 0, 1);
    else if (isLook(target)) this.settle(target);
    else if (s.kind !== 'idle') this.settle('idle');
  }
  blink() {
    if (
      this.reducedMotion ||
      this.state.kind !== 'idle' ||
      this.target !== 'idle'
    )
      return false;
    this.state = { kind: 'blink', time: 0 };
    return true;
  }
  setReducedMotion(value) {
    this.reducedMotion = Boolean(value);
    if (value) this.settle(this.target);
  }
  advance(milliseconds) {
    if (!Number.isFinite(milliseconds) || milliseconds < 0)
      throw Error('Invalid elapsed time');
    if (this.reducedMotion) return;
    let remaining = milliseconds;
    for (let guard = 0; guard < 12; guard++) {
      const s = this.state;
      if (s.kind === 'idle') {
        s.time = (s.time + remaining) % this.manifest.clips.idle.duration;
        return;
      }
      if (s.kind !== 'transition' && s.kind !== 'blink') return;
      const id = s.kind === 'blink' ? 'blink' : s.clip,
        duration = this.manifest.clips[id].duration;
      const direction = s.kind === 'blink' ? 1 : s.direction;
      const left = direction === 1 ? duration - s.time : s.time;
      const spent = Math.min(remaining, left);
      s.time += direction * spent;
      remaining -= spent;
      if (spent < left) return;
      if (
        id === 'blink' ||
        (direction === -1 && id !== 'intro') ||
        (direction === 1 && id === 'intro')
      )
        this.settle('idle');
      else if (id === 'intro') this.settle('logo');
      else this.settle(id);
      this.route();
      if (remaining <= 0) return;
    }
  }
  frame() {
    const s = this.state;
    if (s.kind === 'logo') return this.manifest.clips.intro.frames[0];
    if (s.kind === 'look') return this.manifest.looks[s.index];
    if (s.kind === 'hold') return this.manifest.clips[s.pose].frames.at(-1);
    const id = s.kind === 'transition' ? s.clip : s.kind;
    const c = this.manifest.clips[id];
    let end = 0;
    for (const f of c.frames) {
      end += f.duration;
      if (s.time < end) return f;
    }
    return c.frames.at(-1);
  }
  get active() {
    return (
      !this.reducedMotion &&
      (this.state.kind === 'idle'
        ? this.manifest.clips.idle.frames.length > 1
        : ['transition', 'blink'].includes(this.state.kind))
    );
  }
  snapshot() {
    return { target: this.target, ...structuredClone(this.state) };
  }
}
