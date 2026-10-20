import {
  startUiOperation,
  type UiOperation,
} from '@app/observability/ui-operation';
import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  untrack,
} from 'solid-js';

/** How long a slow thread may keep the previous one on screen. */
export const THREAD_SWITCH_DEADLINE_MS = 1000;

/** A mounted thread: still loading, rendered, or failed to load. */
export type ThreadLoadState = 'loading' | 'rendered' | 'failed';

/** What a mounted thread hands the buffer; the route reads the shown one's. */
export type BufferedThreadView = { state: Accessor<ThreadLoadState> };

export type BufferedThread<View extends BufferedThreadView> = {
  /** The thread on screen. */
  shown: Accessor<string>;
  /** Threads to keep mounted: the one on screen and the one loading behind. */
  mounted: Accessor<string[]>;
  /** True while the requested thread loads behind the one on screen. */
  switching: Accessor<boolean>;
  /** The view of the thread on screen, once it has attached. */
  current: Accessor<View | undefined>;
  /**
   * Called from a mounted thread's setup; the view detaches when the thread
   * unmounts.
   */
  attach: (threadId: string, view: View) => void;
};

/**
 * Keeps the open thread on screen while the next one loads behind it. The
 * requested thread is shown once it has rendered or failed, or once it has
 * loaded behind for `deadlineMs` (then with its own loading state). A thread
 * the user steps past before then is never shown.
 *
 * Each thread that loads behind is an `email.thread.switch` UI operation:
 * `success` once it is shown rendered, `error` when it failed to load,
 * `timeout` when the deadline showed it still loading, `cancelled` when the
 * user stepped past it.
 */
export function createBufferedThread<View extends BufferedThreadView>(
  requested: Accessor<string>,
  deadlineMs = THREAD_SWITCH_DEADLINE_MS
): BufferedThread<View> {
  type Entry = { view: View; due: Accessor<boolean> };
  const [entries, setEntries] = createSignal(new Map<string, Entry>(), {
    equals: false,
  });
  const switches = new Map<string, UiOperation>();

  const shown = createMemo<string>((previous) => {
    const threadId = requested();
    if (threadId === previous) return previous;
    return entries().get(threadId)?.due() ? threadId : previous;
  }, untrack(requested));

  // Telemetry only: a thread that loaded behind is on screen.
  createEffect(
    on(
      shown,
      (threadId) => {
        const operation = switches.get(threadId);
        if (!operation) return;
        switches.delete(threadId);
        const state = untrack(() => entries().get(threadId)?.view.state());
        if (state === 'failed') return operation.finish('error');
        if (state !== 'rendered') return operation.finish('timeout');
        operation.mark('rendered');
        operation.afterPaint();
      },
      { defer: true }
    )
  );

  return {
    shown,
    mounted: () => [...new Set([shown(), requested()])],
    switching: () => shown() !== requested(),
    current: () => entries().get(shown())?.view,
    attach: (threadId, view) => {
      // Before the view is added, which can show a loaded thread at once.
      const behind = untrack(shown) !== threadId;
      const [late, setLate] = createSignal(false);
      const entry: Entry = {
        view,
        due: () => late() || view.state() !== 'loading',
      };
      setEntries((map) => map.set(threadId, entry));
      onCleanup(() =>
        setEntries((map) => {
          if (map.get(threadId) === entry) map.delete(threadId);
          return map;
        })
      );
      if (!behind) return;
      const deadline = setTimeout(() => setLate(true), deadlineMs);
      const operation = startUiOperation('email.thread.switch', {
        attributes: { 'email.thread_id': threadId },
      });
      switches.set(threadId, operation);
      onCleanup(() => {
        clearTimeout(deadline);
        if (switches.get(threadId) !== operation) return;
        switches.delete(threadId);
        operation.finish('cancelled');
      });
    },
  };
}
