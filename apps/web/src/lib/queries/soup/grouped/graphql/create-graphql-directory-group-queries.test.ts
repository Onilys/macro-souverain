import { authKeys } from '@queries/auth/keys';
import { hideGraphqlSoupEntitiesAsDone } from '@queries/soup/graphql/optimistic-done';
import type { SoupAstBody } from '@queries/soup/items';
import {
  type Client,
  CombinedError,
  type GraphQLRequest,
  type Operation,
  type OperationContext,
  type OperationResult,
} from '@urql/core';
import { createMemo, createRoot, createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeSubject, onEnd, pipe } from 'wonka';

vi.mock('@core/context/user', () => ({
  useUserId: () => () => 'macro|test@example.com',
}));

const getGraphqlSoupClientMock = vi.hoisted(() => vi.fn());
const mapGraphqlGroupedSoupPageMock = vi.hoisted(() =>
  vi.fn((data: { page: unknown }) => data.page)
);

vi.mock('@macro-inc/observability', () => ({
  Telemetry: { error: vi.fn() },
}));

vi.mock('@queries/soup/grouped/api', () => ({
  makeGroupComparator: () => (left: { key: string }, right: { key: string }) =>
    left.key.localeCompare(right.key),
  resolveGroupMetaForKey: (_field: unknown, key: string) => ({
    key,
    label: key,
    displayOrder: null,
  }),
}));

vi.mock('@queries/storage/instructions-md', () => ({
  useInstructionsMdIdQuery: vi.fn(() => ({})),
}));

vi.mock('@queries/soup/transform-utils', () => ({
  isDisplayableSoupItem: () => true,
  isInstructionsMdDoc: () => false,
  mapApiSoupItemToEntity: (item: unknown) => item,
  mapSoupPageToEntityList: (page: { items: unknown[] }) => page.items,
}));

vi.mock('@service-storage/graphql-soup', () => ({
  getGraphqlSoupClient: getGraphqlSoupClientMock,
  mapGraphqlGroupedSoupPage: mapGraphqlGroupedSoupPageMock,
  mapGraphqlSoupItem: (item: unknown) => item,
}));

vi.mock('@queries/client', async () => {
  const { QueryClient } = await import('@tanstack/solid-query');
  return { queryClient: new QueryClient() };
});

import { queryClient } from '@queries/client';
import { getActiveGraphqlSoupRevalidations } from '@queries/soup/graphql/active-queries';
import { createGraphqlSoupGroupDirectoryQuery } from '@queries/soup/graphql/group-directory';
import { groupedSoupLogicalViewKey } from '@queries/soup/grouped/graphql-operation-registry';
import type { GroupMeta } from '@queries/soup/grouped/types';
import type { GroupSoupQueryVariables } from '@service-storage/graphql/generated/graphql';
import { createGraphqlDirectoryGroupQueries } from './create-graphql-directory-group-queries';

type TestItem = { id: string; name: string };
type TestPage = {
  items: Record<string, TestItem>;
  groups: Array<
    Pick<GroupMeta, 'key' | 'totalCount' | 'itemIds' | 'nextCursor'>
  >;
};

type FakeExecution = {
  variables: GroupSoupQueryVariables;
  policy: OperationContext['requestPolicy'];
  next(
    page: TestPage,
    state?: Partial<Pick<OperationResult, 'hasNext' | 'stale'>>
  ): void;
  fail(error: CombinedError): void;
  readonly unsubscribed: boolean;
};

function makeFakeClient(): {
  client: Client;
  executions: FakeExecution[];
} {
  const executions: FakeExecution[] = [];
  const execute = (
    request: GraphQLRequest<unknown, GroupSoupQueryVariables>,
    context: Partial<OperationContext>
  ) => {
    const subject =
      makeSubject<OperationResult<unknown, GroupSoupQueryVariables>>();
    let unsubscribed = false;
    const operation = {
      kind: 'query',
      context,
    } as Operation<unknown, GroupSoupQueryVariables>;
    executions.push({
      variables: request.variables,
      policy: context.requestPolicy ?? 'cache-first',
      next: (page, state) =>
        subject.next({
          operation,
          data: {
            page,
            user: {
              id: 'macro|test@example.com',
              groupSoup: {
                bins: page.groups.map((group) => ({
                  ...group,
                  items: group.itemIds.map((id) => page.items[id]),
                })),
              },
              groupSoupDirectory: page.groups.map((group) => ({
                key: group.key,
                totalCount: group.totalCount,
                label: group.key,
                displayOrder: null,
              })),
            },
          },
          ...state,
        } as OperationResult<unknown, GroupSoupQueryVariables>),
      fail: (error) =>
        subject.next({ operation, error, stale: false, hasNext: false }),
      get unsubscribed() {
        return unsubscribed;
      },
    });
    return pipe(
      subject.source,
      onEnd(() => {
        unsubscribed = true;
      })
    );
  };

  return {
    executions,
    client: {
      executeQuery: execute,
    } as unknown as Client,
  };
}

