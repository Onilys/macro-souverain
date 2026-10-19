import { err, ok, type Result } from 'neverthrow';
import { createRoot, createSignal } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  TaskPredictionInput,
  TaskPredictions,
} from '../core/task-predictions';
import { createTaskPredictions } from './task-predictions';

const disposers: (() => void)[] = [];
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  vi.useRealTimers();
});

function setup() {
  vi.useFakeTimers();
  const requests: {
    input: TaskPredictionInput;
    resolve(value: Result<TaskPredictions, unknown>): void;
  }[] = [];
  const apply = vi.fn();
  const state = createRoot((dispose) => {
    disposers.push(dispose);
    const [input, setInput] = createSignal<TaskPredictionInput>({
      title: '',
      description: '',
      projects: [],
      predictPriority: true,
      predictProject: false,
    });
    const [userId, setUserId] = createSignal<string | undefined>('user-a');
    const [enabled, setEnabled] = createSignal(true);
    createTaskPredictions({
      input,
      userId,
      enabled,
      apply,
      predict: (input) =>
        new Promise((resolve) => requests.push({ input, resolve })),
    });
    return { setInput, setUserId, setEnabled, dispose };
  });
  return { ...state, requests, apply };
}

describe('draft property prediction', () => {
  it('debounces title and description edits and applies only the latest content', async () => {
    const s = setup();
    s.setInput((input) => ({ ...input, title: 'Fix' }));
    await vi.advanceTimersByTimeAsync(400);
    s.setInput((input) => ({ ...input, description: 'Production outage' }));
    await vi.advanceTimersByTimeAsync(699);
    expect(s.requests).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(s.requests[0].input.description).toBe('Production outage');
    s.requests[0].resolve(ok({ priority: 'urgent' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(s.apply).toHaveBeenCalledWith({ priority: 'urgent' });
  });

  it('invalidates old results immediately and serializes the latest queued request', async () => {
    const s = setup();
    s.setInput((input) => ({ ...input, title: 'First' }));
    await vi.advanceTimersByTimeAsync(700);
    s.setInput((input) => ({ ...input, title: 'Second' }));
    await vi.advanceTimersByTimeAsync(700);
    s.setInput((input) => ({ ...input, title: 'Third' }));
    await vi.advanceTimersByTimeAsync(700);
    expect(s.requests).toHaveLength(1);
    s.requests[0].resolve(ok({ project: 'old' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(s.apply).not.toHaveBeenCalled();
    expect(s.requests).toHaveLength(2);
    expect(s.requests[1].input.title).toBe('Third');
    s.requests[1].resolve(ok({ project: 'new' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(s.apply).toHaveBeenCalledWith({ project: 'new' });
  });

  it.each(['edit', 'clear', 'submit', 'account', 'dispose'] as const)(
    'ignores an in-flight reply after %s, before the next debounce',
    async (action) => {
      const s = setup();
      s.setInput((input) => ({ ...input, title: 'First' }));
      await vi.advanceTimersByTimeAsync(700);
      if (action === 'edit')
        s.setInput((input) => ({ ...input, title: 'Changed' }));
      if (action === 'clear') s.setInput((input) => ({ ...input, title: '' }));
      if (action === 'submit') s.setEnabled(false);
      if (action === 'account') s.setUserId('user-b');
      if (action === 'dispose') s.dispose();
      s.requests[0].resolve(ok({ priority: 'urgent' }));
      await vi.advanceTimersByTimeAsync(0);
      expect(s.apply).not.toHaveBeenCalled();
    }
  );

  it('leaves properties alone on provider failure and can predict a later edit', async () => {
    const s = setup();
    s.setInput((input) => ({ ...input, title: 'First' }));
    await vi.advanceTimersByTimeAsync(700);
    s.requests[0].resolve(err('unavailable'));
    await vi.advanceTimersByTimeAsync(0);
    expect(s.apply).not.toHaveBeenCalled();
    s.setInput((input) => ({ ...input, title: 'Second' }));
    await vi.advanceTimersByTimeAsync(700);
    expect(s.requests).toHaveLength(2);
  });
});
