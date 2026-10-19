import { fireAndForget } from '@core/util/fireAndForget';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { render } from 'solid-js/web';
import { SoupList } from '../components/soup-list';
import type { GroupMeta, SoupRow } from '../create-soup-state';
import { createOrderedGroupPagination } from '../primitives/ordered-group-pagination';

function Fixture() {
  const [collapsed, setCollapsed] = createSignal(new Set<string>());
  const [failNext, setFailNext] = createSignal(false);
  const [requests, setRequests] = createSignal<string[]>([]);
  const [height, setHeight] = createSignal(240);
  const [scrollOffset, setScrollOffset] = createSignal(0);
  const touch = window.matchMedia('(pointer: coarse)').matches;
  const groups = ['a', 'b', 'c'].map((key) => {
    const [count, setCount] = createSignal(0);
    const [loading, setLoading] = createSignal(false);
    return {
      key,
      count,
      hasMore: () => count() < 30,
      isLoading: loading,
      error: () => null,
      load: async () => {
        setLoading(true);
        setRequests((previous) => [...previous, key]);
        await Promise.resolve();
        try {
          if (failNext()) {
            setFailNext(false);
            throw new Error('fixture failure');
          }
          setCount((previous) => Math.min(30, previous + 5));
        } finally {
          setLoading(false);
        }
      },
    };
  });
  const pagination = createOrderedGroupPagination({
    identity: () => 'fixture',
    groups: () => groups,
    isExpanded: (key) => !collapsed().has(key),
  });
  const toggle = (key: string) => {
    pagination.retain();
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const rows = createMemo(() => {
    const result: SoupRow[] = [];
    for (const source of pagination.visible()) {
      const group: GroupMeta = {
        key: source.key,
        label: source.key,
        value: source.key,
        count: 30,
        isExpanded: () => !collapsed().has(source.key),
        toggle: () => toggle(source.key),
      };
      const common = (id: string) => ({
        id,
        identityKey: id,
        index: result.length,
        group,
        isSelected: () => false,
        isFocused: () => false,
        getIsGrouped: () => false,
        getIsLoadMore: () => false,
      });
      result.push({
        ...common(`header:${source.key}`),
        kind: 'group-header',
        getIsGrouped: () => true,
      });
      if (!group.isExpanded()) continue;
      for (
        let i = 0;
        i < groups.find((candidate) => candidate.key === source.key)!.count();
        i++
      ) {
        const id = `${source.key}:${i}`;
        result.push({
          ...common(id),
          kind: 'entity',
          original: {
            id,
            type: 'document',
            name: id,
            ownerId: 'test',
            updatedAt: new Date(),
          },
        });
      }
      if (source.hasMore())
        result.push({
          ...common(`status:${source.key}`),
          kind: 'group-status',
        });
    }
    return result;
  });
  return (
    <>
      <For each={groups}>
        {(group) => (
          <button onClick={() => toggle(group.key)}>Toggle {group.key}</button>
        )}
      </For>
      <button onClick={() => setFailNext(true)}>Fail next</button>
      <button onClick={() => setHeight(480)}>Grow viewport</button>
      <output data-testid="requests">{requests().join(',')}</output>
      <output data-testid="scroll-offset">{scrollOffset()}</output>
      <output data-testid="groups">
        {pagination
          .visible()
          .map((group) => group.key)
          .join(',')}
      </output>
      <div style={{ height: `${height()}px`, width: 'min(500px, 100%)' }}>
        <SoupList
          touch={touch}
          onScrollOffsetChange={setScrollOffset}
          rows={rows()}
          itemSize={40}
          onGroupBoundary={(key) => {
            fireAndForget(pagination.load(key), 'pagination-browser-fixture');
          }}
          groupIsLoading={pagination.isLoading}
          groupError={pagination.error}
        >
          {(row) => (
            <div class="fixture-row" data-row={row.id}>
              <Show when={row.kind === 'group-status'} fallback={row.id}>
                <Show
                  when={pagination.error(row.group!.key)}
                  fallback="Loading..."
                >
                  <button
                    onClick={() => {
                      fireAndForget(
                        pagination.load(row.group!.key, true),
                        'pagination-browser-fixture'
                      );
                    }}
                  >
                    Retry
                  </button>
                </Show>
              </Show>
            </div>
          )}
        </SoupList>
      </div>
    </>
  );
}
render(() => <Fixture />, document.getElementById('root')!);
