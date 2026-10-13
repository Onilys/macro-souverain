import type { SplitManager } from '@components/app/split-layout/layoutManager';
import { until } from '@solid-primitives/promise';
import { createEffect, createRoot, createSignal } from 'solid-js';

/**
 *  Primary global split manager for the app.
 */
export const [globalSplitManager, setGlobalSplitManager] =
  createSignal<SplitManager>();

/**
 * Resolves once the global split manager is initialized. Safe to call from
 * outside a reactive context (e.g. async event handlers).
 */
export function whenSplitManagerReady(
  signal?: AbortSignal
): Promise<SplitManager> {
  const wait = until(globalSplitManager);
  if (!signal) return wait;
  const abortSignal = signal;

  return new Promise((resolve, reject) => {
    function onAbort() {
      wait.dispose();
      reject(
        abortSignal.reason ??
          new DOMException('Split manager readiness wait aborted', 'AbortError')
      );
    }

    const settleWaitHandler0 = reject;
    const settleWaitHandler1 = resolve;
    const settleWaitFinally = async () => {
      return await abortSignal.removeEventListener('abort', onAbort);
    };
    const settleWait = async () => {
      try {
        let settleWaitValue;
        try {
          settleWaitValue = await wait;
        } catch (settleWaitError) {
          return await settleWaitHandler0(settleWaitError);
        }
        return await settleWaitHandler1(settleWaitValue);
      } finally {
        await settleWaitFinally();
      }
    };
    settleWait();

    if (abortSignal.aborted) {
      onAbort();
      return;
    }

    abortSignal.addEventListener('abort', onAbort, { once: true });
  });
}

if (import.meta.env.DEV) {
  createRoot(() => {
    createEffect(() => {
      const m = globalSplitManager();
      if (m)
        (
          globalThis as { __macroSplitManager?: SplitManager }
        ).__macroSplitManager = m;
    });
  });
}
