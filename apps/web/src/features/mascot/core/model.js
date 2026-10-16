export const clone = (x) => structuredClone(x);
export const motions = {
  x: 0,
  y: 0,
  lean: 0,
  yaw: 0,
  squash: 1,
  headTilt: 0,
  headYaw: 0,
  headPitch: 0,
  gazeX: 0,
  gazeY: 0,
  blinkL: 0,
  blinkR: 0,
  smileL: 0,
  smileR: 0,
  morph: 1,
};
export function pose() {
  return {
    motion: { ...motions },
    objects: Array.from({ length: 3 }, () => ({
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      radius: 0,
    })),
  };
}
const P = (m = {}, objects = {}) => {
  const p = pose();
  Object.assign(p.motion, m);
  for (const [i, v] of Object.entries(objects)) Object.assign(p.objects[i], v);
  return p;
};
export function interpolate(a, b, t) {
  if (typeof a === 'number') return a + (b - a) * t;
  if (Array.isArray(a)) return a.map((v, i) => interpolate(v, b[i], t));
  return Object.fromEntries(
    Object.keys(a).map((k) => [k, interpolate(a[k], b[k], t)])
  );
}
export const smooth = (t) => t * t * (3 - 2 * t);
export function sample(clip, time) {
  const t = Math.max(0, Math.min(1, time));
  const keys = clip.keys;
  if (t <= keys[0].t) return clone(keys[0].pose);
  if (t >= keys.at(-1).t) return clone(keys.at(-1).pose);
  let i = 1;
  while (keys[i].t < t) i++;
  const a = keys[i - 1],
    b = keys[i];
  let f = (t - a.t) / (b.t - a.t);
  if (clip.easing === 'smooth') f = smooth(f);
  return interpolate(a.pose, b.pose, f);
}
const mix = (a, b, t) => a + (b - a) * t;
const color = (a, b, t) =>
  '#' +
  [1, 3, 5]
    .map((i) =>
      Math.round(
        mix(parseInt(a.slice(i, i + 2), 16), parseInt(b.slice(i, i + 2), 16), t)
      )
        .toString(16)
        .padStart(2, '0')
    )
    .join('');
const mm = (a, b) =>
  a.map((row) =>
    row.map((_, j) => row.reduce((n, v, k) => n + v * b[k][j], 0))
  );
