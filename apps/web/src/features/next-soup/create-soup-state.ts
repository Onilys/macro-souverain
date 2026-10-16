import { createSortState } from '@app/features/next-soup/create-sort-state';
import {
  type FilterID,
  SOUP_FILTERS,
} from '@app/features/next-soup/filters/configs/';
import type { FilterContext } from '@app/features/next-soup/filters/configs/base';
import {
  createPredicatesStore,
  type PredicateConfig,
} from '@app/features/next-soup/filters/filter-store/predicates-store';
import { createSelectionState } from '@app/features/next-soup/selection-state';
import { SORT_CONFIGS } from '@app/features/next-soup/soup-view/sort-options';
import { isModality } from '@core/mobile/inputModality';
import { isTouchDevice } from '@core/mobile/isTouchDevice';
import type { EntityData, WithNotification, WithSearch } from '@entity';
import type { SoupRowFamily } from '@entity/composed/list-entity/row-geometry';
import { batch, createMemo, createSignal, type JSX } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';

/**
 * Active "focus" predicates that exclude done entities. When one of these is
 * active, marking an entity done removes it from the list, so its row should
 * collapse before being removed rather than disappearing instantly.
 *
 * The inbox tabs activate `inbox` / `noise` rather than the standalone
 * `not-done` predicate (see `soup-filter-presets.ts`), so all three are
 * included here.
 */
const COLLAPSE_ON_DONE_PREDICATES: FilterID[] = ['not-done', 'inbox', 'noise'];

export type SoupEntity = WithNotification<EntityData | WithSearch<EntityData>>;

export type GroupHeaderProps = {
  group: GroupMeta;
  highlighted?: boolean;
  /** True for the header at the very top of the list (row index 0). */
  isFirst?: boolean;
  /**
   * The geometry family of the rows this header sits among, so it can line its
   * label up with their content. See SoupRowFamily.
   */
  rowFamily?: SoupRowFamily;
};

export type GroupMeta = {
  key: string;
  label: string;
  value: unknown;
  count: number;
  isExpanded: () => boolean;
  toggle: () => void;
  renderHeader?: (props: GroupHeaderProps) => JSX.Element;
};

type SoupRowBase = {
  /** Stable identity used to preserve this row's store proxy across updates. */
  identityKey: string;
  id: string;
  index: number;
  group: GroupMeta | undefined;
  getIsGrouped: () => boolean;
  getIsLoadMore: () => boolean;
  isFocused: () => boolean;
  isSelected: () => boolean;
};

export type SoupEntityRow = SoupRowBase & {
  kind: 'entity';
  original: SoupEntity;
};
export type SoupStructuralRow = SoupRowBase & {
  kind: 'group-header' | 'load-more' | 'group-status';
  original?: undefined;
};
export type SoupRow = SoupEntityRow | SoupStructuralRow;

type RowOptions = { id: string; index: number; group?: GroupMeta };
type EntityRowOptions = RowOptions & {
  kind?: 'entity';
  original: SoupEntity;
};
type StructuralRowOptions = RowOptions & {
  kind: SoupStructuralRow['kind'];
  original?: never;
};

type NavigationResult = { row: SoupRow; index: number } | undefined;

type NavigationOptions = {
  wrapNavigation?: boolean;
  skipGroupHeaders?: boolean;
  skipLoadMore?: boolean;
  skip?: (row: SoupRow) => boolean;
};

export type SortConfig<T> = {
  id: string;
  fn: (a: T, b: T) => number;
};

interface SoupContextOptions {
  initialData?: SoupEntity[];
  initialPredicates?: {
    and?: string[];
    or?: string[];
  };
  predicateConfigs?: PredicateConfig<SoupEntity, string, FilterContext>[];
  wrapNavigation?: boolean;
  skipGroupHeaders?: boolean;
}

