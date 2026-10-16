import type { TaskEntityWithProperties } from '@entity/types/entity';
import { createRoot, createSignal } from 'solid-js';
import { expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  groupQueries: new Map<string, unknown>(),
  groupOptions: undefined as
    | (() => { networkPaused?: boolean; lazyGroupPagination?: boolean })
    | undefined,
  calls: [] as { args: () => unknown; options?: () => unknown }[],
  searchState: vi.fn(),
  mapItem: vi.fn(),
}));
vi.mock('@app/features/soup', async () => ({
  ...(await import('@app/features/soup/filters')),
  ...(await import('@app/features/soup/collection/rows')),
  ...(await import('@app/features/soup/collection/row-store')),
  ...(await import('@app/features/soup/collection/transforms')),
  useSearchContext: () => ({ entityPool: () => [] }),
  createSearchState: () => {
    fixture.searchState();
    return {
      isSearching: () => false,
      usesServiceSearch: () => false,
      isSettling: () => false,
    };
  },
}));
vi.mock('@entity', async () => ({
  ...(await import('@entity/types/entity')),
  ...(await import('@entity/utils/task-properties')),
}));
vi.mock('@components/app/GlobalAppState', () => ({
  useGlobalNotificationSource: () => ({ notificationsByEntity: () => ({}) }),
}));
vi.mock('@queries/soup/transform-utils', () => ({
  mapApiSoupItemToEntity: fixture.mapItem,
}));
vi.mock('@queries/soup/items', () => ({
  useSoupAstItemsQuery: (args: () => unknown, options?: () => unknown) => {
    fixture.calls.push({ args, options });
    return fixture.query;
  },
}));
vi.mock('@queries/soup/grouped/create-grouped-soup-queries', () => ({
  createGroupedSoupQueries: (args: {
    queryOptions: NonNullable<typeof fixture.groupOptions>;
  }) => {
    fixture.groupOptions = args.queryOptions;
    return { map: () => fixture.groupQueries };
  },
}));

import { useTasksDataSource } from './use-tasks-query';

it.each([false, true])(
  'loads all group pages only when requested (%s)',
  async (loadAll) => {
    const tasks = Array.from({ length: 20 }, (_, index) => ({
      type: 'document',
      fileType: 'md',
      id: `task-${index}`,
      name: `Task ${index}`,
      ownerId: 'viewer',
      createdAt: new Date(),
      updatedAt: new Date(),
      subType: { type: 'task', is_completed: false },
      properties: [],
    })) as unknown as TaskEntityWithProperties[];
    const [loaded, setLoaded] = createSignal(false);
    const fetchNextPage = vi.fn(async () => {
      setLoaded(true);
    });
    fixture.query = {
      isLoading: false,
      isPending: false,
      isPlaceholderData: false,
      hasNextPage: false,
      data: {
        entities: tasks.slice(0, 10),
        itemsById: {},
        groups: [
          {
            key: 'todo',
            label: 'To do',
            displayOrder: 0,
            totalCount: 20,
            itemIds: tasks.slice(0, 10).map((task) => task.id),
            nextCursor: 'next',
          },
        ],
      },
    };
    fixture.groupQueries = new Map([
      [
        'todo',
        {
          key: 'todo',
          data: () => ({ entities: loaded() ? tasks.slice(10) : [] }),
          hasNextPage: () => !loaded(),
          isFetchingNextPage: () => false,
          fetchNextPage,
          error: () => null,
        },
      ],
    ]);
    let cleanup = () => {};
    const source = createRoot((dispose) => {
      cleanup = dispose;
      return useTasksDataSource(
        {
          tab: 'team-tasks',
          search: '',
          facets: {},
          groupBy: 'status',
          sort: [],
        },
        {
          userId: () => 'viewer',
          tagSets: () => [],
          tagSetsReady: () => true,
          isGroupExpanded: () => true,
          loadAll,
        }
      );
    });
    try {
      await vi.waitFor(() =>
        expect(
          source.items().filter((row) => row.kind === 'entity')
        ).toHaveLength(loadAll ? 20 : 10)
      );
      expect(fetchNextPage).toHaveBeenCalledTimes(loadAll ? 1 : 0);
      expect(source.items().some((row) => row.kind === 'load-more')).toBe(
        !loadAll
      );
    } finally {
      cleanup();
      fixture.groupQueries = new Map();
    }
  }
);