const item = (id: string): TestItem => ({ id, name: id });
const group = (
  key: string,
  itemIds: string[],
  nextCursor: string | null
): TestPage['groups'][number] => ({
  key,
  totalCount: itemIds.length,
  itemIds,
  nextCursor,
});
const page = (groups: TestPage['groups'], items: TestItem[]): TestPage => ({
  groups,
  items: Object.fromEntries(items.map((entry) => [entry.id, entry])),
});
const entityIds = (query: {
  data: () => { entities: Array<{ id: string }> } | undefined;
}) => query.data()?.entities.map((entity) => entity.id);

const disposals: Array<() => void> = [];
afterEach(() => {
  for (const dispose of disposals.splice(0)) dispose();
});

beforeEach(() => {
  queryClient.clear();
  queryClient.setQueryData(authKeys.userInfo.queryKey, {
    userId: 'macro|test@example.com',
    authenticated: true,
  });
  vi.clearAllMocks();
});

function setup(
  initialBody: SoupAstBody = {},
  initiallyPaused = false,
  keepPreviousData = false
) {
  const [body, setBody] = createSignal(initialBody);
  const [paused, setPaused] = createSignal(initiallyPaused);
  const fake = makeFakeClient();
  getGraphqlSoupClientMock.mockReturnValue(fake.client);

  let grouped!: ReturnType<typeof createGraphqlDirectoryGroupQueries>;
  let parent!: ReturnType<typeof createGraphqlSoupGroupDirectoryQuery>;
  const dispose = createRoot((rootDispose) => {
    parent = createGraphqlSoupGroupDirectoryQuery(
      () => ({
        params: { limit: 2, sort_method: 'updated_at' },
        body: body(),
        groupBy: {
          type: 'property',
          propertyDefinitionId: 'status-definition',
        },
      }),
      () => ({ enabled: true, networkPaused: paused(), keepPreviousData })
    );
    const initialPage = createMemo(() => {
      if (parent.isPlaceholderData()) return;
      const data = parent.data();
      if (!data?.groups || !data.itemsById) return;
      return { groups: data.groups, items: data.itemsById };
    });

    grouped = createGraphqlDirectoryGroupQueries({
      initialPage,
      groupByField: () => ({
        type: 'property',
        propertyDefinitionId: 'status-definition',
      }),
      soupParams: () => ({ limit: 2, sort_method: 'updated_at' }),
      soupBody: body,
      enabled: () => true,
      networkPaused: paused,
      itemFilter: () => undefined,
    });

    return rootDispose;
  });
  disposals.push(dispose);

  return { fake, grouped, parent, setPaused, setBody, dispose };
}