export const createSoupState = (options: SoupContextOptions = {}) => {
  const {
    wrapNavigation,
    initialData,
    initialPredicates,
    predicateConfigs,
    skipGroupHeaders,
  } = options;

  const selection = createSelectionState<SoupEntity>({
    getItemId: (i) => i.id,
  });

  const predicates = createPredicatesStore<
    SoupEntity,
    FilterContext,
    PredicateConfig<SoupEntity, string, FilterContext>,
    string
  >({
    configs: predicateConfigs ?? SOUP_FILTERS,
    initial: initialPredicates,
  });

  const sort = createSortState(SORT_CONFIGS, ['updated_at']);

  // Tracked by index (not id) so a row id duplicated across groups highlights
  // only one occurrence. The identity key follows that row across setRows.
  const [focusedIndex, setFocusedIndex] = createSignal(-1);
  let lastFocusedRowIdentityKey: string | undefined;

  const [activeGroupId, setActiveGroupId] = createSignal<string | undefined>();

  const [collapsedGroups, setCollapsedGroups] = createSignal<Set<string>>(
    new Set()
  );

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const isGroupExpanded = (groupId: string) => !collapsedGroups().has(groupId);

  function buildRow(options: EntityRowOptions): SoupEntityRow;
  function buildRow(options: StructuralRowOptions): SoupStructuralRow;
  function buildRow(options: EntityRowOptions | StructuralRowOptions): SoupRow {
    const { id, index, group } = options;
    const kind = options.kind ?? 'entity';
    const common = {
      id,
      index,
      group,
      getIsGrouped: () => kind === 'group-header',
      getIsLoadMore: () => kind === 'load-more',
      isFocused: () => focusedIndex() === index,
    };
    if (options.kind !== undefined && options.kind !== 'entity')
      return {
        ...common,
        kind: options.kind,
        identityKey: JSON.stringify([kind, group?.key ?? null, id]),
        isSelected: () => false,
      };
    const original = options.original;
    return {
      ...common,
      kind: 'entity',
      original,
      identityKey: JSON.stringify([
        kind,
        group?.key ?? null,
        original.type,
        original.id,
        id,
      ]),
      isSelected: () => selection.isSelected(original.id),
    };
  }

  const initialRows =
    initialData?.map((e, i) => buildRow({ id: e.id, index: i, original: e })) ??
    [];
  const [rowStore, setRowStore] = createStore<SoupRow[]>(initialRows);
  // The array snapshot changes only for structural updates, while its row
  // proxies update nested entity/group fields reactively in place.
  const rows = createMemo(() => [...rowStore]);

  const setRows = (newRows: SoupRow[]) => {
    batch(() => {
      setRowStore(reconcile(newRows, { key: 'identityKey', merge: true }));

      if (lastFocusedRowIdentityKey) {
        const nextIndex = rowStore.findIndex(
          (row) => row.identityKey === lastFocusedRowIdentityKey
        );
        setFocusedIndex(nextIndex);
        if (nextIndex < 0) lastFocusedRowIdentityKey = undefined;
      }
    });
  };

  const [collapseEntityCallback, setCollapseEntityCallback] = createSignal<
    ((entityId: string) => Promise<void>) | undefined
  >(undefined);

  const indexOf = (id: string): number => rows().findIndex((r) => r.id === id);

  const focusedRow = createMemo(() => {
    const index = focusedIndex();
    if (index === -1) return undefined;
    return rows()[index];
  });

  const focusedId = createMemo(() => focusedRow()?.id);

  const focusedItem = createMemo(() => focusedRow()?.original);

  const getRow = (id: string): SoupRow | undefined =>
    rows().find((r) => r.id === id);

  const getRowAt = (index: number): SoupRow | undefined => rows()[index];

  const calculateFocusRow = (index: number): NavigationResult => {
    const allRows = rows();
    if (allRows.length === 0) return undefined;

    let targetIndex = index;
    if (targetIndex < 0) {
      targetIndex = wrapNavigation ? allRows.length - 1 : 0;
    } else if (targetIndex >= allRows.length) {
      targetIndex = wrapNavigation ? 0 : allRows.length - 1;
    }

    const row = allRows[targetIndex];
    if (!row) return undefined;

    return { row, index: targetIndex };
  };

  const setFocus = (index: number): NavigationResult => {
    if (isTouchDevice()) return;

    const result = calculateFocusRow(index);

    if (result) {
      setFocusedIndex(result.index);
      lastFocusedRowIdentityKey = result.row.identityKey;
    }

    return result;
  };

  const shouldSkipRow = (
    row: SoupRow,
    options?: NavigationOptions
  ): boolean => {
    if (row.kind === 'group-status') return true;
    if (options?.skip?.(row)) return true;
    if (row.getIsLoadMore() && options?.skipLoadMore) return true;
    if (!row.group) return false;
    if (row.getIsGrouped()) {
      return options?.skipGroupHeaders ?? !!skipGroupHeaders;
    }
    return !row.group.isExpanded();
  };

  const findNextIndex = (
    startIndex: number,
    offset: number,
    options?: NavigationOptions
  ): number => {
    const allRows = rows();
    if (allRows.length === 0) return -1;
    if (offset === 0) return startIndex;

    const direction = offset > 0 ? 1 : -1;
    let steps = Math.abs(offset);
    let cursor = startIndex;
    let lastValid = shouldSkipRow(allRows[startIndex], options)
      ? -1
      : startIndex;
    let iterations = 0;
    const maxIterations = allRows.length * steps;
    const shouldWrap = options?.wrapNavigation ?? wrapNavigation;

    while (steps > 0 && iterations < maxIterations) {
      iterations++;
      cursor += direction;

      if (cursor < 0 || cursor >= allRows.length) {
        if (!shouldWrap) break;
        cursor = (cursor + allRows.length) % allRows.length;
      }

      const row = allRows[cursor];
      if (!row) break;
      if (shouldSkipRow(row, options)) continue;

      lastValid = cursor;
      steps--;
    }

    return lastValid;
  };

  const peek = (
    offset: number,
    options?: NavigationOptions
  ): NavigationResult => {
    const current = focusedIndex();
    const allRows = rows();

    if (current === -1) {
      const startIndex = offset > 0 ? 0 : allRows.length - 1;
      const direction = offset > 0 ? 1 : -1;
      let i = startIndex;
      while (
        i >= 0 &&
        i < allRows.length &&
        shouldSkipRow(allRows[i], options)
      ) {
        i += direction;
      }
      if (i < 0 || i >= allRows.length) return;

      return calculateFocusRow(i);
    }

    const nextIndex = findNextIndex(current, offset, options);
    if (nextIndex < 0) return;

    return calculateFocusRow(nextIndex);
  };

  const navigateBy = (
    offset: number,
    options?: NavigationOptions
  ): NavigationResult => {
    const peeked = peek(offset, options);
    if (!peeked) return;

    return setFocus(peeked.index);
  };

  const clearFocus = () => {
    setFocusedIndex(-1);
    lastFocusedRowIdentityKey = undefined;
  };

  return {
    rows,
    setRows,
    buildRow,
    predicates,
    selection,
    sort,
    grouping: {
      activeGroupId,
      setActiveGroupId,
      collapsedGroups,
      isExpanded: isGroupExpanded,
      toggle: toggleGroup,
      collapseAll: (ids: string[]) => setCollapsedGroups(new Set(ids)),
      expandAll: () => setCollapsedGroups(new Set<string>()),
    },

    focus: {
      row: focusedRow,
      item: focusedItem,
      id: focusedId,
      index: focusedIndex,
      clear: clearFocus,
      set: (id: string | undefined) => {
        if (id === undefined) {
          clearFocus();
          return;
        }
        const idx = indexOf(id);
        if (idx < 0) return;
        setFocusedIndex(idx);
        lastFocusedRowIdentityKey = rows()[idx].identityKey;
      },
      setIndex: (index: number) => {
        const row = rows()[index];
        if (!row) return;
        setFocusedIndex(index);
        lastFocusedRowIdentityKey = row.identityKey;
      },
    },

    navigate: {
      down: (options?: NavigationOptions) => navigateBy(1, options),
      up: (options?: NavigationOptions) => navigateBy(-1, options),
      by: navigateBy,
      toIndex: setFocus,
      toId: (id: string) => {
        const index = indexOf(id);
        if (index === -1) return undefined;
        return setFocus(index);
      },
      toFirst: () => setFocus(0),
      toLast: () => setFocus(rows().length - 1),
      peekOffset: peek,
    },

    items: {
      rows,
      count: () => rows().length,
      get: getRow,
      at: getRowAt,
      indexOf,
    },

    collapseEntity: {
      callback: collapseEntityCallback,
      set: setCollapseEntityCallback,
      shouldCollapse: () => {
        return (
          COLLAPSE_ON_DONE_PREDICATES.some((id) => predicates.isActive(id)) &&
          collapseEntityCallback() !== undefined &&
          isModality('touch')
        );
      },
    },
  };
};

export type SoupState = ReturnType<typeof createSoupState>;