const rx = (a) => [
  [1, 0, 0],
  [0, Math.cos(a), -Math.sin(a)],
  [0, Math.sin(a), Math.cos(a)],
];
const ry = (a) => [
  [Math.cos(a), 0, Math.sin(a)],
  [0, 1, 0],
  [-Math.sin(a), 0, Math.cos(a)],
];
const rz = (a) => [
  [Math.cos(a), -Math.sin(a), 0],
  [Math.sin(a), Math.cos(a), 0],
  [0, 0, 1],
];
export function turnHead(rotation, tilt, yaw, pitch) {
  const d = Math.PI / 180,
    [x, y, z] = rotation.map((v) => v * d);
  const r = mm(
    mm(ry(yaw * d), rx(-pitch * d)),
    mm(rz((z / d + tilt) * d), mm(ry(y), rx(x)))
  );
  const by = Math.asin(Math.max(-1, Math.min(1, -r[2][0]))),
    regular = Math.abs(Math.cos(by)) > 1e-6;
  return [
    (regular ? Math.atan2(r[2][1], r[2][2]) : 0) / d,
    by / d,
    (regular ? Math.atan2(r[1][0], r[0][0]) : Math.atan2(-r[0][1], r[1][1])) /
      d,
  ];
}
export function evaluate(project, p) {
  const s = clone(project.base),
    m = p.motion,
    f = m.morph,
    c = Math.max(0, Math.min(1, f));
  s.objects.forEach((o, i) => {
    const delta = p.objects[i],
      start = project.logo.objects[i];
    for (const key of ['position', 'rotation', 'scale'])
      o[key] = o[key].map((v, j) => {
        const end = key === 'scale' ? v * delta[key][j] : v + delta[key][j];
        return key === 'scale'
          ? Math.max(0.05, mix(start[key][j], end, f))
          : mix(start[key][j], end, f);
      });
    o.radius = Math.max(0, mix(start.radius, o.radius + delta.radius, f));
  });
  const baseY = Math.min(
    ...project.base.objects.map((o) => o.position[1] - o.scale[1] * 0.5)
  );
  const lean = (m.lean * Math.PI) / 180,
    yaw = (m.yaw * Math.PI) / 180;
  s.objects.forEach((o) => {
    let [x, y, z] = o.position;
    y = baseY + (y - baseY) * m.squash;
    o.scale[1] *= m.squash;
    o.scale[0] /= Math.sqrt(m.squash);
    o.scale[2] /= Math.sqrt(m.squash);
    [x, y] = [
      Math.cos(lean) * x - Math.sin(lean) * (y - baseY),
      Math.sin(lean) * x + Math.cos(lean) * (y - baseY) + baseY,
    ];
    [x, z] = [
      Math.cos(yaw) * x + Math.sin(yaw) * z,
      -Math.sin(yaw) * x + Math.cos(yaw) * z,
    ];
    o.position = [x + m.x, y + m.y, z];
    o.rotation[2] += m.lean;
    o.rotation[1] += m.yaw;
  });
  const face = s.objects[s.eyes.objectIndex];
  if (m.headTilt || m.headYaw || m.headPitch)
    face.rotation = turnHead(face.rotation, m.headTilt, m.headYaw, m.headPitch);
  s.eyes.offsetZ += m.gazeX * 0.15;
  s.eyes.offsetY += m.gazeY * 0.12;
  s.eyes.left = [m.smileL, Math.max(0.15, 1 - 0.85 * m.blinkL), 0, 0];
  s.eyes.right = [m.smileR, Math.max(0.15, 1 - 0.85 * m.blinkR), 0, 0];
  s.eyes.amount = smooth(Math.max(0, Math.min(1, (f - 0.6) / 0.4)));
  for (const k of ['yaw', 'pitch', 'zoom'])
    s.camera[k] = mix(project.logo.camera[k], project.base.camera[k], f);
  s.surface.dark = color('#000000', s.surface.dark, c);
  s.surface.light = color('#000000', s.surface.light, c);
  s.surface.fresnel *= c;
  s.surface.clay *= c;
  s.surface.blend *= c;
  return {
    state: s,
    poses: s.objects.map(({ position, rotation, scale }) => ({
      position,
      rotation,
      scale,
    })),
  };
}
export const EXPRESSIONS = ['smile', 'failure', 'confused', 'thinking'];
export const LABELS = {
  intro: 'Logo ↔ Variant',
  idle: 'Idle loop',
  smile: 'Smile',
  failure: 'Failure',
  confused: 'Confused',
  thinking: 'Thinking',
  blink: 'Blink',
};
export const LOOK_NAMES = [
  'Up',
  'Up-right',
  'Right',
  'Down-right',
  'Down',
  'Down-left',
  'Left',
  'Up-left',
];
export function createProject(recipe) {
  const base = clone(recipe.state);
  base.size = 512;
  base.antialias = 2;
  base.transparent = true;
  base.camera.zoom = 5.2;
  base.eyes.left = [0, 1, 0, 0];
  base.eyes.right = [0, 1, 0, 0];
  return {
    version: 2,
    name: 'Question mark',
    base,
    logo: {
      camera: { yaw: -0.602, pitch: 0.647, zoom: 5.1 },
      objects: recipe.project.bodies.map((b) => clone(b.start)),
    },
    neutral: pose(),
    expressions: {
      smile: P({ smileL: 1, smileR: 1, headTilt: 3 }),
      failure: P({
        smileL: -1,
        smileR: -1,
        squash: 0.9,
        headPitch: -8,
        gazeY: -0.5,
      }),
      confused: P({ headTilt: 14, blinkL: 0.4, gazeX: 0.3 }),
      thinking: P({
        headTilt: -8,
        headPitch: 6,
        gazeY: 0.8,
        blinkL: 0.25,
        blinkR: 0.25,
      }),
    },
    idle: [pose(), P({ squash: 1.012 }), pose(), P({ squash: 0.99 })],
    settings: {
      introDuration: 1000,
      poseDuration: 360,
      idleDuration: 1600,
      blinkDuration: 280,
      anticipation: 1.1,
      lookYaw: 18,
      lookPitch: 12,
      lookGaze: 1,
    },
  };
}
export function migrate(old) {
  if (old.version === 2) return old;
  if (old.version !== 1) throw Error('Unsupported project version');
  const p = {
    version: 2,
    name: old.name,
    base: clone(old.base),
    logo: clone(old.logo),
    neutral: pose(),
    expressions: {},
    idle: [],
    settings: {
      introDuration: 1000,
      poseDuration: 360,
      idleDuration: 1600,
      blinkDuration: 280,
      anticipation: 1.1,
      lookYaw: 18,
      lookPitch: 12,
      lookGaze: 1,
    },
  };
  for (const id of EXPRESSIONS) {
    const c = old.clips.find(
      (c) =>
        c.id ===
        ({ failure: 'failed', confused: 'waiting', thinking: 'review' }[id] ||
          id)
    );
    p.expressions[id] = c ? sample(c, 0.45) : pose();
  }
  p.idle = Array.from({ length: 4 }, (_, i) =>
    sample(
      old.clips.find((c) => c.id === 'idle'),
      i / 4
    )
  );
  p.idle[0] = clone(p.neutral);
  return p;
}
export function lookPose(p, index) {
  const q = clone(p.neutral),
    a = (index * Math.PI) / 4;
  Object.assign(q.motion, {
    gazeX: Math.sin(a) * p.settings.lookGaze,
    gazeY: Math.cos(a) * p.settings.lookGaze,
    headYaw: Math.sin(a) * p.settings.lookYaw,
    headPitch: Math.cos(a) * p.settings.lookPitch,
  });
  return q;
}
export function back(t, amount) {
  if (t === 0 || t === 1) return t;
  const x = t < 0.5 ? t * 2 : t * 2 - 2;
  return t < 0.5
    ? (x * x * ((amount + 1) * x - amount)) / 2
    : (x * x * ((amount + 1) * x + amount) + 2) / 2;
}
export function animation(p, id, t) {
  if (!Object.hasOwn(LABELS, id)) throw Error('Unknown clip: ' + id);
  t = Math.max(0, Math.min(1, t));
  if (id === 'intro') {
    const f = back(t, p.settings.anticipation),
      q = interpolate(pose(), p.neutral, Math.max(0, Math.min(1, f)));
    q.motion.morph = f;
    return q;
  }
  if (EXPRESSIONS.includes(id))
    return interpolate(p.neutral, p.expressions[id], smooth(t));
  if (id === 'blink') {
    const q = clone(p.neutral);
    const v =
      t <= 1 / 3
        ? t * 3
        : t <= 2 / 3
          ? 1 - (t - 1 / 3) * 1.5
          : 0.5 - (t - 2 / 3) * 1.5;
    for (const key of ['blinkL', 'blinkR'])
      q.motion[key] = mix(p.neutral.motion[key], 1, Math.max(0, v));
    return q;
  }
  const n = p.idle.length,
    x = t * n,
    i = Math.floor(x) % n;
  return interpolate(p.idle[i], p.idle[(i + 1) % n], smooth(x - Math.floor(x)));
}
export function clipInfo(p, id) {
  if (!Object.hasOwn(LABELS, id)) throw Error('Unknown clip: ' + id);
  const frames = id === 'intro' ? 16 : id === 'idle' ? p.idle.length : 4,
    duration =
      p.settings[
        id === 'intro'
          ? 'introDuration'
          : id === 'idle'
            ? 'idleDuration'
            : id === 'blink'
              ? 'blinkDuration'
              : 'poseDuration'
      ];
  return {
    id,
    frames,
    duration,
    loop: id === 'idle',
    reversible: id === 'intro' || EXPRESSIONS.includes(id),
  };
}
export function framePlan(c) {
  return Array.from({ length: c.frames }, (_, i) => ({
    t: c.id === 'idle' ? i / c.frames : c.frames === 1 ? 0 : i / (c.frames - 1),
    duration: c.duration / c.frames,
  }));
}
export function layout(p) {
  const w = 256,
    h = 256,
    frames = [],
    clips = {};
  const add = (id, row, col = 0) => {
    const c = clipInfo(p, id);
    clips[id] = { ...c, frames: [] };
    framePlan(c).forEach((f, i) => {
      const cell = {
        ...f,
        id,
        col: (col + i) % 8,
        row: row + Math.floor((col + i) / 8),
        pose: animation(p, id, f.t),
      };
      frames.push(cell);
      clips[id].frames.push({
        page: 0,
        x: cell.col * w,
        y: cell.row * h,
        w,
        h,
        duration: f.duration,
      });
    });
  };
  add('intro', 0);
  add('idle', 2);
  for (let i = 0; i < 8; i++)
    frames.push({
      id: 'look',
      index: i,
      col: i,
      row: 3,
      pose: lookPose(p, i),
      duration: 0,
      t: 0,
    });
  add('smile', 4);
  add('failure', 4, 4);
  add('confused', 5);
  add('thinking', 5, 4);
  add('blink', 6);
  return {
    width: 2048,
    height: 1792,
    cellWidth: w,
    cellHeight: h,
    frames,
    clips,
  };
}
export function validate(p) {
  const fail = () => {
    throw Error('This is not a valid Mascot Rig project.');
  };
  const n = (v, a, b) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < a || v > b) fail();
  };
  p = migrate(clone(p));
  if (
    p?.version !== 2 ||
    typeof p.name !== 'string' ||
    p.name.length > 80 ||
    !p.base ||
    p.base.objects?.length !== 3 ||
    p.logo?.objects?.length !== 3 ||
    !p.expressions ||
    !Array.isArray(p.idle) ||
    p.idle.length < 1 ||
    p.idle.length > 8
  )
    fail();
  const vec = (v, a, b) => {
    if (!Array.isArray(v) || v.length !== 3) fail();
    v.forEach((x) => n(x, a, b));
  };
  const trans = (o) => {
    vec(o.position, -6, 6);
    vec(o.rotation, -360, 360);
    vec(o.scale, 0.1, 6);
    n(o.radius, 0, 2);
  };
  p.base.objects.forEach((o) => {
    trans(o);
    if (typeof o.name !== 'string' || o.name.length > 80) fail();
  });
  p.logo.objects.forEach(trans);
  for (const c of [p.base.camera, p.logo.camera]) {
    n(c.yaw, -6.3, 6.3);
    n(c.pitch, -1.4, 1.4);
    n(c.zoom, 2, 20);
  }
  const sf = p.base.surface;
  for (const k of ['dark', 'light', 'rim', 'background'])
    if (!/^#[a-f0-9]{6}$/i.test(sf[k])) fail();
  for (const [k, a, b] of [
    ['span', 0.1, 20],
    ['offset', -2, 2],
    ['fresnel', 0, 1],
    ['power', 0.2, 10],
    ['blend', 0, 3],
    ['clay', 0, 1],
    ['clayScale', 0.5, 5],
    ['exposure', 0.1, 2],
  ])
    n(sf[k], a, b);
  vec(sf.direction, -10, 10);
  vec(sf.gradientRotation, -360, 360);
  const eyes = p.base.eyes;
  n(eyes.objectIndex, 0, 2);
  if (!Number.isInteger(eyes.objectIndex)) fail();
  n(eyes.radius, 0.02, 0.3);
  n(eyes.spacing, 0.1, 2);
  n(eyes.offsetY, -1, 1);
  n(eyes.offsetZ, -1, 1);
  const poseCheck = (x) => {
    if (!x?.motion || x.objects?.length !== 3) fail();
    for (const k of Object.keys(motions))
      n(
        x.motion[k],
        ...(k === 'morph'
          ? [0, 1]
          : k === 'squash'
            ? [0.5, 1.5]
            : k.startsWith('blink')
              ? [0, 1]
              : k.startsWith('smile')
                ? [-1, 1]
                : k.startsWith('gaze')
                  ? [-1, 1]
                  : k === 'x' || k === 'y'
                    ? [-2, 2]
                    : [-45, 45])
      );
    x.objects.forEach((o) => {
      vec(o.position, -3, 3);
      vec(o.rotation, -180, 180);
      vec(o.scale, 0.25, 2);
      n(o.radius, -1, 1);
    });
  };
  poseCheck(p.neutral);
  if (JSON.stringify(p.idle[0]) !== JSON.stringify(p.neutral)) fail();
  if (p.neutral.motion.morph !== 1) fail();
  for (const id of EXPRESSIONS) {
    poseCheck(p.expressions[id]);
    if (p.expressions[id].motion.morph !== 1) fail();
  }
  p.idle.forEach((x) => {
    poseCheck(x);
    if (x.motion.morph !== 1) fail();
  });
  for (const [k, a, b] of [
    ['introDuration', 300, 5000],
    ['poseDuration', 100, 2000],
    ['idleDuration', 200, 10000],
    ['blinkDuration', 100, 1000],
    ['anticipation', 0, 2],
    ['lookYaw', 0, 35],
    ['lookPitch', 0, 25],
    ['lookGaze', 0, 4],
  ])
    n(p.settings[k], a, b);
  return clone(p);
}
