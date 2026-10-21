import type { EntryState } from '@components/app/split-layout/layoutManager';
import { batch, createRoot, createSignal } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { EntitySearchCategory } from '../queries/entity-search';
import { createSearchResultWindow } from './create-search-result-window';

const history = vi.hoisted(() => ({
  state: undefined as EntryState | undefined,
  captors: new Map<string, () => unknown>(),
}));
vi.mock('@components/app/split-layout/layoutUtils', () => ({
  useSplitPanelOrThrow: () => ({
    handle: {
      currentEntryState: () => history.state,
      registerEntryStateCaptor: (key: string, read: () => unknown) => {
        history.captors.set(key, read);
        return () => history.captors.delete(key);
      },
    },
  }),
}));

type Row = { id: string; name: string };
const original: Row[] = [
  { id: 'a', name: 'First' },
  { id: 'b', name: 'Second' },
  { id: 'c', name: 'Third' },
];
const cleanups: (() => void)[] = [];
beforeEach(() => {
  history.state = undefined;
  history.captors.clear();
});
afterEach(() => {
  for (const dispose of cleanups.splice(0)) dispose();
});

function setup(
  items: Row[],
  initial: { accountId?: string; hasMore?: boolean; pending?: boolean } = {}
) {
  return createRoot((dispose) => {
    cleanups.push(dispose);
    const [accountId, setAccountId] = createSignal(
      initial.accountId ?? 'alice'
    );
    const [query, setQuery] = createSignal('notes');
    const [category, setCategory] = createSignal<EntitySearchCategory>('all');
    const [incoming, setItems] = createSignal(items);
    const [pending, setPending] = createSignal(initial.pending ?? false);
    const [hasMore, setHasMore] = createSignal(initial.hasMore ?? false);
    const [discard, setDiscard] = createSignal(false);
    const results = createSearchResultWindow({
      key: 'results',
      accountId,
      query,
      category,
      items: incoming,
      pending,
      hasMore,
      discard,
    });
    return {
      results,
      dispose,
      setAccountId,
      setQuery,
      setCategory,
      setItems,
      setPending,
      setHasMore,
      setDiscard,
    };
  });
}

it('ranks live until opening, then updates rows in place and appends later results', () => {
  const { results, setItems } = setup(original);
  setItems([original[2], original[1], original[0]]);
  expect(results.items().map((row) => row.id)).toEqual(['c', 'b', 'a']);
  results.preserveOrder();
  const updated = { id: 'c', name: 'Third, recently opened' };
  setItems([original[0], original[1], updated]);
  expect(results.items()).toEqual([updated, original[1], original[0]]);
  const added = { id: 'd', name: 'Next page' };
  setItems([added, original[0], original[1], updated]);
  expect(results.items()).toEqual([updated, original[1], original[0], added]);
  setItems([added, original[0], updated]);
  expect(results.items()).toEqual([updated, original[0], added]);
});

it('restores saved order while rebuilding a shorter first page and paging further', () => {
  const first = setup(original);
  first.results.preserveOrder();
  history.state = Object.fromEntries(
    [...history.captors].map(([key, read]) => [key, read()])
  );
  first.dispose();
  const { results, setItems } = setup([original[2]], { hasMore: true });
  expect(results.items()).toEqual(original);
  expect(results.needsMore()).toBe(true);
  const updated = { id: 'c', name: 'Recently opened' };
  setItems([updated, original[0], original[1]]);
  expect(results.items()).toEqual([original[0], original[1], updated]);
  expect(results.needsMore()).toBe(false);
  const added = { id: 'd', name: 'Later result' };
  setItems([updated, added, original[0], original[1]]);
  expect(results.items()).toEqual([original[0], original[1], updated, added]);
});

it('keeps saved rows that move beyond the refreshed page without scanning every page', () => {
  const { results, setItems, setHasMore } = setup(original, { hasMore: true });
  results.preserveOrder();
  const added = { id: 'd', name: 'New recent result' };
  setItems([added, original[2], original[0]]);
  expect(results.items()).toEqual([...original, added]);
  // The previously loaded size is rebuilt. Further pages follow user scrolling.
  expect(results.needsMore()).toBe(false);
  const updated = { id: 'c', name: 'Updated third' };
  setItems([added, updated, original[0]]);
  expect(results.items()).toEqual([original[0], original[1], updated, added]);
  setItems([added, updated, original[0], original[1]]);
  expect(results.items()).toEqual([original[0], original[1], updated, added]);
  setItems([added, updated, original[0]]);
  setHasMore(false);
  expect(results.items()).toEqual([original[0], updated, added]);
});