it('retains referenced list rows but hides stale board groups and inaccessible tasks', () => {
  const [placeholder, setPlaceholder] = createSignal(false);
  const [enabled, setEnabled] = createSignal(true);
  const task = {
    type: 'document',
    fileType: 'md',
    id: 'task',
    name: 'Task',
    ownerId: 'viewer',
    createdAt: new Date(),
    updatedAt: new Date(),
    subType: { type: 'task', is_completed: false },
    properties: [
      {
        definition: { id: 'project-definition' },
        value: {
          type: 'EntityReference',
          value: [{ entity_type: 'INITIATIVE', entity_id: 'project' }],
        },
      },
    ],
  } as unknown as TaskEntityWithProperties;
  fixture.query = {
    isLoading: false,
    get isPlaceholderData() {
      return placeholder();
    },
    data: { entities: [task] },
  };
  createRoot((dispose) => {
    try {
      const source = useTasksDataSource(
        {
          tab: 'team-tasks',
          search: '',
          facets: {},
          groupBy: 'none',
          sort: [],
        },
        {
          userId: () => 'viewer',
          tagSets: () => [],
          tagSetsReady: () => true,
          isGroupExpanded: () => true,
          reference: () => ({
            propertyDefinitionId: 'project-definition',
            entityId: 'project',
          }),
          enabled,
        }
      );
      expect(source.items()).toHaveLength(1);
      expect(source.boardRows?.()).toHaveLength(1);
      expect(source.isLoading()).toBe(false);
      setPlaceholder(true);
      expect(source.items()).toHaveLength(1);
      expect(source.boardRows?.()).toEqual([]);
      expect(source.isLoading()).toBe(false);
      setPlaceholder(false);
      setEnabled(false);
      expect(source.items()).toEqual([]);
      expect(source.boardRows?.()).toEqual([]);
      expect(source.isLoading()).toBe(false);
    } finally {
      dispose();
    }
  });
});

it.each([false, true])(
  'scopes grouped continuation rows to the referenced entity (board: %s)',
  (board) => {
    const companies = 'companies-definition';
    const task = (id: string, companyId: string) =>
      ({
        type: 'document',
        fileType: 'md',
        id,
        name: id,
        ownerId: 'viewer',
        createdAt: new Date(),
        updatedAt: new Date(),
        subType: { type: 'task', is_completed: false },
        properties: [
          {
            definition: { id: companies },
            value: {
              type: 'EntityReference',
              value: [{ entity_type: 'COMPANY', entity_id: companyId }],
            },
          },
        ],
      }) as unknown as TaskEntityWithProperties;
    fixture.query = {
      isLoading: false,
      isPlaceholderData: false,
      data: {
        entities: [],
        itemsById: {},
        groups: [
          {
            key: 'todo',
            label: 'To do',
            displayOrder: 0,
            totalCount: 2,
            itemIds: [],
            nextCursor: 'next',
          },
        ],
      },
    };
    // A "Load more" page holding one task that no longer references Acme.
    fixture.groupQueries = new Map([
      [
        'todo',
        {
          data: () => ({
            entities: [task('linked', 'acme'), task('unlinked', 'globex')],
          }),
          hasNextPage: () => false,
          isFetchingNextPage: () => false,
          fetchNextPage: async () => {},
        },
      ],
    ]);
    createRoot((dispose) => {
      try {
        const source = useTasksDataSource(
          {
            tab: 'team-tasks',
            search: '',
            facets: {},
            groupBy: 'status',
            sort: [],
          },
          {
            userId: () => 'viewer',
            tagSets: () => [],
            tagSetsReady: () => true,
            isGroupExpanded: () => !board,
            board: () => board,
            reference: () => ({
              propertyDefinitionId: companies,
              entityId: 'acme',
            }),
          }
        );
        const rows = board ? source.boardRows?.() : source.items();
        expect(
          rows?.flatMap((row) => (row.kind === 'entity' ? [row.entity.id] : []))
        ).toEqual(['linked']);
      } finally {
        dispose();
        fixture.groupQueries = new Map();
      }
    });
  }
);

