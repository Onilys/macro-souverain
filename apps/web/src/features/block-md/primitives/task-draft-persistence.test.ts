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
    createTaskDraftPersistence({ draft, submitting: () => false, save });
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

it('does not resurrect a submitted draft from autosave or cleanup', async () => {
  vi.useFakeTimers();
  const save = vi.fn();
  const state = createRoot((dispose) => {
    const [submitting, setSubmitting] = createSignal(false);
    createTaskDraftPersistence({
      draft: () => ({ title: 'Fix login', content: '', propertyValues: {} }),
      submitting,
      save,
    });
    return { dispose, setSubmitting };
  });
  state.setSubmitting(true);
  state.dispose();
  await vi.advanceTimersByTimeAsync(300);
  expect(save).not.toHaveBeenCalled();
});