it('preserves the mounted list when history is captured outside a result opener', () => {
  const { results, setItems } = setup(original);
  history.state = Object.fromEntries(
    [...history.captors].map(([key, read]) => [key, read()])
  );
  setItems([original[2], original[0], original[1]]);
  expect(results.items()).toEqual(original);
});

it('restores the source refill size without counting retained rows as extra loaded pages', () => {
  const first = setup(original, { hasMore: true });
  first.results.preserveOrder();
  const added = { id: 'd', name: 'New recent result' };
  first.setItems([added, original[2], original[0]]);
  expect(first.results.items()).toEqual([...original, added]);
  history.state = Object.fromEntries(
    [...history.captors].map(([key, read]) => [key, read()])
  );
  first.dispose();
  const second = setup([added, original[2], original[0]], { hasMore: true });
  expect(second.results.items()).toEqual([...original, added]);
  expect(second.results.needsMore()).toBe(false);
  const next = { id: 'e', name: 'Next page' };
  second.setItems([added, original[2], original[0], next]);
  expect(second.results.items()).toEqual([...original, added, next]);
  expect(second.results.needsMore()).toBe(false);
});

it('ranks new queries and categories afresh, including revisiting an earlier query', () => {
  const { results, setItems, setQuery, setCategory } = setup(original);
  results.preserveOrder();
  setItems([original[2], original[1], original[0]]);
  expect(results.items()).toEqual(original);
  setQuery('different');
  expect(results.items().map((row) => row.id)).toEqual(['c', 'b', 'a']);
  setItems(original);
  expect(results.items()).toEqual(original);
  batch(() => {
    setCategory('email');
    setItems([original[2], original[0], original[1]]);
  });
  expect(results.items().map((row) => row.id)).toEqual(['c', 'a', 'b']);
  batch(() => {
    setQuery('notes');
    setCategory('all');
    setItems([original[1], original[0], original[2]]);
  });
  expect(results.items().map((row) => row.id)).toEqual(['b', 'a', 'c']);
  setItems(original);
  expect(results.items()).toEqual(original);
});

it('discards saved rows on authoritative failure and accepts successful empty results', () => {
  const { results, setItems, setPending, setHasMore, setDiscard } =
    setup(original);
  results.preserveOrder();
  batch(() => {
    setPending(true);
    setHasMore(true);
    setItems([original[2]]);
  });
  expect(results.items()).toEqual(original);
  setDiscard(true);
  expect(results.items()).toEqual([original[2]]);
  batch(() => {
    setDiscard(false);
    setPending(false);
    setHasMore(false);
    setItems([]);
  });
  expect(results.items()).toEqual([]);
});

it('drops the previous account window while the next account is loading', () => {
  const { results, setAccountId, setItems, setPending, setHasMore } =
    setup(original);
  results.preserveOrder();
  batch(() => {
    setAccountId('bob');
    setPending(true);
    setHasMore(true);
    setItems([]);
  });
  expect(results.items()).toEqual([]);
  expect(results.needsMore()).toBe(false);
  batch(() => {
    setItems([original[2], original[0]]);
    setPending(false);
  });
  expect(results.items()).toEqual([original[2], original[0]]);
});

it('ignores another account snapshot when remounting a history entry', () => {
  const first = setup(original);
  history.state = Object.fromEntries(
    [...history.captors].map(([key, read]) => [key, read()])
  );
  first.dispose();
  const { results, setItems, setPending } = setup([], {
    accountId: 'bob',
    hasMore: true,
    pending: true,
  });
  expect(results.items()).toEqual([]);
  expect(results.needsMore()).toBe(false);
  batch(() => {
    setItems([original[2], original[0]]);
    setPending(false);
  });
  expect(results.items()).toEqual([original[2], original[0]]);
});
