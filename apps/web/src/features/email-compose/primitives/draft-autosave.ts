import { debounce } from '@solid-primitives/scheduled';
import { createSignal, onCleanup } from 'solid-js';

/** Capture live editor values before queuing; each write sees the preceding draft ID. */
export function createDraftAutosave<Snapshot, Result>(options: {
  capture(): Snapshot;
  persist(snapshot: Snapshot): Promise<Result>;
  /** Runs immediately on edits; network debounce never delays local durability. */
  saveLocalSnapshot?(snapshot: Snapshot): Promise<void>;
  paused(): boolean;
  onError?(error: unknown): void;
  onLocalError?(error: unknown): void;
  onLocalSaved?(): void;
}) {
  let pending: { snapshot: Snapshot } | undefined;
  let queue: Promise<Result | undefined> = Promise.resolve(undefined);
  let localWrites: Promise<void> = Promise.resolve();
  let newestSnapshot = 0;
  const [inputIdle, setInputIdle] = createSignal(true);
  const [shouldAcknowledge, setShouldAcknowledge] = createSignal(true);
  const [localSaveState, setLocalSaveState] = createSignal<
    'saving' | 'saved' | 'failed'
  >('saved');
  const flushLocal = async () => {
    for (;;) {
      const pending = localWrites;
      await pending;
      if (pending === localWrites) return;
    }
  };
  const saveLocally = (snapshot: Snapshot) => {
    const revision = ++newestSnapshot;
    setLocalSaveState('saving');
    const writeNewestSnapshot = async () => {
      // Coalesce snapshots waiting behind a slow file write. An already
      // running write finishes before the newest snapshot can replace it.
      if (revision !== newestSnapshot) return;
      try {
        await options.saveLocalSnapshot?.(snapshot);
        if (revision === newestSnapshot) {
          setLocalSaveState('saved');
          options.onLocalSaved?.();
        }
      } catch (error) {
        if (revision === newestSnapshot) setLocalSaveState('failed');
        options.onLocalError?.(error);
        throw error;
      }
    };
    // A failed disk write must not prevent the next edit from trying again.
    const settleLocalWritesHandler0 = writeNewestSnapshot;
    const settleLocalWritesHandler1 = writeNewestSnapshot;
    const settleLocalWrites = async () => {
      try {
        await localWrites;
      } catch {
        return await settleLocalWritesHandler0();
      }
      return await settleLocalWritesHandler1();
    };
    localWrites = settleLocalWrites();
    return flushLocal();
  };
  const cancel = () => {
    scheduled.clear();
    pending = undefined;
    setInputIdle(true);
  };
  const enqueue = (snapshot: Snapshot, local: Promise<void>) => {
    const write = async () => {
      await local;
      return await options.persist(snapshot);
    };
    const settleQueueHandler0 = write;
    const settleQueueHandler1 = write;
    const settleQueue = async () => {
      try {
        await queue;
      } catch {
        return await settleQueueHandler0();
      }
      return await settleQueueHandler1();
    };
    queue = settleQueue();
    return queue;
  };
  const save = (
    snapshot = options.capture(),
    saveOptions: { acknowledge?: boolean } = {}
  ) => {
    setShouldAcknowledge(saveOptions.acknowledge !== false);
    cancel();
    return enqueue(snapshot, saveLocally(snapshot));
  };
  const scheduled = debounce(() => {
    setInputIdle(true);
    if (options.paused()) return;

    const settleSave = async () => {
      try {
        return await save();
      } catch (settleSaveError) {
        const error = settleSaveError;
        return await options.onError?.(error);
      }
    };
    void settleSave();
  }, 500);
  onCleanup(() => {
    const flush = pending;
    cancel();
    // Reading the live thread/editor here can reenter Solid's disposal of
    // that same view. The last edit already captured and queued its local copy.

    const settleEnqueue = async (snapshot: Snapshot) => {
      try {
        return await enqueue(snapshot, flushLocal());
      } catch (settleEnqueueError) {
        const error = settleEnqueueError;
        return await options.onError?.(error);
      }
    };
    if (flush && !options.paused()) void settleEnqueue(flush.snapshot);
  });
  return {
    save,
    cancel,
    settled: () => queue,
    flushLocal,
    localSaveState,
    acknowledgeSaved: () => inputIdle() && shouldAcknowledge(),
    schedule() {
      if (options.paused()) return;
      setShouldAcknowledge(true);
      setInputIdle(false);
      const snapshot = options.capture();
      pending = { snapshot };

      const settleSaveLocally = async () => {
        try {
          return await saveLocally(snapshot);
        } catch (settleSaveLocallyError) {
          const error = settleSaveLocallyError;
          return await options.onError?.(error);
        }
      };
      void settleSaveLocally();
      scheduled();
    },
  };
}
