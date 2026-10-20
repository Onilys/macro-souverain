import {
  createMemo,
  createRoot,
  createSignal,
  mapArray,
  type Setter,
} from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  type BufferedThreadView,
  createBufferedThread,
  THREAD_SWITCH_DEADLINE_MS,
  type ThreadLoadState,
} from './buffered-thread';

const operations = vi.hoisted(
  () => [] as { threadId: unknown; outcome?: string }[]
);
vi.mock('@app/observability/ui-operation', () => ({
  startUiOperation: (
    _name: string,
    options: { attributes: Record<string, unknown> }
  ) => {
    const operation: { threadId: unknown; outcome?: string } = {
      threadId: options.attributes['email.thread_id'],
    };
    operations.push(operation);
    return {
      mark: () => {},
      afterPaint: () => {
        operation.outcome ??= 'success';
      },
      finish: (outcome = 'success') => {
        operation.outcome ??= outcome;
      },
    };
  },
}));

beforeEach(() => {
  vi.useFakeTimers();
  operations.length = 0;
});
afterEach(() => vi.useRealTimers());

/** Mounts each thread the buffer keeps, as the route's `For` does. */
function setup(options: { cached?: string[] } = {}) {
  const [requested, setRequested] = createSignal('a');
  const states = new Map<string, Setter<ThreadLoadState>>();
  return createRoot((dispose) => {
    const buffer = createBufferedThread<BufferedThreadView & { name: string }>(
      requested
    );
    createMemo(
      mapArray(buffer.mounted, (threadId) => {
        const [state, setState] = createSignal<ThreadLoadState>(
          options.cached?.includes(threadId) ? 'rendered' : 'loading'
        );
        states.set(threadId, setState);
        buffer.attach(threadId, { state, name: threadId });
      })
    );
    const load = (threadId: string, state: ThreadLoadState = 'rendered') =>
      states.get(threadId)?.(state);
    return { buffer, setRequested, load, dispose };
  });
}

it('keeps the open thread on screen until the next one has rendered', () => {
  const { buffer, setRequested, load, dispose } = setup();
  setRequested('b');
  expect(buffer.shown()).toBe('a');
  expect(buffer.mounted()).toEqual(['a', 'b']);
  expect(buffer.switching()).toBe(true);
  expect(buffer.current()?.name).toBe('a');

  load('b');
  expect(buffer.shown()).toBe('b');
  expect(buffer.mounted()).toEqual(['b']);
  expect(buffer.switching()).toBe(false);
  expect(buffer.current()?.name).toBe('b');
  dispose();
});

it('shows a thread that is already loaded at once', () => {
  const { buffer, setRequested, dispose } = setup({ cached: ['b'] });
  setRequested('b');
  expect(buffer.shown()).toBe('b');
  expect(buffer.mounted()).toEqual(['b']);
  dispose();

  expect(operations).toEqual([{ threadId: 'b', outcome: 'success' }]);
});

it('never shows a thread that was stepped past before it rendered', () => {
  const { buffer, setRequested, load, dispose } = setup();
  setRequested('b');
  setRequested('c');
  expect(buffer.mounted()).toEqual(['a', 'c']);

  load('b');
  expect(buffer.shown()).toBe('a');
  load('c');
  expect(buffer.shown()).toBe('c');
  dispose();
});

it('shows a slow thread, loading state and all, after the deadline', () => {
  const { buffer, setRequested, dispose } = setup();
  setRequested('b');
  vi.advanceTimersByTime(THREAD_SWITCH_DEADLINE_MS - 1);
  expect(buffer.shown()).toBe('a');
  vi.advanceTimersByTime(1);
  expect(buffer.shown()).toBe('b');
  dispose();
});

it('restarts the deadline when a thread is requested again', () => {
  const { buffer, setRequested, dispose } = setup();
  setRequested('b');
  vi.advanceTimersByTime(THREAD_SWITCH_DEADLINE_MS / 2);
  setRequested('a');
  setRequested('b');
  vi.advanceTimersByTime(THREAD_SWITCH_DEADLINE_MS / 2);
  expect(buffer.shown()).toBe('a');
  vi.advanceTimersByTime(THREAD_SWITCH_DEADLINE_MS / 2);
  expect(buffer.shown()).toBe('b');
  dispose();
});

it('shows a thread that failed to load and traces it as an error', () => {
  const { buffer, setRequested, load, dispose } = setup();
  setRequested('b');
  load('b', 'failed');
  expect(buffer.shown()).toBe('b');
  dispose();

  expect(operations).toEqual([{ threadId: 'b', outcome: 'error' }]);
});

it('traces each thread that loaded behind by how it reached the screen', () => {
  const { setRequested, load, dispose } = setup();
  setRequested('b');
  setRequested('c');
  load('c');
  setRequested('d');
  vi.advanceTimersByTime(THREAD_SWITCH_DEADLINE_MS);
  setRequested('e');
  setRequested('d');
  dispose();

  expect(operations).toEqual([
    { threadId: 'b', outcome: 'cancelled' },
    { threadId: 'c', outcome: 'success' },
    // Shown at the deadline with its loading state, not rendered.
    { threadId: 'd', outcome: 'timeout' },
    // Stepped back to the thread on screen before it loaded.
    { threadId: 'e', outcome: 'cancelled' },
  ]);
});
