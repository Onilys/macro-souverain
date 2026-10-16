import type { ListDataSource } from '@app/components/list';
import { createOrderedGroupPagination } from '@app/features/next-soup/primitives/ordered-group-pagination';
import {
  buildFlatSoupRows,
  buildGroupedSoupRows,
  createSearchState,
  createSoupRowStore,
  createTagFacetContext,
  deduplicateSoupEntities,
  isSoupRowVisible,
  type SoupGroup,
  type SoupRow,
  sortItems,
  tagFacetReady,
  useSearchContext,
} from '@app/features/soup';
import { withEntityNotifications } from '@app/features/soup/entity-notifications';
import { useGlobalNotificationSource } from '@components/app/GlobalAppState';
import {
  type EntityData,
  getTaskReferencedEntityIds,
  isTaskEntity,
  type TaskEntityWithProperties,
} from '@entity';
import { SYSTEM_PROPERTY_IDS } from '@property/constants';
import { createGroupedSoupQueries } from '@queries/soup/grouped/create-grouped-soup-queries';
import { useSoupAstItemsQuery } from '@queries/soup/items';
import { mapApiSoupItemToEntity } from '@queries/soup/transform-utils';
import type { TagSetResponse } from '@service-properties/generated/schemas/tagSetResponse';
import { type Accessor, createMemo } from 'solid-js';
import { TASK_SORT_DEFINITIONS } from '../constants';
import type { TaskFacetContext } from '../filters/task-facets';
import {
  type TaskViewContext,
  taskMatchesView,
} from '../filters/task-predicates';
import type {
  TaskCrmScope,
  TaskReferenceScope,
  TasksViewState,
} from '../types';
import { createAutomaticTaskPagination } from './automatic-task-pagination';
import { createScopedTaskSearch } from './scoped-task-search';
import { buildTaskQuery } from './task-query';
import { buildTaskSearchRequest } from './task-search';

export type TasksDataSourceInput = Pick<
  TasksViewState,
  'tab' | 'search' | 'groupBy' | 'sort' | 'facets'
>;

export type UseTasksDataSourceOptions = {
  userId: Accessor<string | undefined>;
  tagSets: Accessor<readonly TagSetResponse[]>;
  tagSetsReady: Accessor<boolean>;
  isGroupExpanded: (groupId: string) => boolean;
  /** Only tasks whose property references this entity. */
  reference?: Accessor<TaskReferenceScope>;
  /**
   * Only tasks associated with this CRM record. The server resolves the
   * membership, so fetched rows are not re-filtered by their properties.
   */
  crm?: Accessor<TaskCrmScope>;
  enabled?: Accessor<boolean>;
  networkPaused?: Accessor<boolean>;
  /** Project lists drain all cursors instead of requiring per-group Load More. */
  loadAll?: boolean;
  board?: Accessor<boolean>;
};

export type TasksDataSourceItem = SoupRow<TaskEntityWithProperties>;

export type TasksDataSource = ListDataSource<TasksDataSourceItem> & {
  loadMoreGroup: (groupId: string) => Promise<void>;
  paginationError?: Accessor<unknown>;
  retryPagination?: () => void;
  /** Retained rows may render while their replacement query is not ready to page. */
  paginationReady?: Accessor<boolean>;
  /** Uncollapsed rows for alternative layouts; the query owner is shared. */
  boardRows?: Accessor<TasksDataSourceItem[]>;
  boardSearching?: Accessor<boolean>;
  boardLoading?: Accessor<boolean>;
  groupError?: (groupId: string) => unknown;
  orderedGroups?: {
    enabled: Accessor<boolean>;
    identity: Accessor<string>;
    retain: () => void;
    error: (key: string) => Error | null;
    load: (key: string, retry?: boolean) => Promise<void>;
  };
};

type TaskGroupContinuationReader = {
  entities: (groupId: string) => TaskEntityWithProperties[];
  hasMore: (groupId: string) => boolean;
  isLoading: (groupId: string) => boolean;
  loadMore: (groupId: string) => Promise<void>;
};

function referencesEntity(
  task: TaskEntityWithProperties,
  reference: TaskReferenceScope
) {
  return getTaskReferencedEntityIds(
    task,
    reference.propertyDefinitionId
  ).includes(reference.entityId);
}

/**
 * Whether a task known only locally (an optimistic insert) is associated with
 * the record through its own property. Mention and contact-company matches
 * are known only to the server and arrive with the next fetch.
 */
