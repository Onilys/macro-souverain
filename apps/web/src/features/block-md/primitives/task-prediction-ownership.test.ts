import { createRoot } from 'solid-js';
import { expect, it } from 'vitest';
import { createTaskPredictionOwnership } from './task-prediction-ownership';

it('protects initial values and permits repeated agent updates until a manual choice', () => {
  createRoot((dispose) => {
    const state = createTaskPredictionOwnership(['project']);
    expect(state.canPredict('project')).toBe(false);
    expect(state.canPredict('priority')).toBe(true);
    state.markPredicted('priority');
    expect(state.canPredict('priority')).toBe(true);
    state.markManual('priority');
    expect(state.canPredict('priority')).toBe(false);
    expect(state.predictedIds()).toEqual([]);
    dispose();
  });
});

it('restores agent ownership and keeps manual clears protected across reopening', () => {
  createRoot((dispose) => {
    const state = createTaskPredictionOwnership(
      ['project', 'priority'],
      ['project']
    );
    expect(state.canPredict('project')).toBe(true);
    expect(state.canPredict('priority')).toBe(false);
    state.markManual('project');
    const restored = createTaskPredictionOwnership(
      ['project', 'priority'],
      state.predictedIds()
    );
    expect(restored.canPredict('project')).toBe(false);
    restored.reset([]);
    expect(restored.canPredict('project')).toBe(true);
    dispose();
  });
});
