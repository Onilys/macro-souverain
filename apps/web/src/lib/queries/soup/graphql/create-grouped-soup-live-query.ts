import { createUrqlInfiniteQuery, createUrqlQuery } from '@app/lib/urql-solid';
import { Telemetry } from '@macro-inc/observability';
import type { OperationResult } from '@urql/core';
import {
  type Accessor,
  createComputed,
  createEffect,
  createMemo,
  createRoot,
  createSignal,
  on,
  onCleanup,
} from 'solid-js';
import { normalizedCacheResultMetadata } from '../../../graphql-cache/exchange/normalized-cache-exchange';
import { selectRecords } from '../../../graphql-cache/exchange/record-selection';
import {
  type GroupedSoupInput,
  GroupSoupDocument,
  type GroupSoupQuery,
  type GroupSoupQueryVariables,
  type SoupItemFieldsFragment,
  SoupItemFieldsFragmentDoc,
} from '../../../service-clients/service-storage/graphql/generated/graphql';
import {
  getGraphqlSoupCacheHost,
  getGraphqlSoupClient,
} from '../../../service-clients/service-storage/graphql-soup';
import { registerGroupedSoupContinuation } from '../grouped/graphql-operation-registry';
import { registerGraphqlSoupRevalidations } from './active-queries';
import { createPredicateQuery } from './create-predicate-query';
import {
  mergeGroupedSoupBins,
  projectLocalGroupedSoup,
} from './grouped-local-projection';
import { createGroupedPageEvidence } from './grouped-page-evidence';
import { soupItemKey, soupReconciliationBaseline } from './reconciliation';

/** Paging capabilities; rows for all loaded groups are owned by the parent source. */
export type GroupedSoupPaging = {
  hasNextPage(key: string): boolean;
  isFetchingNextPage(key: string): boolean;
  error(key: string): Error | null;
  fetchNextPage(key: string): Promise<void>;
  resetToInitialPage(): void;
};

type Options = {
  enabled: boolean;
  networkPaused?: boolean;
  keepPreviousData?: boolean;
  onInitialResult(
    result: OperationResult<GroupSoupQuery, GroupSoupQueryVariables>
  ): void;
};