it('exposes uncollapsed board rows and hides stale groups during query changes', () => {
  const [pending, setPending] = createSignal(false);
  const task: TaskEntityWithProperties = {
    type: 'document',
    fileType: 'md',
    id: 'task',
    name: 'Task',
    ownerId: 'viewer',
    subType: { type: 'task', is_completed: false },
    properties: [],
  };

  fixture.query = {
    get isPending() {
      return pending();
    },
    get isLoading() {
      return pending();
    },
    data: {
      entities: [task],
      itemsById: {},
      groups: [
        { key: 'todo', label: 'To do', totalCount: 1, itemIds: ['task'] },
      ],
    },
  };
  fixture.groupQueries = new Map();

  createRoot((dispose) => {
    try {
      const source = useTasksDataSource(
        {
          tab: 'team-tasks',
          search: '',
          facets: {},
          groupBy: 'status',
          sort: [],
        },
        {
          userId: () => 'viewer',
          tagSets: () => [],
          tagSetsReady: () => true,
          isGroupExpanded: () => false,
          board: () => true,
        }
      );

      expect(
        source.items().filter((row) => row.kind === 'entity')
      ).toHaveLength(0);
      expect(
        source.boardRows?.().filter((row) => row.kind === 'entity')
      ).toHaveLength(1);

      setPending(true);

      expect(source.boardRows?.()).toEqual([]);
      expect(source.boardLoading?.()).toBe(true);

      setPending(false);

      expect(
        source.boardRows?.().filter((row) => row.kind === 'entity')
      ).toHaveLength(1);
    } finally {
      dispose();
    }
  });
});

const COMPANIES = '00000001-0000-0000-0000-00000000000c';

function crmTask(id: string, companyIds: string[] = []) {
  return {
    type: 'document',
    fileType: 'md',
    id,
    name: id,
    ownerId: 'viewer',
    createdAt: new Date(),
    updatedAt: new Date(),
    subType: { type: 'task', is_completed: false },
    properties: companyIds.length
      ? [
          {
            definition: { id: COMPANIES },
            value: {
              type: 'EntityReference',
              value: companyIds.map((entity_id) => ({
                entity_type: 'COMPANY',
                entity_id,
              })),
            },
          },
        ]
      : [],
  } as unknown as TaskEntityWithProperties;
}

function crmSource(groupBy: 'none' | 'status' = 'none') {
  return useTasksDataSource(
    { tab: 'team-tasks', search: '', facets: {}, groupBy, sort: [] },
    {
      userId: () => 'viewer',
      tagSets: () => [],
      tagSetsReady: () => true,
      isGroupExpanded: () => true,
      crm: () => ({ type: 'company', id: 'acme' }),
    }
  );
}

it('keeps server-matched CRM tasks that only mention the record', () => {
  fixture.calls = [];
  fixture.query = {
    isLoading: false,
    isPending: false,
    isPlaceholderData: false,
    data: { entities: [crmTask('mention-only'), crmTask('linked', ['acme'])] },
  };
  createRoot((dispose) => {
    try {
      const source = crmSource();
      expect(
        source
          .items()
          .flatMap((row) => (row.kind === 'entity' ? [row.entity.id] : []))
      ).toEqual(['mention-only', 'linked']);
      const query = fixture.calls[0]?.args() as {
        body: Record<string, unknown>;
      };
      expect(query.body.crma).toEqual({ company: 'acme' });
      expect(query.body.propf).toBeUndefined();
      // The search service cannot express the scope, so it is not used.
      expect(fixture.searchState).not.toHaveBeenCalled();
    } finally {
      dispose();
    }
  });
});

it('keeps CRM continuation rows the server returned for a group', () => {
  fixture.query = {
    isLoading: false,
    isPending: false,
    isPlaceholderData: false,
    data: {
      entities: [],
      itemsById: {},
      groups: [
        {
          key: 'todo',
          label: 'To do',
          displayOrder: 0,
          totalCount: 2,
          itemIds: [],
          nextCursor: 'next',
        },
      ],
    },
  };
  fixture.groupQueries = new Map([
    [
      'todo',
      {
        data: () => ({
          entities: [crmTask('contact-mention'), crmTask('linked', ['acme'])],
        }),
        hasNextPage: () => false,
        isFetchingNextPage: () => false,
        fetchNextPage: async () => {},
      },
    ],
  ]);
  createRoot((dispose) => {
    try {
      const source = crmSource('status');
      expect(
        source
          .items()
          .flatMap((row) => (row.kind === 'entity' ? [row.entity.id] : []))
      ).toEqual(['contact-mention', 'linked']);
    } finally {
      dispose();
      fixture.groupQueries = new Map();
    }
  });
});

