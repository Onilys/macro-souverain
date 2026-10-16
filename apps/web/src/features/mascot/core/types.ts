export type Expression = 'smile' | 'failure' | 'confused' | 'thinking';
export type ClipId = 'intro' | 'idle' | 'blink' | Expression;
export type LookIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type Target = 'logo' | 'idle' | Expression | `look:${LookIndex}`;
export type Vec3 = [number, number, number];
export type Transform = {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  radius: number;
};
export type Motion = {
  x: number;
  y: number;
  lean: number;
  yaw: number;
  squash: number;
  headTilt: number;
  headYaw: number;
  headPitch: number;
  gazeX: number;
  gazeY: number;
  blinkL: number;
  blinkR: number;
  smileL: number;
  smileR: number;
  morph: number;
};
export type Pose = { motion: Motion; objects: Transform[] };
export type Camera = { yaw: number; pitch: number; zoom: number };
export type Surface = {
  dark: string;
  light: string;
  rim: string;
  background: string;
  direction: Vec3;
  gradientRotation: Vec3;
  offset: number;
  span: number;
  fresnel: number;
  power: number;
  blend: number;
  clay: number;
  clayScale: number;
  exposure: number;
};
export type Rig = {
  version: number;
  size: number;
  antialias: number;
  transparent: boolean;
  duration: number;
  loop: boolean;
  camera: Camera;
  surface: Surface;
  objects: (Transform & {
    id: string;
    name: string;
    keys: unknown[];
    easing: string;
  })[];
  eyes: {
    objectIndex: number;
    amount: number;
    smile: number;
    radius: number;
    spacing: number;
    offsetY: number;
    offsetZ: number;
    left: number[];
    right: number[];
  };
};
export type Project = {
  version: 2;
  name: string;
  base: Rig;
  logo: { camera: Camera; objects: Transform[] };
  neutral: Pose;
  expressions: Record<Expression, Pose>;
  idle: Pose[];
  settings: {
    introDuration: number;
    poseDuration: number;
    idleDuration: number;
    blinkDuration: number;
    anticipation: number;
    lookYaw: number;
    lookPitch: number;
    lookGaze: number;
  };
};
export type Rectangle = { x: number; y: number; w: number; h: number };
export type Frame = Rectangle & { page: 0; duration: number };
export type Clip = {
  id: ClipId;
  frames: Frame[];
  duration: number;
  loop: boolean;
  reversible: boolean;
};
export type Manifest = {
  version: 2;
  name: string;
  format: 'variant';
  width: 256;
  height: 256;
  columns: 8;
  rows: 7;
  sheet: {
    src: string;
    fallback?: string;
    width: 2048;
    height: 1792;
    bytes?: number;
    pngBytes?: number;
  };
  clips: Record<ClipId, Clip>;
  looks: (Rectangle & { angle: number })[];
  cameraZoom: number;
};
export type MachineState =
  | { kind: 'logo' }
  | { kind: 'idle'; time: number }
  | { kind: 'look'; index: LookIndex }
  | { kind: 'hold'; pose: Expression }
  | { kind: 'blink'; time: number }
  | {
      kind: 'transition';
      clip: 'intro' | Expression;
      time: number;
      direction: 1 | -1;
    };
export type Snapshot = MachineState & { target: Target };
export type PlannedFrame = {
  id: ClipId | 'look';
  index?: number;
  col: number;
  row: number;
  pose: Pose;
  duration: number;
  t: number;
};
export type Layout = {
  width: 2048;
  height: 1792;
  cellWidth: 256;
  cellHeight: 256;
  frames: PlannedFrame[];
  clips: Record<ClipId, Clip>;
};
