import { animation, clone, lookPose, pose } from './model.js';
import type { ClipId, Expression, LookIndex, Pose, Project } from './types';
export type Selection =
  | { kind: 'neutral' }
  | { kind: 'expression'; id: Expression }
  | { kind: 'idle'; index: number }
  | { kind: 'logo' }
  | { kind: 'look'; index: LookIndex | null }
  | { kind: 'preview'; id: ClipId };
export function editablePose(
  project: Project,
  selection: Selection
): Pose | undefined {
  if (selection.kind === 'neutral') return project.neutral;
  if (selection.kind === 'expression') return project.expressions[selection.id];
  if (selection.kind === 'idle')
    return project.idle[Math.min(selection.index, project.idle.length - 1)];
}
export function previewPose(
  project: Project,
  selection: Selection,
  time: number
): Pose {
  if (selection.kind === 'logo') {
    const value = pose();
    value.motion.morph = 0;
    return value;
  }
  if (selection.kind === 'look')
    return selection.index === null
      ? clone(project.neutral)
      : lookPose(project, selection.index);
  if (selection.kind === 'preview')
    return animation(project, selection.id, time);
  return clone(editablePose(project, selection)!);
}
export function syncNeutral(project: Project, selection: Selection) {
  if (selection.kind === 'idle' && selection.index === 0)
    project.neutral = clone(project.idle[0]);
  project.idle[0] = clone(project.neutral);
}