function namesCrmRecord(task: TaskEntityWithProperties, crm: TaskCrmScope) {
  return getTaskReferencedEntityIds(
    task,
    crm.type === 'company'
      ? SYSTEM_PROPERTY_IDS.COMPANIES
      : SYSTEM_PROPERTY_IDS.CONTACTS
  ).includes(crm.id);
}

/** Query, service search, and row assembly owned by the production Tasks view. */
export function useTasksDataSource(
  state: TasksDataSourceInput,
  options: UseTasksDataSourceOptions
): TasksDataSource {
  const notificationSource = useGlobalNotificationSource();
  const attachNotifications = (entity: TaskEntityWithProperties) =>
    withEntityNotifications(entity, notificationSource);

  const facetContext = createMemo(
    (): TaskFacetContext => createTagFacetContext(options.tagSets())
  );
  const facetOptionsReady = () =>
    (options.enabled?.() ?? true) &&
    state.tab !== 'projects' &&
    tagFacetReady(state.facets, options.tagSetsReady());

  const queryArgsFor = (nameContains?: string) =>
    buildTaskQuery({
      tab: state.tab,
      userId: options.userId(),
      facets: state.facets,
      facetContext: facetContext(),
      groupBy: state.groupBy,
      sort: state.sort,
      reference: options.reference?.(),
      crm: options.crm?.(),
      nameContains,
      board: options.board?.(),
    });
  const queryArgs = () => queryArgsFor();

  const scoped = Boolean(options.reference || options.crm);
  const lazyPaginationRequested = () =>
    !options.loadAll && queryArgs().groupBy?.type !== 'date';
  const query = useSoupAstItemsQuery(queryArgs, () => ({
    lazyGroupPagination: lazyPaginationRequested(),
    enabled: facetOptionsReady(),
    networkPaused: options.networkPaused?.(),
    keepPreviousData: scoped,
    // Scoped lists admit optimistic rows only where this view shows them.
    meta: scoped
      ? {
          insertFilter: (item) => {
            const entity = mapApiSoupItemToEntity(item);
            const reference = options.reference?.();
            const crm = options.crm?.();
            return (
              isTaskEntity(entity) &&
              taskMatchesView(entity, viewContext()) &&
              (!reference || referencesEntity(entity, reference)) &&
              (!crm || namesCrmRecord(entity, crm))
            );
          },
        }
      : undefined,
  }));

  const viewContext = (): TaskViewContext => ({
    tab: state.tab,
    userId: options.userId(),
    facets: state.facets,
    facetContext: facetContext(),
  });

  const transformEntities = (entities: EntityData[]) => {
    const selected: TaskEntityWithProperties[] = [];
    const context = viewContext();
    const reference = options.reference?.();
    for (const entity of entities) {
      if (!isTaskEntity(entity)) continue;
      if (reference && !referencesEntity(entity, reference)) continue;
      if (!taskMatchesView(entity, context)) continue;

      selected.push(attachNotifications(entity));
    }
    return selected;
  };

  const baseTasks = createMemo<TaskEntityWithProperties[]>((previous) => {
    if (query.isLoading) return previous;
    if (query.isPlaceholderData && previous.length > 0) return previous;

    return sortItems(
      transformEntities(query.data?.entities ?? []),
      state.sort,
      TASK_SORT_DEFINITIONS
    );
  }, []);

  const { entityPool } = useSearchContext();
  const localPool = createMemo(() => {
    if (!state.search.trim()) return [];
    const pool = entityPool();
    const matchingIds = new Set(
      transformEntities(pool.map((item) => item.data)).map(
        (entity) => entity.id
      )
    );
    return pool.filter((item) => matchingIds.has(item.data.id));
  });

  // CRM membership includes references and a company's contacts, which the
  // search service cannot express: search the scoped Soup query by name.
  const search = options.crm
    ? createScopedTaskSearch({
        text: () => state.search,
        args: queryArgsFor,
        enabled: facetOptionsReady,
      })
    : createSearchState({
        text: () => state.search,
        localPool,
        enabled: facetOptionsReady,
        buildRequest: ({ query, matchType }) =>
          buildTaskSearchRequest({
            query,
            matchType,
            tab: state.tab,
            userId: options.userId(),
            facets: state.facets,
            facetContext: facetContext(),
            reference: options.reference?.(),
          }),
      });

  const groupedQueries = createGroupedSoupQueries({
    initialPage: createMemo(() => {
      if (search.isSearching() || query.isLoading || query.isPlaceholderData) {
        return;
      }

      const groups = query.data?.groups;
      const items = query.data?.itemsById;
      if (!groups || !items) return;
      return { groups, items };
    }),
    groupByField: () => queryArgs().groupBy,
    soupParams: () => queryArgs().params,
    soupBody: () => queryArgs().body,
    transport: () => query.transport,
    queryOptions: () => ({
      enabled: !search.isSearching() && facetOptionsReady(),
      lazyGroupPagination: lazyPaginationRequested(),
      networkPaused: options.networkPaused?.(),
    }),
  });

  const groupQueryFor = (groupKey: string) =>
    groupedQueries.map().get(groupKey);

  const automatic = createAutomaticTaskPagination({
    enabled: () =>
      Boolean(options.loadAll) &&
      facetOptionsReady() &&
      !options.networkPaused?.(),
    scope: () =>
      JSON.stringify([
        queryArgs(),
        state.search,
        options.userId(),
        options.enabled?.(),
      ]),
    sources: () => {
      if (search.isSearching()) {
        return [
          {
            id: 'search',
            hasMore: search.hasNextPage(),
            pending: search.isFetching(),
            load: async () => {
              await search.fetchNextPage();
            },
            error: search.error,
          },
        ];
      }
      if (query.isPending || query.isPlaceholderData) return [];
      return [
        {
          id: 'list',
          hasMore: query.hasNextPage,
          pending: query.isFetching,
          load: async () => {
            await query.fetchNextPage();
          },
          error: () => query.error,
        },
        ...[...groupedQueries.map().values()].map((group) => ({
          id: `group:${group.key}`,
          hasMore: group.hasNextPage(),
          pending: group.isFetchingNextPage(),
          load: async () => {
            await group.fetchNextPage();
          },
          error: group.error,
        })),
      ];
    },
  });

  const continuations: TaskGroupContinuationReader = {
    entities: (groupKey) =>
      (groupQueryFor(groupKey)?.data()?.entities ?? []).flatMap((entity) =>
        isTaskEntity(entity) ? [attachNotifications(entity)] : []
      ),
    hasMore: (groupKey) => groupQueryFor(groupKey)?.hasNextPage() ?? false,
    isLoading: (groupKey) =>
      groupQueryFor(groupKey)?.isFetchingNextPage() ?? false,
    loadMore: async (groupKey) => {
      await groupQueryFor(groupKey)?.fetchNextPage();
    },
  };

  const orderedEnabled = () =>
    lazyPaginationRequested() &&
    !options.board?.() &&
    query.transport === 'graphql' &&
    !!queryArgs().groupBy &&
    !search.isSearching();
  const identity = () =>
    JSON.stringify([
      options.userId(),
      queryArgs(),
      state.search,
      lazyPaginationRequested(),
      options.board?.() ?? false,
    ]);
  const ordered = createOrderedGroupPagination({
    identity,
    groups: () =>
      (query.isLoading ? [] : (query.data?.groups ?? [])).map((group) => ({
        key: group.key,
        hasMore: () => continuations.hasMore(group.key),
        isLoading: () => continuations.isLoading(group.key),
        error: () => {
          const query = groupQueryFor(group.key);
          return query && 'error' in query ? query.error() : null;
        },
        load: () => continuations.loadMore(group.key),
      })),
    isExpanded: options.isGroupExpanded,
  });
  const loadOrderedGroup = async (key: string, retry = false) => {
    await ordered.load(key, retry);
    const error = ordered.error(key);
    if (error) throw error;
  };

  const tasks = createMemo<TaskEntityWithProperties[]>((previous) => {
    if (!search.isSearching()) return baseTasks();

    const results = transformEntities(search.data());
    if (
      results.length === 0 &&
      previous.length > 0 &&
      search.isLocalSearchSettling()
    ) {
      return previous;
    }
    return results;
  }, []);

  const builtRows = createMemo<SoupRow<TaskEntityWithProperties>[]>(
    (previous) => {
      if (
        !search.isSearching() &&
        (query.isLoading || (query.isPlaceholderData && previous.length > 0))
      ) {
        return previous;
      }

      const groups = search.isSearching() ? undefined : query.data?.groups;
      const currentTasks = tasks();
      if (!groups || state.groupBy === 'none') {
        return buildFlatSoupRows(currentTasks);
      }

      const tasksById = new Map(currentTasks.map((task) => [task.id, task]));
      const taskGroups: SoupGroup<TaskEntityWithProperties>[] = [];

      const visibleKeys = orderedEnabled()
        ? new Set(ordered.visible().map((group) => group.key))
        : undefined;
      for (const group of groups) {
        if (visibleKeys && !visibleKeys.has(group.key)) continue;
        const initialTasks = group.itemIds.flatMap((id) => {
          const task = tasksById.get(id);
          return task ? [task] : [];
        });
        const reference = options.reference?.();
        const continuationTasks = continuations
          .entities(group.key)
          .filter(
            (task) =>
              (!reference || referencesEntity(task, reference)) &&
              taskMatchesView(task, viewContext())
          );
        const entities = sortItems(
          deduplicateSoupEntities([...initialTasks, ...continuationTasks]),
          state.sort,
          TASK_SORT_DEFINITIONS
        );
        const taskGroup: SoupGroup<TaskEntityWithProperties> = {
          id: group.key,
          label: group.label,
          entities,
          count: group.totalCount,
        };

        if (!options.loadAll && continuations.hasMore(group.key)) {
          taskGroup.loadMore = {
            scopeId: `tasks:${group.key}`,
            isLoading: continuations.isLoading(group.key),
          };
        }

        taskGroups.push(taskGroup);
      }

      return buildGroupedSoupRows(taskGroups);
    },
    []
  );
  const rows = createSoupRowStore(builtRows);

  const items = createMemo(() => {
    if (options.enabled?.() === false) return [];
    return rows().filter((row) =>
      isSoupRowVisible(row, options.isGroupExpanded)
    );
  });

  const usesServiceSearch = search.usesServiceSearch;

  const paginationReady = () => {
    if (!facetOptionsReady() || options.networkPaused?.()) return false;
    if (search.isSearching()) {
      if (search.isSettling()) return false;
      if (usesServiceSearch()) return !search.isLoading();
    }
    return !query.isPending && !query.isPlaceholderData;
  };

  const isLoading = () => {
    if (options.enabled?.() === false) return false;
    if (!search.isSearching()) {
      // A query held back for the tag sets is loading, not empty.
      return (query.isLoading || !facetOptionsReady()) && rows().length === 0;
    }
    if (tasks().length > 0) return false;
    if (usesServiceSearch()) return search.isLoading();
    return query.isLoading;
  };

  const isFetching = () => {
    if (search.isSettling()) return true;
    if (usesServiceSearch()) return search.isFetching();
    return query.isFetching;
  };

  const error = () => {
    if (!usesServiceSearch()) return query.error ?? undefined;
    return search.error();
  };

  const hasMore = () => {
    if (options.loadAll) return false;
    if (usesServiceSearch()) return search.hasNextPage();
    return query.hasNextPage;
  };

  const isLoadingMore = () => {
    if (usesServiceSearch()) return search.isFetchingNextPage();
    return query.isFetchingNextPage;
  };

  const loadMore = async () => {
    if (usesServiceSearch()) {
      await search.fetchNextPage();
      return;
    }
    await query.fetchNextPage();
  };

  const refresh = async () => {
    if (usesServiceSearch()) {
      await search.refetch();
      return;
    }
    ordered.reset();
    groupedQueries.resetToInitialPage();
    await query.refresh();
  };

  const boardRows = () => {
    if (options.enabled?.() === false) {
      return [];
    }

    if (search.isSearching()) {
      return rows();
    }

    if (query.isPending || query.isPlaceholderData) {
      return [];
    }

    return rows();
  };

  const boardLoading = () => {
    if (search.isSearching()) {
      return isLoading();
    }

    if (options.enabled?.() === false) {
      return false;
    }

    return query.isPending || !facetOptionsReady();
  };

  return {
    items,
    boardRows,
    boardLoading,
    groupError: (id) => groupQueryFor(id)?.error(),
    boardSearching: search.isSearching,
    isLoading,
    isFetching,
    error,
    hasMore,
    isLoadingMore,
    loadMoreGroup: (key) =>
      orderedEnabled() ? loadOrderedGroup(key) : continuations.loadMore(key),
    orderedGroups: {
      enabled: orderedEnabled,
      identity,
      retain: ordered.retain,
      error: ordered.error,
      load: loadOrderedGroup,
    },
    loadMore,
    refresh,
    paginationReady,
    paginationError: automatic.error,
    retryPagination: automatic.retry,
  } satisfies TasksDataSource;
}
