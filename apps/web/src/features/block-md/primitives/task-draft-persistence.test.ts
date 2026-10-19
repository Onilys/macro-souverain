import { createRoot, createSignal } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { createTaskDraftPersistence } from './task-draft-persistence';

afterEach(() => vi.useRealTimers());

it('flushes a manual clear and its ownership when dismissed before debounce', async () => {
  vi.useFakeTimers();
  const save = vi.fn();
  const state = createRoot((dispose) => {
    const [draft, setDraft] = createSignal({
      title: 'Fix login',
      content: '',
      propertyValues: {
        priority: { valueType: 'SELECT_STRING' as const, values: ['high'] },
      },
      predictedPropertyIds: ['priority'],
    });
    createTaskDraftPersistence({ draft, save });
    return { dispose, setDraft };
  });
  await vi.advanceTimersByTimeAsync(300);
  state.setDraft((draft) => ({
    ...draft,
    propertyValues: { priority: { valueType: 'SELECT_STRING', values: [] } },
    predictedPropertyIds: [],
  }));
  state.dispose();
  expect(save).toHaveBeenLastCalledWith({
    title: 'Fix login',
    content: '',
    propertyValues: { priority: { valueType: 'SELECT_STRING', values: [] } },
    predictedPropertyIds: [],
  });
  await vi.advanceTimersByTimeAsync(300);
  expect(save).toHaveBeenCalledTimes(2);
});

it('does not resurrect a submitted draft before or during delayed cleanup', async () => {
  vi.useFakeTimers();
  const save = vi.fn();
  const state = createRoot((dispose) => {
    const [draft, setDraft] = createSignal({
      title: 'Fix login',
      content: '',
      propertyValues: {},
    });
    const persistence = createTaskDraftPersistence({
      draft,
      save,
    });
    return { dispose, setDraft, ...persistence };
  });
  state.beginSubmission();
  state.setDraft({
    title: 'Fix login',
    content: 'Late update',
    propertyValues: {},
  });
  await vi.advanceTimersByTimeAsync(300);
  expect(save).not.toHaveBeenCalled();
  expect(state.active()).toBe(false);
  state.dispose();
  await vi.advanceTimersByTimeAsync(300);
  expect(save).not.toHaveBeenCalled();
});

it('resumes saving only when Create More starts another draft', async () => {
  vi.useFakeTimers();
  const save = vi.fn();
  const state = createRoot((dispose) => {
    const [draft, setDraft] = createSignal({
      title: 'First task',
      content: '',
      propertyValues: {},
    });
    return {
      dispose,
      setDraft,
      ...createTaskDraftPersistence({ draft, save }),
    };
  });
  state.beginSubmission();
  state.setDraft({ title: '', content: '', propertyValues: {} });
  state.startNewDraft();
  state.setDraft({ title: 'Second task', content: '', propertyValues: {} });
  await vi.advanceTimersByTimeAsync(300);
  expect(state.active()).toBe(true);
  expect(save).toHaveBeenCalledExactlyOnceWith({
    title: 'Second task',
    content: '',
    propertyValues: {},
  });
  state.dispose();
});