it('admits only optimistic CRM tasks that name the record', () => {
  fixture.calls = [];
  fixture.query = {
    isLoading: false,
    isPending: false,
    isPlaceholderData: false,
    data: { entities: [] },
  };
  createRoot((dispose) => {
    try {
      crmSource();
      const options = fixture.calls[0]?.options?.() as {
        meta: { insertFilter: (item: unknown) => boolean };
      };
      fixture.mapItem.mockReturnValueOnce(crmTask('created', ['acme']));
      expect(options.meta.insertFilter({})).toBe(true);
      fixture.mapItem.mockReturnValueOnce(crmTask('unrelated', ['globex']));
      expect(options.meta.insertFilter({})).toBe(false);
      fixture.mapItem.mockReturnValueOnce(crmTask('cached'));
      expect(options.meta.insertFilter({})).toBe(false);
    } finally {
      dispose();
    }
  });
});

it('starts groups in order, skips collapsed groups, and retains revealed groups on expansion', async () => {
  await createRoot(async (dispose) => {
    try {
      const [collapsed, setCollapsed] = createSignal(new Set<string>());
      const queries = ['a', 'b', 'c'].map((key) => {
        const [loaded, setLoaded] = createSignal(false);
        const fetchNextPage = vi.fn(async () => {
          setLoaded(true);
        });
        return {
          key,
          data: () => ({ entities: [] }),
          hasNextPage: () => !loaded(),
          isFetchingNextPage: () => false,
          error: () => null,
          fetchNextPage,
        };
      });
      fixture.groupQueries = new Map(
        queries.map((query) => [query.key, query])
      );
      fixture.query = {
        transport: 'graphql',
        isLoading: false,
        data: {
          entities: [],
          itemsById: {},
          groups: queries.map(({ key }) => ({
            key,
            label: key,
            totalCount: 30,
            itemIds: [],
            nextCursor: null,
          })),
        },
      };
      const source = useTasksDataSource(
        {
          tab: 'team-tasks',
          search: '',
          facets: {},
          groupBy: 'status',
          sort: [],
        },
        {
          userId: () => 'viewer',
          tagSets: () => [],
          tagSetsReady: () => true,
          isGroupExpanded: (key) => !collapsed().has(key),
        }
      );
      const headers = () =>
        source
          .items()
          .flatMap((row) => (row.kind === 'group-header' ? [row.groupId] : []));
      expect(headers()).toEqual(['a']);
      expect(
        queries.every((query) => query.fetchNextPage.mock.calls.length === 0)
      ).toBe(true);
      source.orderedGroups!.retain();
      setCollapsed(new Set(['a']));
      expect(headers()).toEqual(['a', 'b']);
      source.orderedGroups!.retain();
      setCollapsed(new Set<string>());
      expect(headers()).toEqual(['a', 'b']);
      await source.loadMoreGroup('a');
      expect(headers()).toEqual(['a', 'b']);
      await source.loadMoreGroup('b');
      expect(headers()).toEqual(['a', 'b', 'c']);
    } finally {
      fixture.groupQueries.clear();
      dispose();
    }
  });
});