/** One owner for grouped server pages and their maintained local membership. */
export function createGroupedSoupLiveQuery(
  input: Accessor<GroupedSoupInput | undefined>,
  options: Accessor<Options>,
  now: Accessor<Date>
) {
  const [generation, setGeneration] = createSignal(0);
  let previousHost = getGraphqlSoupCacheHost();
  createEffect(
    on(getGraphqlSoupCacheHost, (host) => {
      if (host !== previousHost) setGeneration((value) => value + 1);
      previousHost = host;
      if (host)
        onCleanup(
          host.onCacheGenerationChanged(() =>
            setGeneration((value) => value + 1)
          )
        );
    })
  );
  const scope = () => JSON.stringify([input(), generation()]);
  const initialEvidence = createGroupedPageEvidence(scope);
  let resetContinuations = () => {};
  const query = createUrqlQuery<
    GroupSoupQuery,
    GroupSoupQueryVariables,
    { inputKey: string; data: GroupSoupQuery }
  >(() => {
    const queryInput = input();
    const requestScope = scope();
    const queryOptions = options();
    const common = {
      query: GroupSoupDocument,
      client: getGraphqlSoupClient(),
      requestPolicy: queryOptions.networkPaused
        ? ('cache-only' as const)
        : ('cache-and-network' as const),
      keepPreviousData: queryOptions.keepPreviousData ?? false,
      onResult: (
        result: OperationResult<GroupSoupQuery, GroupSoupQueryVariables>
      ) => {
        if (scope() !== requestScope) return;
        if (
          result.data &&
          !result.error &&
          !result.hasNext &&
          normalizedCacheResultMetadata(result)?.source === 'live-network'
        )
          resetContinuations();
        initialEvidence.accept(result, 0, requestScope);
        queryOptions.onInitialResult(result);
      },
      select: (data: GroupSoupQuery) => ({
        inputKey: JSON.stringify(queryInput),
        data,
      }),
    };
    return queryOptions.enabled && queryInput
      ? { ...common, variables: { input: queryInput }, enabled: true }
      : { ...common, enabled: false as const };
  });
  const currentInitial = () =>
    query.data?.inputKey === JSON.stringify(input())
      ? query.data.data
      : undefined;
  const continuationScope = () =>
    JSON.stringify([scope(), currentInitial()?.user.id]);

  const createContinuation = (
    key: string,
    cursor: string,
    initial: GroupedSoupInput
  ) =>
    createRoot((dispose) => {
      const requestScope = continuationScope();
      const evidence = createGroupedPageEvidence(continuationScope);
      const [activated, setActivated] = createSignal(false);
      const continuationInput = (cursor: string): GroupedSoupInput => ({
        continuation: {
          cursor,
          groupKey: key,
          groupBy: (initial.initial ?? initial.continuation).groupBy,
        },
      });
      let settle = () => {};
      const settled = new Promise<void>((resolve) => {
        settle = resolve;
      });
      const continued = createUrqlInfiniteQuery<
        GroupSoupQuery,
        GroupSoupQueryVariables,
        string,
        { pages: Accessor<GroupSoupQuery[]>; pageParams: readonly string[] }
      >(() => ({
        query: GroupSoupDocument,
        client: getGraphqlSoupClient(),
        initialPageParam: cursor,
        variables: (cursor) => {
          const pageInput = continuationInput(cursor);
          registerGroupedSoupContinuation(initial, pageInput);
          return { input: pageInput };
        },
        enabled:
          activated() &&
          options().enabled &&
          continuationScope() === requestScope,
        requestPolicy: options().networkPaused ? 'cache-only' : 'cache-first',
        keepPreviousData: false,
        getNextPageParam: (page) =>
          page.user.groupSoup.bins.find((bin) => bin.key === key)?.nextCursor ??
          undefined,
        onResult: (result, page) =>
          evidence.accept(result, page.pageIndex, requestScope),
        select: ({ pages, pageParams }) => ({ pages: () => pages, pageParams }),
      }));
      onCleanup(
        registerGraphqlSoupRevalidations(() =>
          continued.isEnabled
            ? [...new Set([cursor, ...(continued.data?.pageParams ?? [])])].map(
                (cursor) => ({
                  document: GroupSoupDocument,
                  variables: { input: continuationInput(cursor) },
                })
              )
            : []
        )
      );
      createComputed(() => {
        if (
          activated() &&
          (!continued.isEnabled ||
            (continued.isFetched && !continued.isFetching))
        )
          settle();
      });
      onCleanup(settle);
      return {
        query: continued,
        evidence,
        dispose,
        activate: async () => {
          setActivated(true);
          await settled;
        },
      };
    });
  const [continuations, setContinuations] = createSignal<
    ReadonlyMap<string, ReturnType<typeof createContinuation>>
  >(new Map());
  resetContinuations = () => {
    for (const continuation of continuations().values()) continuation.dispose();
    setContinuations(new Map());
  };
  createComputed(on(continuationScope, () => resetContinuations()));
  createComputed(
    on(
      () => currentInitial()?.user.groupSoup.bins.map((bin) => bin.key) ?? [],
      (keys) => {
        const active = new Set(keys);
        const remaining = new Map(continuations());
        for (const [key, continuation] of remaining) {
          if (active.has(key)) continue;
          continuation.dispose();
          remaining.delete(key);
        }
        if (remaining.size !== continuations().size)
          setContinuations(remaining);
      }
    )
  );
  onCleanup(() => {
    for (const continuation of continuations().values()) continuation.dispose();
  });

  const serverPages = createMemo(() => {
    const initial = currentInitial();
    if (!initial) return [];
    return [
      initial,
      ...[...continuations().values()].flatMap(
        (continuation) => continuation.query.data?.pages() ?? []
      ),
    ].filter((page) => page.user.id === initial.user.id);
  });
  const baseline = createMemo(() => {
    const initial = initialEvidence.data();
    if (
      !initial ||
      !currentInitial() ||
      initial[0].user.id !== currentInitial()?.user.id
    )
      return undefined;
    const pages = [...initial];
    const untrustedKeys = initialEvidence.untrustedKeys();
    for (const continuation of continuations().values()) {
      const loaded = continuation.query.data?.pages();
      if (!loaded?.length) continue;
      const evidence = continuation.evidence.data();
      if (!evidence || evidence.length !== loaded.length) return undefined;
      pages.push(...evidence);
      for (const key of continuation.evidence.untrustedKeys())
        untrustedKeys.add(key);
    }
    return {
      bins: mergeGroupedSoupBins(
        pages.filter((page) => page.user.id === initial[0].user.id)
      ),
      untrustedKeys,
    };
  });
  const selection = selectRecords(SoupItemFieldsFragmentDoc);
  const live = createPredicateQuery<SoupItemFieldsFragment>({
    host: getGraphqlSoupCacheHost,
    query: () => {
      const initial = input()?.initial;
      const bins = baseline();
      if (
        !options().enabled ||
        !getGraphqlSoupCacheHost()?.liveQueries ||
        !initial ||
        !bins ||
        (initial.sortMethod !== 'CREATED_AT' &&
          initial.sortMethod !== 'UPDATED_AT')
      )
        return undefined;
      const membership = soupReconciliationBaseline(
        bins.bins.flatMap((bin) => bin.items),
        initial.sortMethod
      );
      if (!membership) return undefined;
      return {
        source: {
          filters: initial.filters ?? {},
          sortMethod: initial.sortMethod,
          sortDirection: 'DESC',
          limit: initial.limit ?? 20,
          baseline: membership,
        },
        select: selection,
      };
    },
  });
  const bins = createMemo(() => {
    const initial = input()?.initial;
    const evidence = baseline();
    const snapshot = live.data();
    if (!initial || !evidence || !snapshot || live.status() !== 'ready')
      return mergeGroupedSoupBins(serverPages());
    const span = Telemetry.span('graphql_cache.soup_grouped_local_evaluation');
    try {
      const currentItems = new Map<string, SoupItemFieldsFragment>();
      for (const page of serverPages())
        for (const bin of page.user.groupSoup.bins)
          for (const item of bin.items)
            currentItems.set(soupItemKey(item), item);
      const result = projectLocalGroupedSoup(
        evidence.bins,
        currentItems,
        snapshot,
        initial,
        now(),
        evidence.untrustedKeys
      );
      span.setAttr('grouping.field', initial.groupBy.field);
      span.setAttr('grouping.bin_count', result.length);
      span.setAttr(
        'grouping.baseline_count',
        evidence.bins.reduce((count, bin) => count + bin.items.length, 0)
      );
      return result;
    } finally {
      span.end();
    }
  });
  const paging: GroupedSoupPaging = {
    hasNextPage: (key) => {
      const continuation = continuations().get(key);
      return continuation?.query.data
        ? continuation.query.hasNextPage
        : Boolean(bins().find((bin) => bin.key === key)?.nextCursor);
    },
    isFetchingNextPage: (key) =>
      continuations().get(key)?.query.isFetching ?? false,
    error: (key) => continuations().get(key)?.query.error ?? null,
    fetchNextPage: async (key) => {
      const initial = input();
      if (!initial || !options().enabled) return;
      const current = continuations().get(key);
      if (current) {
        if (current.query.isFetching) return;
        if (!current.query.data) await current.query.refetch();
        else await current.query.fetchNextPage();
        return;
      }
      const cursor = bins().find((bin) => bin.key === key)?.nextCursor;
      if (!cursor) return;
      const continuation = createContinuation(key, cursor, initial);
      setContinuations((previous) => new Map(previous).set(key, continuation));
      await continuation.activate();
    },
    resetToInitialPage: () => resetContinuations(),
  };
  return {
    query,
    paging,
    data: createMemo((): GroupSoupQuery | undefined => {
      const initial = currentInitial();
      if (!initial) return query.data?.data;
      return {
        ...initial,
        user: {
          ...initial.user,
          groupSoup: { ...initial.user.groupSoup, bins: bins() },
        },
      };
    }),
  };
}
