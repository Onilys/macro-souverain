import { render } from '@solidjs/testing-library';
import { type ComponentProps, createSignal } from 'solid-js';
import { expect, it, vi } from 'vitest';
import type {
  TasksDataSource,
  TasksDataSourceItem,
} from './queries/use-tasks-query';
import { TasksGantt } from './tasks-gantt';
import type { TaskGanttView } from './views/task-gantt-view';

const fixture: {
  source?: TasksDataSource;
  view?: ComponentProps<typeof TaskGanttView>;
  move: ReturnType<typeof vi.fn>;
} = vi.hoisted(() => ({ move: vi.fn(async () => {}) }));

vi.mock('@app/components/gantt/gantt', () => ({ Gantt: {} }));
vi.mock('@app/features/next-soup/actions', () => ({
  resolveEntityActionViewContext: vi.fn(),
  toSingleEntityActionListState: vi.fn(),
}));
vi.mock('@app/features/next-soup/utils', () => ({
  openEntityInSplitFromUnifiedList: vi.fn(),
}));
vi.mock('@app/features/soup', () => ({ SoupEntityContextMenu: () => null }));
vi.mock('@components/app/split-layout/layout', () => ({
  useSplitLayout: () => ({}),
}));
vi.mock('@components/app/split-layout/layoutUtils', () => ({
  useSplitPanelOrThrow: () => ({}),
}));
vi.mock('@entity', () => ({ getTaskStatusOptionId: vi.fn() }));
vi.mock('@property/component/propertyValue', () => ({
  PropertyValueIcon: () => null,
}));
vi.mock('@property/hooks/usePropertyUserDisplay', () => ({
  usePropertyUserDisplay: () => ({ name: () => '' }),
}));
vi.mock('./constants', () => ({ TASK_SORT_DEFINITIONS: [] }));
vi.mock('./queries/task-gantt', () => ({ taskGanttDates: vi.fn() }));
vi.mock('./queries/task-gantt-queries', () => ({
  createTaskGanttQueries: () => ({
    canDrag: () => true,
    canMove: () => true,
    moveGroup: fixture.move,
  }),
}));
vi.mock('./tasks-view-context', () => ({
  useTasksView: () => ({
    source: fixture.source,
    state: {
      tab: 'team-tasks',
      groupBy: 'status',
      search: '',
      facets: {},
      sort: [],
      collapsedGroupIds: [],
    },
    setState: vi.fn(),
    openTask: vi.fn(),
    projectsEnabled: () => true,
  }),
}));
vi.mock('./views/task-gantt-view', () => ({
  TaskGanttView: (props: ComponentProps<typeof TaskGanttView>) => {
    fixture.view = props;
    return (
      <div data-testid="loaded-tasks">
        {props.source.items().filter((row) => row.kind === 'entity').length}
      </div>
    );
  },
}));

it('keeps loaded pages and the later drop group after a successful property move', async () => {
  const rows: TasksDataSourceItem[] = ['a', 'b'].flatMap((groupId) => [
    {
      kind: 'group-header',
      id: `header:${groupId}`,
      groupId,
      label: groupId,
      count: 15,
    },
    ...Array.from(
      { length: 15 },
      (_, index): TasksDataSourceItem => ({
        kind: 'entity',
        id: `${groupId}:${index}`,
        groupId,
        entity: {
          id: `${groupId}:${index}`,
          name: 'Task',
          ownerId: 'viewer',
          type: 'document',
          fileType: 'md',
          subType: { type: 'task' },
        },
      })
    ),
  ]);
  const [items, setItems] = createSignal<readonly TasksDataSourceItem[]>(rows);
  const refresh = vi.fn(async () => {
    setItems(rows.slice(0, 6));
  });
  fixture.source = {
    items,
    isLoading: () => false,
    isFetching: () => false,
    error: () => undefined,
    hasMore: () => false,
    isLoadingMore: () => false,
    loadMore: async () => {},
    loadMoreGroup: async () => {},
    refresh,
  };
  const screen = render(() => <TasksGantt />);
  expect(screen.getByTestId('loaded-tasks').textContent).toBe('30');
  const move = { id: 'a:0', fromGroup: 'a', toGroup: 'b' };
  await fixture.view!.groupMoves.onMove(move);
  expect(fixture.move).toHaveBeenCalledWith(move);
  expect(screen.getByTestId('loaded-tasks').textContent).toBe('30');
  expect(
    items().some((row) => row.kind === 'group-header' && row.groupId === 'b')
  ).toBe(true);
  expect(refresh).not.toHaveBeenCalled();
  // Explicit user refresh remains a reset; a background property save must not invoke it.
  await refresh();
  expect(screen.getByTestId('loaded-tasks').textContent).toBe('5');
});
