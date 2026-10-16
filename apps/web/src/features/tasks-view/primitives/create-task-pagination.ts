import { type Accessor, createMemo, createSignal, onCleanup } from 'solid-js';

/** Viewport demands coalesce by group; failed demand waits for explicit retry. */
export function createTaskPagination(options: {
  identity: Accessor<string>;
  error: (columnId?: string) => unknown;
  load: (columnId: string | undefined, retry: boolean) => Promise<void>;
}) {
  const requests = createMemo(() => {
    options.identity();
    return createSignal({
      pending: new Set<string | undefined>(),
      failed: new Set<string | undefined>(),
    });
  });
  let disposed = false;
  onCleanup(() => {
    disposed = true;
  });
  const isLoading = (key?: string) => requests()[0]().pending.has(key);
  const error = (key?: string) =>
    requests()[0]().failed.has(key) || !!options.error(key);

  const load = async (key?: string, retry = false) => {
    if (disposed || isLoading(key) || (!retry && error(key))) return;
    const scope = requests();
    const [state, setState] = scope;
    const failed = new Set(state().failed);
    failed.delete(key);
    setState({
      pending: new Set([...state().pending, key]),
      failed,
    });
    try {
      await options.load(key, retry);
      if (options.error(key)) throw new Error('Could not load tasks');
    } catch {
      if (!disposed && requests() === scope)
        setState((state) => ({
          ...state,
          failed: new Set([...state.failed, key]),
        }));
    } finally {
      if (!disposed && requests() === scope)
        setState((state) => ({
          ...state,
          pending: new Set([...state.pending].filter((value) => value !== key)),
        }));
    }
  };
  return { load, isLoading, error };
}