describe('lazy GraphQL group pages', () => {
  it('does not treat retained directory metadata as current after filters change', () => {
    const { fake, parent, grouped, setBody } = setup({}, false, true);
    fake.executions[0].next(page([group('a', [], null)], []));
    setBody({ df: { l: { ns: 'unseen' } } });
    expect(parent.isPlaceholderData()).toBe(true);
    expect(grouped.list()).toEqual([]);
    fake.executions[1].fail(
      new CombinedError({ networkError: new Error('offline') })
    );
    expect(parent.error()).toBeTruthy();
    expect(parent.isPlaceholderData()).toBe(true);
    fake.executions[1].next(page([group('b', [], null)], []));
    expect(parent.error()).toBeUndefined();
    expect(parent.isPlaceholderData()).toBe(false);
    expect(grouped.list().map((query) => query.key)).toEqual(['b']);
  });

  it('keeps an empty directory after a response-free refresh failure but exposes server errors', () => {
    const { fake, parent } = setup();
    fake.executions[0].next(page([], []));
    fake.executions[0].fail(
      new CombinedError({ networkError: new Error('offline') })
    );
    expect(parent.error()).toBeUndefined();
    expect(parent.data()?.groups).toEqual([]);
    fake.executions[0].fail(
      new CombinedError({ graphQLErrors: [new Error('forbidden')] })
    );
    expect(parent.error()).toBeTruthy();
  });

  it('retains cached group rows after background failure but surfaces pagination failure', async () => {
    const { fake, grouped } = setup();
    fake.executions[0].next(page([group('a', [], null)], []));
    const a = grouped.map().get('a')!;
    const loading = a.fetchNextPage();
    fake.executions[1].next(page([group('a', ['a-1'], 'next')], [item('a-1')]));
    await loading;
    fake.executions[1].fail(
      new CombinedError({ networkError: new Error('offline') })
    );
    expect(entityIds(a)).toEqual(['a-1']);
    expect(a.error()).toBeNull();
    // A successful background recovery leaves the existing cursor available.
    fake.executions[1].next(page([group('a', ['a-1'], 'next')], [item('a-1')]));
    const next = a.fetchNextPage();
    const failed = expect(next).rejects.toThrow('offline');
    fake.executions[2].fail(
      new CombinedError({ networkError: new Error('offline') })
    );
    await failed;
    expect(a.error()).toBeTruthy();
    expect(entityIds(a)).toEqual(['a-1']);
  });

  it('preserves row identity while a live record is edited', async () => {
    const { fake, grouped } = setup();
    const [record, setRecord] = createStore(item('a-1'));
    fake.executions[0].next(page([group('a', [], null)], []));
    const a = grouped.map().get('a')!;
    const loading = a.fetchNextPage();
    fake.executions[1].next(page([group('a', ['a-1'], null)], [record]));
    await loading;
    const first = a.data()!.entities[0];
    setRecord('name', 'Edited');
    expect(a.data()!.entities[0]).toBe(first);
    expect(first.name).toBe('Edited');
  });

  it('reads cached starts while paused and resumes the waiting demand without losing rows', async () => {
    const { fake, grouped, setPaused } = setup({}, true);
    fake.executions[0].next(page([group('a', [], null)], []));
    const a = grouped.map().get('a')!;
    const loading = a.fetchNextPage();
    expect(fake.executions[1].policy).toBe('cache-only');
    fake.executions[1].next(page([group('a', ['a-1'], 'next')], [item('a-1')]));
    let completed = false;
    const completion = (async () => {
      await loading;
      completed = true;
    })();
    await Promise.resolve();
    expect(completed).toBe(false);
    expect(entityIds(a)).toEqual(['a-1']);
    expect(getActiveGraphqlSoupRevalidations()).toHaveLength(0);

    setPaused(false);
    const resumed = fake.executions
      .filter((execution) => execution.variables.input.startGroup)
      .at(-1)!;
    expect(resumed.policy).toBe('cache-first');
    expect(entityIds(a)).toEqual(['a-1']);
    resumed.next(page([group('a', ['a-1'], 'next')], [item('a-1')]));
    await completion;
    expect(completed).toBe(true);
  });

  it('settles paused demand when the group is disposed', async () => {
    const { fake, grouped, dispose } = setup({}, true);
    fake.executions[0].next(page([group('a', [], null)], []));
    const a = grouped.map().get('a')!;
    const loading = a.fetchNextPage();
    fake.executions[1].next(page([group('a', ['a-1'], 'next')], [item('a-1')]));
    await Promise.resolve();
    dispose();
    await loading;
    expect(fake.executions).toHaveLength(2);
  });

  it('discovers metadata without fetching entities and starts only the requested group', async () => {
    const { fake, grouped } = setup();
    fake.executions[0].next(
      page([group('a', [], null), group('b', [], null)], [])
    );
    expect(fake.executions).toHaveLength(1);
    const a = grouped.map().get('a')!;
    expect(a.hasNextPage()).toBe(true);
    expect(a.data()).toBeUndefined();
    const loading = a.fetchNextPage();
    expect(fake.executions[1].variables.input.startGroup?.groupKey).toBe('a');
    fake.executions[1].next(page([group('a', ['a-1'], 'next')], [item('a-1')]));
    await loading;
    expect(entityIds(a)).toEqual(['a-1']);
    expect(grouped.map().get('b')!.data()).toBeUndefined();
    const next = a.fetchNextPage();
    fake.executions[2].next(page([group('a', ['a-2'], null)], [item('a-2')]));
    await next;
    expect(entityIds(a)).toEqual(['a-1', 'a-2']);
    expect(a.hasNextPage()).toBe(false);
  });

  it('hides pending done entities from every loaded page and restores them on undo', async () => {
    const { fake, grouped } = setup({ df: { l: { ns: 'unseen' } } });
    fake.executions[0].next(page([group('a', [], null)], []));
    const a = grouped.map().get('a')!;
    const first = a.fetchNextPage();
    fake.executions[1].next(page([group('a', ['a-1'], 'next')], [item('a-1')]));
    await first;
    const next = a.fetchNextPage();
    fake.executions[2].next(page([group('a', ['a-2'], null)], [item('a-2')]));
    await next;
    const overlay = hideGraphqlSoupEntitiesAsDone({
      entityIds: ['a-1', 'a-2'],
      notificationIds: [],
    });
    await vi.waitFor(() => expect(entityIds(a)).toEqual([]));
    overlay.release();
    await vi.waitFor(() => expect(entityIds(a)).toEqual(['a-1', 'a-2']));
  });

  it('coalesces concurrent starts and treats an empty group as exhausted', async () => {
    const { fake, grouped } = setup();
    fake.executions[0].next(page([group('a', [], null)], []));
    const a = grouped.map().get('a')!;
    const first = a.fetchNextPage();
    const second = a.fetchNextPage();
    expect(fake.executions).toHaveLength(2);
    fake.executions[1].next(page([], []));
    await Promise.all([first, second]);
    expect(a.hasNextPage()).toBe(false);
    expect(entityIds(a)).toEqual([]);
  });

  it('retains loaded pages when directory counts refresh', async () => {
    const { fake, grouped } = setup();
    fake.executions[0].next(page([group('a', [], null)], []));
    const a = grouped.map().get('a')!;
    const first = a.fetchNextPage();
    fake.executions[1].next(page([group('a', ['a-1'], 'next')], [item('a-1')]));
    await first;
    const next = a.fetchNextPage();
    fake.executions[2].next(page([group('a', ['a-2'], null)], [item('a-2')]));
    await next;
    fake.executions[0].next(
      page([{ ...group('a', [], null), totalCount: 200 }], [])
    );
    expect(grouped.map().get('a')).toBe(a);
    expect(entityIds(a)).toEqual(['a-1', 'a-2']);
  });

  it('exposes first-page errors and retries without fetching other groups', async () => {
    const { fake, grouped } = setup();
    fake.executions[0].next(page([group('a', [], null)], []));
    const a = grouped.map().get('a')!;
    const first = a.fetchNextPage();
    const rejected = expect(first).rejects.toThrow('offline');
    fake.executions[1].fail(
      new CombinedError({ networkError: new Error('offline') })
    );
    await rejected;
    expect(a.error()).toBeTruthy();
    const retry = a.fetchNextPage();
    fake.executions
      .at(-1)!
      .next(page([group('a', ['a-1'], null)], [item('a-1')]));
    await retry;
    expect(entityIds(a)).toEqual(['a-1']);
  });

  it('registers loaded starts and continuations and disposes them with the view', async () => {
    const { fake, grouped } = setup();
    fake.executions[0].next(page([group('a', [], null)], []));
    const a = grouped.map().get('a')!;
    const first = a.fetchNextPage();
    fake.executions[1].next(page([group('a', ['a-1'], 'next')], [item('a-1')]));
    await first;
    const next = a.fetchNextPage();
    fake.executions[2].next(page([group('a', ['a-2'], null)], [item('a-2')]));
    await next;
    const start = fake.executions[1].variables.input;
    const continuation = fake.executions[2].variables.input;
    expect(groupedSoupLogicalViewKey(start)).toBe(
      groupedSoupLogicalViewKey(continuation)
    );
    expect(getActiveGraphqlSoupRevalidations()).toHaveLength(3);
    grouped.resetToInitialPage();
    expect(getActiveGraphqlSoupRevalidations()).toHaveLength(1);
    expect(groupedSoupLogicalViewKey(start)).toBeUndefined();
    expect(grouped.map().get('a')!.data()).toBeUndefined();
  });
});
