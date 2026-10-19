import { createRoot, createSignal } from 'solid-js';
import { expect, it, vi } from 'vitest';
import { createTaskBoundaryNavigation } from './create-task-boundary-navigation';

it('does not request retained boundaries while the directory is pending and resumes once ready', async () => {
  const response = Promise.withResolvers<void>();
  const moved = Promise.withResolvers<void>();
  const load = vi.fn(() => response.promise);
  const move = vi.fn(() => moved.resolve());
  const state = createRoot((dispose) => {
    const [ready, setReady] = createSignal(false);
    const beforeMove = createTaskBoundaryNavigation({
      enabled: () => true,
      ready,
      identity: () => 'current-filter',
      rows: () => [
        {
          kind: 'group-header',
          id: 'header:a',
          groupId: 'a',
          label: 'A',
          count: 10,
        },
        { kind: 'load-more', id: 'more:a', groupId: 'a', scopeId: 'a' },
      ],
      focus: () => ({ key: 'header:a', index: 0 }),
      focusKey: () => 'header:a',
      expanded: () => true,
      error: () => null,
      load,
      move,
    });
    return { dispose, setReady, beforeMove };
  });
  try {
    expect(state.beforeMove(1)).toBe(false);
    expect(load).not.toHaveBeenCalled();
    expect(move).not.toHaveBeenCalled();
    state.setReady(true);
    expect(state.beforeMove(1)).toBe(false);
    expect(state.beforeMove(1)).toBe(false);
    expect(load).toHaveBeenCalledExactlyOnceWith('a');
    response.resolve();
    await moved.promise;
    expect(move).toHaveBeenCalledExactlyOnceWith(1, false);
  } finally {
    state.dispose();
  }
});

it('does not recursively resume navigation when the directory becomes pending during a page request', async () => {
  const response = Promise.withResolvers<void>();
  const move = vi.fn();
  const state = createRoot((dispose) => {
    const [ready, setReady] = createSignal(true);
    const beforeMove = createTaskBoundaryNavigation({
      enabled: () => true,
      ready,
      identity: () => 'current-filter',
      rows: () => [
        {
          kind: 'group-header',
          id: 'header:a',
          groupId: 'a',
          label: 'A',
          count: 10,
        },
        { kind: 'load-more', id: 'more:a', groupId: 'a', scopeId: 'a' },
      ],
      focus: () => ({ key: 'header:a', index: 0 }),
      focusKey: () => 'header:a',
      expanded: () => true,
      error: () => null,
      load: () => response.promise,
      move,
    });
    return { dispose, setReady, beforeMove };
  });
  try {
    expect(state.beforeMove(1, true)).toBe(false);
    state.setReady(false);
    response.resolve();
    await response.promise;
    expect(move).not.toHaveBeenCalled();
    expect(state.beforeMove(1, true)).toBe(false);
  } finally {
    state.dispose();
  }
});
