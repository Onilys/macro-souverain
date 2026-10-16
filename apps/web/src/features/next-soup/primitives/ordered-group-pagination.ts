import { until } from '@solid-primitives/promise';
import { type Accessor, createMemo, createSignal, onCleanup } from 'solid-js';

export type OrderedGroupSource = {
  key: string;
  hasMore: Accessor<boolean>;
  isLoading: Accessor<boolean>;
  error: Accessor<Error | null>;
  load: () => Promise<void>;
};

/** One ordered stream, with retained groups when earlier groups are re-expanded. */
export function createOrderedGroupPagination(options: {
  identity: Accessor<string>;
  groups: Accessor<readonly OrderedGroupSource[]>;
  isExpanded: (key: string) => boolean;
}) {
  const [revealed, setRevealed] = createSignal<{
    identity: string;
    keys: Set<string>;
  }>({ identity: options.identity(), keys: new Set() });
  const [failures, setFailures] = createSignal<{
    identity: string;
    values: Map<string, Error>;
  }>({ identity: options.identity(), values: new Map() });
  const [loading, setLoading] = createSignal<string>();
  const [generation, setGeneration] = createSignal(0);
  const [disposed, setDisposed] = createSignal(false);
  onCleanup(() => setDisposed(true));
  let pending: Promise<void> | undefined;
  const visible = createMemo(() => {
    const groups = options.groups();
    const retained =
      revealed().identity === options.identity()
        ? revealed().keys
        : new Set<string>();
    let end = -1;
    for (let i = 0; i < groups.length; i++)
      if (retained.has(groups[i].key)) end = i;
    // Discover headers through collapsed/exhausted groups, stopping at the first gap.
    let index = 0;
    for (; index < groups.length; index++) {
      const group = groups[index];
      if (options.isExpanded(group.key) && group.hasMore()) break;
    }
    end = Math.max(end, Math.min(index, groups.length - 1));
    return groups.slice(0, end + 1);
  });
  const error = (key: string) =>
    (failures().identity === options.identity()
      ? failures().values.get(key)
      : undefined) ??
    options
      .groups()
      .find((group) => group.key === key)
      ?.error() ??
    null;
  const load = (key: string, retry = false): Promise<void> => {
    if (pending) return pending;
    const group = visible().find((group) => group.key === key);
    if (
      !group ||
      disposed() ||
      !options.isExpanded(key) ||
      !group.hasMore() ||
      (!retry && error(key))
    )
      return Promise.resolve();
    const identity = options.identity();
    const requestGeneration = generation();
    const isCurrent = () =>
      !disposed() &&
      identity === options.identity() &&
      requestGeneration === generation();
    setRevealed({
      identity,
      keys: new Set(visible().map((entry) => entry.key)),
    });
    setLoading(key);
    if (retry)
      setFailures((state) => ({
        identity,
        values: new Map(
          [...state.values].filter(([failedKey]) => failedKey !== key)
        ),
      }));
    const action = async () => {
      try {
        // Background refreshes also own the group's query. Boundary navigation
        // must await them instead of repeatedly awaiting a resolved no-op.
        if (group.isLoading())
          await until(
            () => !group.isLoading() || !isCurrent() || !options.isExpanded(key)
          );
        if (
          !isCurrent() ||
          !options.isExpanded(key) ||
          !group.hasMore() ||
          (!retry && error(key))
        )
          return;
        await group.load();
      } catch (cause) {
        if (isCurrent())
          setFailures((state) => ({
            identity,
            values: new Map([
              ...(state.identity === identity ? state.values : []),
              [key, cause instanceof Error ? cause : new Error(String(cause))],
            ]),
          }));
      }
    };
    const settle = async (request: Promise<void>) => {
      try {
        await request;
      } finally {
        if (requestGeneration === generation()) {
          pending = undefined;
          setLoading(undefined);
        }
      }
    };
    pending = settle(action());
    return pending;
  };
  return {
    visible,
    retain: () =>
      setRevealed({
        identity: options.identity(),
        keys: new Set(visible().map((entry) => entry.key)),
      }),
    error,
    isLoading: (key: string) =>
      loading() === key ||
      options
        .groups()
        .find((group) => group.key === key)
        ?.isLoading() === true,
    load,
    reset: () => {
      setGeneration((value) => value + 1);
      pending = undefined;
      setLoading(undefined);
      setRevealed({ identity: options.identity(), keys: new Set() });
      setFailures({ identity: options.identity(), values: new Map() });
    },
  };
}
