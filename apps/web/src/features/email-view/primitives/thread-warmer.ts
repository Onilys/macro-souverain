import { Telemetry } from '@macro-inc/observability';
import { AsyncQueuer } from '@tanstack/pacer';

/** A warmed thread stays warm about as long as the thread cache keeps it fresh. */
const WARM_TTL_MS = 5 * 60 * 1000;
/** A warm that failed waits this long before a later request retries it. */
const RETRY_AFTER_MS = 30 * 1000;

export type ThreadWarmer = {
  /** Warm these threads next. Requests nobody is near any more are dropped. */
  warm: (threadIds: readonly string[]) => void;
  dispose: () => void;
};

/**
 * Loads threads the user is about to open (the row under the cursor, the open
 * thread's neighbours) two at a time, each at most once per TTL. A warm that
 * failed or left the thread uncached is retried by a request at least 30
 * seconds later, so an offline cursor does not refetch on every step. Each
 * warm is an `email.thread.warm` span with its queue wait and outcome.
 */
export function createThreadWarmer(options: {
  /** Resolves to whether the thread's first page is now cached. */
  warm: (threadId: string) => Promise<boolean>;
  now?: () => number;
}): ThreadWarmer {
  const now = options.now ?? Date.now;
  /** When each thread may be warmed again. */
  const warmUntil = new Map<string, number>();
  const isWarm = (threadId: string) => (warmUntil.get(threadId) ?? 0) > now();
  const queuer = new AsyncQueuer<{ threadId: string; queuedAt: number }>(
    async ({ threadId, queuedAt }) => {
      if (isWarm(threadId)) return;
      warmUntil.set(threadId, now() + WARM_TTL_MS);
      await Telemetry.span('email.thread.warm', async (span) => {
        span.setAttr('email.thread_id', threadId);
        span.setAttr('email.warm.queued_ms', now() - queuedAt);
        try {
          const cached = await options.warm(threadId);
          span.setAttr('email.warm.cached', cached);
          if (!cached) warmUntil.set(threadId, now() + RETRY_AFTER_MS);
        } catch (error) {
          // A background warm has no caller to report to; its span does.
          warmUntil.set(threadId, now() + RETRY_AFTER_MS);
          span.error(error);
        }
      });
    },
    { concurrency: 2, started: true }
  );
  return {
    warm(threadIds) {
      queuer.clear();
      for (const [threadId, until] of warmUntil) {
        if (until <= now()) warmUntil.delete(threadId);
      }
      for (const threadId of threadIds) {
        if (!isWarm(threadId)) queuer.addItem({ threadId, queuedAt: now() });
      }
    },
    dispose() {
      queuer.stop();
      queuer.clear();
    },
  };
}
