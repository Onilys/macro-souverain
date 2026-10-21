import {
  type Client,
  type GraphQLRequest,
  makeOperation,
  type OperationContext,
  type OperationResult,
} from '@urql/core';
import { createRoot, createSignal } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeSubject } from 'wonka';
import { createNoopCacheHost } from '../../../graphql-cache/host/noop-host';
import type {
  CacheChangeListener,
  CacheHost,
} from '../../../graphql-cache/host/types';
import {
  type EntityFilterCacheArgs,
  type EntityFilterCacheResult,
  type LiveQueryUpdate,
  parseCacheRevision,
} from '../../../graphql-cache/protocol';
import type {
  GroupedSoupInput,
  GroupSoupQuery,
  GroupSoupQueryVariables,
  SoupItemFieldsFragment,
} from '../../../service-clients/service-storage/graphql/generated/graphql';
import { createGroupedSoupLiveQuery } from './create-grouped-soup-live-query';
import { groupedDocument } from './grouped-test-fixtures';
import { soupItemKey } from './reconciliation';

const mocks = vi.hoisted(() => ({ host: vi.fn(), client: vi.fn() }));
vi.mock('../../../service-clients/service-storage/graphql-soup', () => ({
  getGraphqlSoupCacheHost: mocks.host,
  getGraphqlSoupClient: mocks.client,
}));
vi.mock('@macro-inc/observability', () => ({
  Telemetry: {
    span: () => ({ setAttr: vi.fn(), end: vi.fn() }),
    error: vi.fn(),
  },
}));

const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.splice(0).forEach((dispose) => dispose());
});

function setup() {
  const executions: Array<{
    variables: GroupSoupQueryVariables;
    publish(
      data: GroupSoupQuery,
      persistence?: Promise<string | undefined>,
      source?:
        | 'live-network'
        | 'normalized-cache-hit'
        | 'normalized-cache-patch'
    ): void;
  }> = [];
  const client = {
    executeQuery(
      request: GraphQLRequest<GroupSoupQuery, GroupSoupQueryVariables>,
      context: Partial<OperationContext>
    ) {
      const subject =
        makeSubject<OperationResult<GroupSoupQuery, GroupSoupQueryVariables>>();
      const operation = makeOperation('query', request, {
        url: 'http://unused',
        requestPolicy: 'cache-first',
        ...context,
      });
      executions.push({
        variables: request.variables,
        publish: (data, persistence, source = 'live-network') =>
          subject.next({
            operation,
            data,
            hasNext: false,
            stale: false,
            extensions: {
              __macroNormalizedCache: { source, persistence },
            },
          }),
      });
      return subject.source;
    },
  } as Client;
  const requests: Array<{
    args: EntityFilterCacheArgs;
    resolve(result: EntityFilterCacheResult): void;
    promise: Promise<EntityFilterCacheResult>;
  }> = [];
  const listeners = new Set<CacheChangeListener>();
  const generations = new Set<
    Parameters<CacheHost['onCacheGenerationChanged']>[0]
  >();
  const host: CacheHost = {
    ...createNoopCacheHost(),
    liveQueries: true,
    onCacheChanged: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    onCacheGenerationChanged: (listener) => {
      generations.add(listener);
      return () => {
        generations.delete(listener);
      };
    },
    entityFilter: (args) => {
      if (args.liveQuery?.release)
        return Promise.resolve({ kind: 'unsupported' });
      let resolve!: (result: EntityFilterCacheResult) => void;
      const promise = new Promise<EntityFilterCacheResult>((done) => {
        resolve = done;
      });
      requests.push({ args, resolve, promise });
      return promise;
    },
  };
  mocks.host.mockReturnValue(host);
  mocks.client.mockReturnValue(client);
  const state = createRoot((dispose) => {
    cleanups.push(dispose);
    const [input, setInput] = createSignal<GroupedSoupInput>({
      initial: {
        sortMethod: 'UPDATED_AT',
        groupBy: {
          field: 'PROPERTY',
          propertyDefinitionId: 'status-definition',
        },
        limit: 2,
        filters: {},
      },
    });
    const query = createGroupedSoupLiveQuery(
      input,
      () => ({ enabled: true, onInitialResult: () => {} }),
      () => new Date('2026-10-10T12:00:00Z')
    );
    return { query, setInput, dispose };
  });
  return { ...state, executions, requests, listeners, generations };
}

function page(
  items: SoupItemFieldsFragment[],
  cursor: string | null = 'next'
): GroupSoupQuery {
  return {
    user: {
      id: 'viewer',
      groupSoup: {
        bins: [{ key: 'todo', items, totalCount: 20, nextCursor: cursor }],
      },
    },
  };
}

