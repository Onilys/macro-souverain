import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import {
  type Accessor,
  createMemo,
  createSignal,
  onCleanup,
  untrack,
} from 'solid-js';
import type { EntitySearchCategory } from '../queries/entity-search';

type SearchResultWindow<T> = {
  accountId: string;
  query: string;
  category: EntitySearchCategory;
  items: T[];
  /** Live rows already loaded; retained rows may also belong to later pages. */
  sourceSize: number;
};

/** Restore loaded rows in their saved order while sources refresh and page. */
export function createSearchResultWindow<T extends { id: string }>(options: {
  key: string;
  accountId: Accessor<string>;
  query: Accessor<string>;
  category: Accessor<EntitySearchCategory>;
  items: Accessor<T[]>;
  pending: Accessor<boolean>;
  discard: Accessor<boolean>;
  hasMore: Accessor<boolean>;
}) {
  const { handle } = useSplitPanelOrThrow();
  const stored = untrack(() => handle.currentEntryState()?.[options.key]) as
    | SearchResultWindow<T>
    | undefined;
  const scope = createMemo(() => ({
    accountId: options.accountId(),
    query: options.query(),
    category: options.category(),
  }));
  const [preservedScope, setPreservedScope] = createSignal(
    untrack(() => {
      const initial = scope();
      return stored?.accountId === initial.accountId &&
        stored.query === initial.query &&
        stored.category === initial.category
        ? initial
        : undefined;
    })
  );
  const window = createMemo<SearchResultWindow<T>>(
    (previous) => {
      const currentScope = scope();
      const { accountId, query, category } = currentScope;
      const items = options.items();
      const next = {
        accountId,
        query,
        category,
        items,
        sourceSize: items.length,
      };
      if (options.discard()) return next;
      if (
        previous?.accountId === accountId &&
        previous.query === query &&
        previous.category === category
      ) {
        if (
          previous.items.length > 0 &&
          (options.pending() ||
            (items.length < previous.sourceSize && options.hasMore()))
        )
          return previous;
        if (preservedScope() === currentScope) {
          const remaining = new Map(items.map((item) => [item.id, item]));
          const ordered = previous.items.flatMap((item) => {
            const updated = remaining.get(item.id);
            // An absent saved row can still belong to a later source page.
            if (!updated) return options.hasMore() ? [item] : [];
            remaining.delete(item.id);
            return [updated];
          });
          return {
            ...next,
            items: [...ordered, ...remaining.values()],
          };
        }
      }
      return next;
    },
    stored ?? {
      accountId: untrack(options.accountId),
      query: untrack(options.query),
      category: untrack(options.category),
      items: [],
      sourceSize: 0,
    }
  );
  const preserveOrder = () => setPreservedScope(scope());
  onCleanup(
    handle.registerEntryStateCaptor(options.key, () => {
      preserveOrder();
      return window();
    })
  );
  return {
    items: () => window().items,
    // Freeze before opening can update viewedAt and re-rank the live source.
    preserveOrder,
    needsMore: () =>
      !options.pending() &&
      !options.discard() &&
      options.hasMore() &&
      options.items().length < window().sourceSize,
  };
}
