import { createUrqlInfiniteQuery } from '@app/lib/urql-solid';
import { useUserId } from '@core/context/user';
import { arrayEquals } from '@core/util/compareUtils';
import { isResponseFreeNetworkError } from '@core/util/request-error';
import type { EntityData } from '@entity';
import { createKeyedProjection } from '@queries/soup/create-keyed-projection';
import { soupQueryExcludesDone } from '@queries/soup/excludes-done';
import {
  registerActiveGraphqlSoupQuery,
  registerGraphqlSoupRevalidations,
} from '@queries/soup/graphql/active-queries';
import {
  makeGraphqlGroupedSoupContinuationInput,
  makeGraphqlGroupedSoupInput,
} from '@queries/soup/graphql/ast';
import { createGraphqlSoupDoneProjection } from '@queries/soup/graphql/done-projection';
import { usePendingGraphqlSoupDeleteIds } from '@queries/soup/graphql/optimistic-deletions';
import { usePendingGraphqlSoupDone } from '@queries/soup/graphql/optimistic-done';
import { soupItemKey } from '@queries/soup/graphql/reconciliation';
import {
  groupedSoupInputKey,
  registerGroupedSoupContinuation,
  registerGroupedSoupDirectory,
} from '@queries/soup/grouped/graphql-operation-registry';
import type { GroupByField, GroupMeta } from '@queries/soup/grouped/types';
import type {
  SoupApiItemFilter,
  SoupAstBody,
  SoupAstItemsGroupedPage,
  SoupParams,
} from '@queries/soup/items';
import {
  isDisplayableSoupItem,
  isInstructionsMdDoc,
  mapApiSoupItemToEntity,
} from '@queries/soup/transform-utils';
import { useInstructionsMdIdQuery } from '@queries/storage/instructions-md';
import {
  type GroupedSoupInput,
  GroupSoupDocument,
  type GroupSoupQuery,
  type GroupSoupQueryVariables,
} from '@service-storage/graphql/generated/graphql';
import {
  type GraphqlSoupItem,
  getGraphqlSoupClient,
  mapGraphqlGroupedSoupPage,
  mapGraphqlSoupItem,
} from '@service-storage/graphql-soup';
import { until } from '@solid-primitives/promise';
import {
  type Accessor,
  createComputed,
  createMemo,
  createRoot,
  createSignal,
  onCleanup,
} from 'solid-js';

export type GroupQueryData = { entities: EntityData[] };
type GroupQuery = {
  key: string;
  data: Accessor<GroupQueryData | undefined>;
  hasNextPage: Accessor<boolean>;
  isFetchingNextPage: Accessor<boolean>;
  error: Accessor<Error | null>;
  fetchNextPage: () => Promise<void>;
  dispose: () => void;
};
type Args = {
  networkPaused?: Accessor<boolean>;
  initialPage: Accessor<
    { items: SoupAstItemsGroupedPage['items']; groups: GroupMeta[] } | undefined
  >;
  groupByField: Accessor<GroupByField | undefined>;
  soupParams: Accessor<SoupParams>;
  soupBody: Accessor<SoupAstBody>;
  enabled: Accessor<boolean>;
  itemFilter: Accessor<SoupApiItemFilter | undefined>;
};

