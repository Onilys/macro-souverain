import { z } from 'zod';
import { migrate, validate } from './model.js';
import type { Project } from './types';

const number = (min: number, max: number) =>
  z.number().finite().min(min).max(max);
const vec = (min: number, max: number) =>
  z.tuple([number(min, max), number(min, max), number(min, max)]);
const transform = z.object({
  position: vec(-6, 6),
  rotation: vec(-360, 360),
  scale: vec(0.1, 6),
  radius: number(0, 2),
});
const camera = z.object({
  yaw: number(-6.3, 6.3),
  pitch: number(-1.4, 1.4),
  zoom: number(2, 20),
});
const color = z.string().regex(/^#[a-f\d]{6}$/i);
const pose = z.object({
  motion: z.object({
    x: number(-2, 2),
    y: number(-2, 2),
    lean: number(-45, 45),
    yaw: number(-45, 45),
    squash: number(0.5, 1.5),
    headTilt: number(-45, 45),
    headYaw: number(-45, 45),
    headPitch: number(-45, 45),
    gazeX: number(-1, 1),
    gazeY: number(-1, 1),
    blinkL: number(0, 1),
    blinkR: number(0, 1),
    smileL: number(-1, 1),
    smileR: number(-1, 1),
    morph: z.literal(1),
  }),
  objects: z
    .array(
      z.object({
        position: vec(-3, 3),
        rotation: vec(-180, 180),
        scale: vec(0.25, 2),
        radius: number(-1, 1),
      })
    )
    .length(3),
});
const schema = z.object({
  version: z.literal(2),
  name: z.string().max(80),
  base: z.object({
    version: z.number(),
    size: number(64, 1024),
    antialias: number(1, 4),
    transparent: z.boolean(),
    duration: z.number().finite(),
    loop: z.boolean(),
    camera,
    surface: z.object({
      dark: color,
      light: color,
      rim: color,
      background: color,
      direction: vec(-10, 10),
      gradientRotation: vec(-360, 360),
      offset: number(-2, 2),
      span: number(0.1, 20),
      fresnel: number(0, 1),
      power: number(0.2, 10),
      blend: number(0, 3),
      clay: number(0, 1),
      clayScale: number(0.5, 5),
      exposure: number(0.1, 2),
    }),
    objects: z
      .array(
        transform.extend({
          id: z.string().max(80),
          name: z.string().max(80),
          keys: z.array(z.unknown()).max(0),
          easing: z.string().max(20),
        })
      )
      .length(3),
    eyes: z.object({
      objectIndex: number(0, 2).int(),
      amount: number(0, 1),
      smile: number(-1, 1),
      radius: number(0.02, 0.3),
      spacing: number(0.1, 2),
      offsetY: number(-1, 1),
      offsetZ: number(-1, 1),
      left: z.array(z.number().finite()).length(4),
      right: z.array(z.number().finite()).length(4),
    }),
  }),
  logo: z.object({ camera, objects: z.array(transform).length(3) }),
  neutral: pose,
  expressions: z.object({
    smile: pose,
    failure: pose,
    confused: pose,
    thinking: pose,
  }),
  idle: z.array(pose).min(1).max(8),
  settings: z.object({
    introDuration: number(300, 5000),
    poseDuration: number(100, 2000),
    idleDuration: number(200, 10000),
    blinkDuration: number(100, 1000),
    anticipation: number(0, 2),
    lookYaw: number(0, 35),
    lookPitch: number(0, 25),
    lookGaze: number(0, 4),
  }),
});

/** Normalize all renderer inputs; unknown fields never enter the editable rig. */
export function validateProject(input: unknown): Project {
  let migrated: unknown;
  try {
    migrated = migrate(input);
  } catch {
    throw new Error(
      'Unsupported or malformed project. Import a version 1 or 2 project.'
    );
  }
  const result = schema.safeParse(migrated);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`${issue.path.join('.')}: ${issue.message}`);
  }
  return validate(result.data);
}

export const MAX_PROJECT_BYTES = 1_000_000;
export function parseProject(text: string): Project {
  if (new TextEncoder().encode(text).byteLength > MAX_PROJECT_BYTES)
    throw new Error('Project must be smaller than 1 MB.');
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new Error('Project is not valid JSON.');
  }
  return validateProject(input);
}
