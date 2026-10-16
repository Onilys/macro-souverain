import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/project.json';
import seed from '../fixtures/seed.json';
import { editablePose, syncNeutral } from './editor-selection';
import {
  animation,
  createProject,
  evaluate,
  layout,
  lookPose,
  pose,
} from './model.js';
import { parseProject, validateProject } from './project';

describe('editable project contract', () => {
  it('round-trips the authored fixture and rejects malformed renderer inputs', () => {
    expect(parseProject(JSON.stringify(fixture))).toEqual(fixture);
    expect(() => validateProject({ ...fixture, version: 3 })).toThrow();
    expect(() => parseProject('{')).toThrow('JSON');
    const bad = structuredClone(fixture);
    bad.base.eyes.left = [0];
    expect(() => validateProject(bad)).toThrow('base.eyes.left');
  });
  it('migrates v1 clips without conflating target poses', () => {
    const project = createProject(seed);
    const old = {
      version: 1,
      name: 'Old',
      base: project.base,
      logo: project.logo,
      clips: ['idle', 'smile', 'failed', 'waiting', 'review'].map((id) => ({
        id,
        easing: 'smooth',
        keys: [
          { t: 0, pose: pose() },
          { t: 1, pose: project.expressions.smile },
        ],
      })),
    };
    const migrated = validateProject(old);
    expect(migrated.version).toBe(2);
    expect(migrated.idle[0]).toEqual(migrated.neutral);
    expect(migrated.expressions.failure).not.toBe(migrated.expressions.smile);
  });
  it('preserves endpoints, positive overshoot scales, wrapping idle and 4x clockwise looks', () => {
    const project = validateProject(fixture);
    project.settings.lookGaze = 4;
    project.settings.anticipation = 2;
    expect(lookPose(project, 2).motion.gazeX).toBe(4);
    expect(lookPose(project, 0).motion.gazeY).toBe(4);
    expect(lookPose(project, 6).motion.gazeX).toBe(-4);
    expect(animation(project, 'intro', 1)).toEqual(project.neutral);
    for (const id of ['smile', 'failure', 'confused', 'thinking'] as const) {
      expect(animation(project, id, 0)).toEqual(project.neutral);
      expect(animation(project, id, 1)).toEqual(project.expressions[id]);
    }
    for (let i = 0; i <= 100; i++) {
      const result = evaluate(project, animation(project, 'intro', i / 100));
      expect(result.poses.every((p) => p.scale.every((s) => s > 0))).toBe(true);
    }
    const plan = layout(project);
    expect([plan.width, plan.height]).toEqual([2048, 1792]);
    expect(plan.frames.filter((f) => f.id === 'idle').at(-1)!.t).toBeLessThan(
      1
    );
    expect(plan.frames.some((f) => f.row === 6 && f.col >= 4)).toBe(false);
  });
  it('synchronizes neutral identity and isolates expression changes', () => {
    const project = validateProject(fixture);
    editablePose(project, { kind: 'idle', index: 0 })!.motion.y = 0.3;
    syncNeutral(project, { kind: 'idle', index: 0 });
    expect(project.neutral.motion.y).toBe(0.3);
    const thinking = structuredClone(project.expressions.thinking);
    editablePose(project, {
      kind: 'expression',
      id: 'smile',
    })!.motion.headTilt = 20;
    expect(project.expressions.thinking).toEqual(thinking);
  });
});