function update(
  records: SoupItemFieldsFragment[],
  revision = '1'
): LiveQueryUpdate {
  return {
    kind: 'live-query',
    revision: parseCacheRevision(revision),
    reset: true,
    keys: records.map(soupItemKey),
    upserts: records.map((record) => ({
      recordKey: soupItemKey(record),
      record,
      identity: { pending: false, mutationUuid: null },
    })),
    patches: [],
    removed: [],
    retainedKeys: [],
    optimistic: false,
  };
}

const ids = (data: GroupSoupQuery | undefined) =>
  data?.user.groupSoup.bins.map((bin) => ({
    key: bin.key,
    ids: bin.items.map((item) => item.id),
    count: bin.totalCount,
    cursor: bin.nextCursor,
  }));

describe('grouped Soup live ownership', () => {
  it('moves initial and continuation rows through one maintained query and preserves server pagination', async () => {
    const state = setup();
    state.executions[0].publish(page([groupedDocument('a')]));
    expect(state.requests[0].args.baseline?.map((entry) => entry.key)).toEqual([
      'GraphqlSoupDocument:a',
    ]);
    state.requests[0].resolve(update([groupedDocument('a')]));
    await state.requests[0].promise;
    const next = state.query.paging.fetchNextPage('todo');
    state.executions[1].publish(page([groupedDocument('b')], 'third'));
    await next;
    const request = state.requests.at(-1)!;
    expect(request.args.baseline?.map((entry) => entry.key)).toEqual([
      'GraphqlSoupDocument:a',
      'GraphqlSoupDocument:b',
    ]);
    request.resolve(
      update([groupedDocument('b', ['done']), groupedDocument('a')], '2')
    );
    await request.promise;
    expect(ids(state.query.data())).toEqual([
      { key: 'todo', ids: ['a'], count: 19, cursor: 'next' },
      { key: 'done', ids: ['b'], count: 1, cursor: null },
    ]);
    expect(state.query.paging.hasNextPage('todo')).toBe(true);
    const third = state.query.paging.fetchNextPage('todo');
    expect(state.executions[2].variables.input.continuation?.cursor).toBe(
      'third'
    );
    state.executions[2].publish(page([groupedDocument('c')], null));
    await third;
    expect(state.query.paging.hasNextPage('todo')).toBe(false);
    state.query.paging.resetToInitialPage();
    expect(ids(state.query.data())?.flatMap((bin) => bin.ids)).not.toContain(
      'b'
    );
  });

  it('recomputes normalized property changes without another network operation, including rollback', async () => {
    const state = setup();
    state.executions[0].publish(page([groupedDocument('a')]));
    state.requests[0].resolve(update([groupedDocument('a', ['done'])]));
    await state.requests[0].promise;
    expect(
      ids(state.query.data())?.find((bin) => bin.key === 'done')?.ids
    ).toEqual(['a']);
    state.listeners.forEach((listener) => listener(parseCacheRevision('2')));
    const request = state.requests.at(-1)!;
    request.resolve(update([groupedDocument('a')], '2'));
    await request.promise;
    expect(ids(state.query.data())).toEqual([
      { key: 'todo', ids: ['a'], count: 20, cursor: 'next' },
    ]);
    expect(state.executions).toHaveLength(1);
  });

  it.each([false, true])(
    'keeps current initial and continuation fields when selection is incomplete (unknown membership: %s)',
    async (unknown) => {
      const state = setup();
      const initial = groupedDocument('a');
      const continued = groupedDocument('b');
      state.executions[0].publish(page([initial]));
      const next = state.query.paging.fetchNextPage('todo');
      state.executions[1].publish(page([continued], null));
      await next;
      const keys = [initial, continued].map(soupItemKey);
      const request = state.requests.at(-1)!;
      request.resolve({
        ...update([]),
        keys,
        retainedKeys: unknown ? keys : [],
      });
      await request.promise;

      state.executions[0].publish(
        page([
          { ...groupedDocument('a', ['done']), displayName: 'Renamed initial' },
        ]),
        undefined,
        'normalized-cache-patch'
      );
      state.executions[1].publish(
        page(
          [
            {
              ...groupedDocument('b', ['done']),
              displayName: 'Renamed continuation',
            },
          ],
          null
        ),
        undefined,
        'normalized-cache-patch'
      );
      expect(
        state.query
          .data()
          ?.user.groupSoup.bins[0].items.map((item) => item.displayName)
      ).toEqual(['Renamed initial', 'Renamed continuation']);
      // Display updates are not new evidence for moving rows or changing counts.
      expect(ids(state.query.data())).toEqual([
        { key: 'todo', ids: ['a', 'b'], count: 20, cursor: 'next' },
      ]);
      expect(state.query.paging.hasNextPage('todo')).toBe(false);
      expect(state.requests.at(-1)).toBe(request);
      expect(state.executions).toHaveLength(2);
    }
  );

  it('ignores an obsolete evaluation after filters change', async () => {
    const state = setup();
    state.executions[0].publish(page([groupedDocument('old')]));
    const old = state.requests[0];
    state.setInput({
      initial: {
        sortMethod: 'UPDATED_AT',
        groupBy: { field: 'PROJECT' },
        filters: {},
      },
    });
    state.executions[1].publish(page([groupedDocument('new')]));
    old.resolve(update([groupedDocument('old', ['done'])]));
    await old.promise;
    expect(ids(state.query.data())?.flatMap((bin) => bin.ids)).toEqual(['new']);
  });

  it('keeps server membership until persistence and never rebases old count evidence on a normalized patch', async () => {
    const state = setup();
    let acknowledge!: (revision: string) => void;
    const persistence = new Promise<string>((resolve) => {
      acknowledge = resolve;
    });
    state.executions[0].publish(page([groupedDocument('a')]), persistence);
    expect(state.requests).toHaveLength(0);
    expect(ids(state.query.data())?.[0].ids).toEqual(['a']);
    acknowledge('1');
    await persistence;
    expect(state.requests).toHaveLength(1);
    state.requests[0].resolve(update([groupedDocument('a', ['done'])]));
    await state.requests[0].promise;
    expect(ids(state.query.data())?.[0].count).toBe(19);
    state.executions[0].publish(
      page([groupedDocument('a', ['done'])]),
      undefined,
      'normalized-cache-patch'
    );
    expect(state.requests).toHaveLength(1);
    expect(ids(state.query.data())).toEqual([
      { key: 'todo', ids: [], count: 19, cursor: 'next' },
      { key: 'done', ids: ['a'], count: 1, cursor: null },
    ]);
  });

  it('does not treat restored normalized properties as the original multi-value membership', async () => {
    const state = setup();
    const cached = page([groupedDocument('a', ['done'])]);
    cached.user.groupSoup.bins.push({
      key: 'done',
      items: [],
      totalCount: 12,
      nextCursor: 'done-next',
    });
    state.executions[0].publish(cached, undefined, 'normalized-cache-hit');
    state.requests[0].resolve(update([groupedDocument('a', ['done'])]));
    await state.requests[0].promise;
    expect(ids(state.query.data())).toEqual([
      { key: 'todo', ids: [], count: 19, cursor: 'next' },
      { key: 'done', ids: ['a'], count: 12, cursor: 'done-next' },
    ]);
  });

  it('keeps network data when persistence is unavailable and ignores late acknowledgements after reset', async () => {
    const state = setup();
    let acknowledge!: (revision: string | undefined) => void;
    const persistence = new Promise<string | undefined>((resolve) => {
      acknowledge = resolve;
    });
    state.executions[0].publish(page([groupedDocument('a')]), persistence);
    acknowledge(undefined);
    await persistence;
    expect(state.requests).toHaveLength(0);
    expect(ids(state.query.data())?.[0].ids).toEqual(['a']);
    let lateAcknowledge!: (revision: string) => void;
    const late = new Promise<string>((resolve) => {
      lateAcknowledge = resolve;
    });
    state.executions[0].publish(page([groupedDocument('b')]), late);
    state.generations.forEach((listener) => listener({ storage: 'reset' }));
    lateAcknowledge('2');
    await late;
    expect(state.requests).toHaveLength(0);
  });

  it('drops local evidence and loaded continuations on a cache generation reset', async () => {
    const state = setup();
    state.executions[0].publish(page([groupedDocument('a')]));
    const next = state.query.paging.fetchNextPage('todo');
    state.executions[1].publish(page([groupedDocument('b')], null));
    await next;
    const old = state.requests.at(-1)!;
    state.generations.forEach((listener) => listener({ storage: 'reset' }));
    old.resolve(update([groupedDocument('b', ['done'])]));
    await old.promise;
    expect(ids(state.query.data())?.flatMap((bin) => bin.ids)).toEqual(['a']);
    expect(state.query.paging.hasNextPage('todo')).toBe(true);
  });
});