it.each(['list', 'board', 'gantt', 'loadAll', 'date'] as const)(
  'shares lazy group pages while keeping board columns independent (%s)',
  (layout) => {
    fixture.calls = [];
    fixture.query = {
      transport: 'graphql',
      isLoading: false,
      isPending: false,
      isPlaceholderData: false,
      data: {
        entities: [],
        itemsById: {},
        groups: ['a', 'b'].map((key) => ({
          key,
          label: key,
          totalCount: 1,
          itemIds: [],
          nextCursor: null,
        })),
      },
    };
    const groupQueries = new Map(
      ['a', 'b'].map((key) => [
        key,
        {
          key,
          data: () => ({ entities: [] }),
          hasNextPage: () => true,
          isFetchingNextPage: () => false,
          error: () => null,
          fetchNextPage: vi.fn(async () => {}),
        },
      ])
    );
    fixture.groupQueries = groupQueries;
    createRoot((dispose) => {
      try {
        const source = useTasksDataSource(
          {
            tab: 'team-tasks',
            search: '',
            facets: {},
            groupBy: layout === 'date' ? 'date' : 'status',
            sort: [],
          },
          {
            userId: () => 'viewer',
            tagSets: () => [],
            tagSetsReady: () => true,
            isGroupExpanded: () => true,
            board: () => layout === 'board',
            loadAll: layout === 'loadAll',
          }
        );
        const parentOptions = fixture.calls[0]?.options?.() as {
          lazyGroupPagination: boolean;
        };
        expect(parentOptions.lazyGroupPagination).toBe(
          layout === 'list' || layout === 'gantt' || layout === 'board'
        );
        expect(source.orderedGroups?.enabled()).toBe(
          layout === 'list' || layout === 'gantt'
        );
        expect(
          source
            .boardRows?.()
            .flatMap((row) =>
              row.kind === 'group-header' ? [row.groupId] : []
            )
        ).toEqual(layout === 'list' || layout === 'gantt' ? ['a'] : ['a', 'b']);
        if (layout === 'board') {
          const first = groupQueries.get('a');
          const second = groupQueries.get('b');
          expect(first?.fetchNextPage).not.toHaveBeenCalled();
          expect(second?.fetchNextPage).not.toHaveBeenCalled();
          void source.loadMoreGroup('b');
          expect(second?.fetchNextPage).toHaveBeenCalledOnce();
          expect(first?.fetchNextPage).not.toHaveBeenCalled();
        }
      } finally {
        dispose();
        fixture.groupQueries = new Map();
      }
    });
  }
);

it('passes a reactive network pause to both directory and group readers', () => {
  fixture.calls = [];
  fixture.query = {
    transport: 'graphql',
    isLoading: false,
    data: { entities: [], itemsById: {}, groups: [] },
  };
  fixture.groupQueries = new Map();
  createRoot((dispose) => {
    try {
      const [networkPaused, setNetworkPaused] = createSignal(true);
      const source = useTasksDataSource(
        {
          tab: 'team-tasks',
          search: '',
          facets: {},
          groupBy: 'status',
          sort: [],
        },
        {
          userId: () => 'viewer',
          tagSets: () => [],
          tagSetsReady: () => true,
          isGroupExpanded: () => true,
          networkPaused,
        }
      );
      expect(fixture.calls[0]?.options?.()).toMatchObject({
        networkPaused: true,
        lazyGroupPagination: true,
      });
      expect(fixture.groupOptions?.()).toMatchObject({
        networkPaused: true,
        lazyGroupPagination: true,
      });
      expect(source.paginationReady?.()).toBe(false);
      setNetworkPaused(false);
      expect(fixture.calls[0]?.options?.()).toMatchObject({
        networkPaused: false,
      });
      expect(fixture.groupOptions?.()).toMatchObject({ networkPaused: false });
      expect(source.paginationReady?.()).toBe(true);
    } finally {
      dispose();
    }
  });
});

it('keeps retained rows visible but pauses pagination until the current query is ready', () => {
  createRoot((dispose) => {
    try {
      const [pending, setPending] = createSignal(false);
      const [placeholder, setPlaceholder] = createSignal(false);
      fixture.query = {
        transport: 'graphql',
        get isLoading() {
          return pending();
        },
        get isPending() {
          return pending();
        },
        get isPlaceholderData() {
          return placeholder();
        },
        data: {
          entities: [],
          itemsById: {},
          groups: [{ key: 'a', label: 'A', totalCount: 1, itemIds: [] }],
        },
      };
      fixture.groupQueries = new Map();
      const source = useTasksDataSource(
        {
          tab: 'team-tasks',
          search: '',
          facets: {},
          groupBy: 'status',
          sort: [],
        },
        {
          userId: () => 'viewer',
          tagSets: () => [],
          tagSetsReady: () => true,
          isGroupExpanded: () => true,
        }
      );
      expect(source.items()).toHaveLength(1);
      expect(source.paginationReady?.()).toBe(true);
      setPending(true);
      expect(source.items()).toHaveLength(1);
      expect(source.isLoading()).toBe(false);
      expect(source.paginationReady?.()).toBe(false);
      setPending(false);
      setPlaceholder(true);
      expect(source.paginationReady?.()).toBe(false);
      setPlaceholder(false);
      expect(source.paginationReady?.()).toBe(true);
    } finally {
      dispose();
    }
  });
});