/** Directory entries own counts; each lazily activated query owns one group's pages. */
export function createGraphqlDirectoryGroupQueries(args: Args) {
  const instructions = useInstructionsMdIdQuery();
  const pendingDeleteIds = usePendingGraphqlSoupDeleteIds();
  const pendingDone = usePendingGraphqlSoupDone();
  const excludesDone = () => soupQueryExcludesDone([args.soupBody()]);
  const userId = useUserId();
  const initialInput = createMemo(() => {
    const field = args.groupByField();
    if (!field) return;
    try {
      return makeGraphqlGroupedSoupInput({
        params: args.soupParams(),
        body: args.soupBody(),
        groupBy: field,
      });
    } catch {
      return;
    }
  });
  const identity = () => groupedSoupInputKey([userId(), initialInput()]);
  createComputed(() => {
    const initial = initialInput();
    if (!args.enabled() || !initial?.initial) return;
    const { groupBy, filters, sortMethod } = initial.initial;
    onCleanup(
      registerGroupedSoupDirectory(
        initial,
        { groupBy, filters, sortMethod },
        userId()
      )
    );
  });
  const [revision, setRevision] = createSignal(0);
  const queries = new Map<string, GroupQuery>();

  function createGroup(
    key: string,
    initial: GroupedSoupInput,
    field: GroupByField
  ): GroupQuery {
    return createRoot((dispose) => {
      const projectDone = createGraphqlSoupDoneProjection();
      const [activated, setActivated] = createSignal(false);
      const [disposed, setDisposed] = createSignal(false);
      onCleanup(() => setDisposed(true));
      let settleFirst: (() => void) | undefined;
      let pending: Promise<void> | undefined;
      const registrations = new Map<string, () => void>();
      const inputFor = (cursor: string | null): GroupedSoupInput => {
        const input: GroupedSoupInput =
          cursor === null
            ? { startGroup: { ...initial.initial!, groupKey: key } }
            : makeGraphqlGroupedSoupContinuationInput({
                groupBy: field,
                groupKey: key,
                cursor,
              });
        const operationKey = groupedSoupInputKey(input);
        if (!registrations.has(operationKey)) {
          registrations.set(
            operationKey,
            registerGroupedSoupContinuation(initial, input, userId())
          );
        }
        return input;
      };
      const query = createUrqlInfiniteQuery<
        GroupSoupQuery,
        GroupSoupQueryVariables,
        string | null,
        {
          pages: Accessor<readonly GroupSoupQuery[]>;
          pageParams: readonly (string | null)[];
        }
      >(() => ({
        query: GroupSoupDocument,
        client: getGraphqlSoupClient(),
        initialPageParam: null,
        variables: (cursor) => ({ input: inputFor(cursor) }),
        enabled: activated() && args.enabled(),
        requestPolicy: args.networkPaused?.() ? 'cache-only' : 'cache-first',
        getNextPageParam: (page) =>
          mapGraphqlGroupedSoupPage(page).groups.find(
            (group) => group.key === key
          )?.nextCursor,
        // Keep live records out of deep result reconciliation; project rows by key.
        select: ({ pages, pageParams }) => ({ pages: () => pages, pageParams }),
      }));
      createComputed(() => {
        if ((query.isFetched && !query.isFetching) || !args.enabled()) {
          settleFirst?.();
          settleFirst = undefined;
        }
      });
      const data = () => (query.isFetched ? query.data : undefined);
      const error = () =>
        isResponseFreeNetworkError(query.error) &&
        data() &&
        !query.isFetchNextPageError
          ? null
          : query.error;
      const records = createMemo(
        () => {
          const unique = new Map<string, GraphqlSoupItem>();
          for (const page of data()?.pages() ?? [])
            for (const record of page.user.groupSoup.bins.find(
              (bin) => bin.key === key
            )?.items ?? [])
              unique.set(soupItemKey(record), record);
          return [...unique.values()];
        },
        undefined,
        { equals: arrayEquals }
      );
      const rows = createKeyedProjection(records, soupItemKey, (record) => {
        const item = mapGraphqlSoupItem(record);
        const entity =
          item &&
          isDisplayableSoupItem(item) &&
          !isInstructionsMdDoc(item, instructions) &&
          (!args.itemFilter() || args.itemFilter()!(item))
            ? mapApiSoupItemToEntity(item)
            : undefined;
        return { entity };
      });
      const entities = createMemo(
        () => rows().flatMap((row) => (row.entity ? [row.entity] : [])),
        undefined,
        { equals: arrayEquals }
      );
      onCleanup(
        registerGraphqlSoupRevalidations(
          () =>
            !query.isEnabled || args.networkPaused?.()
              ? []
              : (data()?.pageParams ?? [null]).map((cursor) => ({
                  document: GroupSoupDocument,
                  variables: { input: inputFor(cursor) },
                })),
          getGraphqlSoupClient
        )
      );
      onCleanup(
        registerActiveGraphqlSoupQuery({
          isEnabled: () => query.isEnabled && !args.networkPaused?.(),
          body: args.soupBody,
          refresh: async () => {
            await query.refetch({
              requestPolicy: 'network-only',
              throwOnError: true,
            });
          },
        })
      );
      onCleanup(() => {
        settleFirst?.();
        for (const unregister of registrations.values()) unregister();
      });
      const waitForNetwork = async () => {
        if (args.networkPaused?.() || query.isFetching)
          await until(
            () =>
              disposed() ||
              !args.enabled() ||
              (!args.networkPaused?.() && !query.isFetching)
          );
        return !disposed() && args.enabled();
      };
      const load = async () => {
        if (!args.enabled() || disposed()) return;
        if (!activated()) {
          const settled = new Promise<void>((resolve) => {
            settleFirst = resolve;
          });
          setActivated(true);
          if (query.isFetched && !query.isFetching) {
            settleFirst?.();
            settleFirst = undefined;
          }
          await settled;
          if (!(await waitForNetwork())) return;
          if (error()) throw error();
          if (!data())
            await query.refetch({
              requestPolicy: 'network-only',
              throwOnError: true,
            });
          return;
        }
        if (
          (args.networkPaused?.() || query.isFetching) &&
          !(await waitForNetwork())
        )
          return;
        if (!data() || query.error) {
          await query.refetch({
            requestPolicy: 'network-only',
            throwOnError: true,
          });
        } else {
          await query.fetchNextPage({ throwOnError: true });
        }
      };
      return {
        key,
        data: createMemo(() =>
          projectDone(
            JSON.stringify([identity(), key]),
            data() ? { entities: entities(), groups: undefined } : undefined,
            pendingDone(),
            excludesDone(),
            pendingDeleteIds()
          )
        ),
        hasNextPage: () =>
          !!error() || !activated() || !data() || query.hasNextPage,
        isFetchingNextPage: () => query.isFetching,
        error,
        fetchNextPage: () => {
          if (pending) return pending;
          const action = async () => {
            try {
              await load();
            } finally {
              pending = undefined;
            }
          };
          pending = action();
          return pending;
        },
        dispose,
      };
    });
  }
  let previousIdentity: string | undefined;
  createComputed(() => {
    const nextIdentity = identity();
    const initial = initialInput();
    const field = args.groupByField();
    const groups = args.initialPage()?.groups ?? [];
    if (nextIdentity !== previousIdentity) {
      for (const query of queries.values()) query.dispose();
      queries.clear();
      previousIdentity = nextIdentity;
    }
    const keys = new Set(groups.map((group) => group.key));
    for (const [key, query] of queries) {
      if (!keys.has(key)) {
        query.dispose();
        queries.delete(key);
      }
    }
    if (initial && field)
      for (const group of groups) {
        if (!queries.has(group.key))
          queries.set(group.key, createGroup(group.key, initial, field));
      }
    setRevision((value) => value + 1);
  });
  onCleanup(() => {
    for (const query of queries.values()) query.dispose();
  });
  const list = createMemo(() => {
    revision();
    return (args.initialPage()?.groups ?? []).flatMap((group) => {
      const query = queries.get(group.key);
      return query ? [query] : [];
    });
  });
  return {
    list,
    map: createMemo(() => new Map(list().map((query) => [query.key, query]))),
    resetToInitialPage: () => {
      for (const query of queries.values()) query.dispose();
      queries.clear();
      const initial = initialInput();
      const field = args.groupByField();
      if (initial && field)
        for (const group of args.initialPage()?.groups ?? [])
          queries.set(group.key, createGroup(group.key, initial, field));
      setRevision((value) => value + 1);
    },
  };
}
