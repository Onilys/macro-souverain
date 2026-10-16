import '../../../index.css';
import type { TaskEntityWithProperties } from '@entity';
import { createMemo, createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { Gantt } from '../../../components/gantt/gantt';
import { useGantt } from '../../../components/gantt/gantt-context';
import { ganttGroupPlacement } from '../../../components/gantt/gantt-group-placement';
import type {
  TasksDataSource,
  TasksDataSourceItem,
} from '../../tasks-view/queries/use-tasks-query';
import { TaskGanttView } from '../../tasks-view/views/task-gantt-view';
import { createOrderedGroupPagination } from '../primitives/ordered-group-pagination';

function CalendarPosition() {
  const gantt = useGantt();
  return <span data-visible-day={gantt.visibleRange().start} />;
}

function Fixture() {
  const mode = new URLSearchParams(location.search).get('mode') ?? 'ordered';
  const [collapsed, setCollapsed] = createSignal(new Set<string>());
  const [requests, setRequests] = createSignal<string[]>([]);
  const [failNext, setFailNext] = createSignal(false);
  const [height, setHeight] = createSignal(280);
  const [moved, setMoved] = createSignal('');
  const [ready, setReady] = createSignal(true);
  const groups = ['a', 'b', 'c'].map((key) => {
    const [count, setCount] = createSignal(mode === 'date' ? 5 : 0);
    const [loading, setLoading] = createSignal(false);
    return {
      key,
      count,
      isLoading: loading,
      error: () => null,
      hasMore: () => count() < 35,
      load: async () => {
        setLoading(true);
        setRequests((previous) => [...previous, key]);
        await Promise.resolve();
        try {
          if (failNext()) {
            setFailNext(false);
            throw new Error('Fixture unavailable');
          }
          setCount((previous) => Math.min(35, previous + 5));
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
  const rows = createMemo<TasksDataSourceItem[]>(() =>
    (mode === 'ordered'
      ? pagination.visible()
      : mode === 'flat'
        ? groups.slice(0, 1)
        : groups
    ).flatMap((group) => {
      const result: TasksDataSourceItem[] = [
        {
          kind: 'group-header',
          id: `header:${group.key}`,
          groupId: group.key,
          label: `Group ${group.key}`,
          count: 35,
        },
      ];
      if (mode === 'flat') result.length = 0;
      if (collapsed().has(group.key)) return result;
      const count = groups.find((entry) => entry.key === group.key)!.count();
      for (let i = 0; i < count; i++) {
        const entity: TaskEntityWithProperties = {
          id: `${group.key}:${i}`,
          name: `${group.key} task ${i}`,
          type: 'document',
          ownerId: 'fixture',
          createdAt: new Date(Date.now() - (i >= 10 ? 100 : 7) * 86400000),
          updatedAt: new Date(),
          properties: [],
          subType: { type: 'task', is_completed: false },
          fileType: 'md',
        };
        result.push({
          kind: 'entity',
          id: `${group.key}:${i}`,
          groupId: group.key,
          entity,
        });
      }
      if (mode !== 'flat' && group.hasMore())
        result.push({
          kind: 'load-more',
          id: `more:${group.key}`,
          scopeId: group.key,
          groupId: group.key,
          isLoading: group.isLoading(),
        });
      return result;
    })
  );
  const source: TasksDataSource = {
    items: rows,
    paginationReady: ready,
    boardRows: rows,
    isLoading: () => false,
    isFetching: () => false,
    error: () => undefined,
    hasMore: () => mode === 'flat' && groups[0].hasMore(),
    isLoadingMore: () => mode === 'flat' && groups[0].isLoading(),
    loadMore: groups[0].load,
    refresh: async () => {},
    loadMoreGroup: async (key) => {
      if (mode === 'ordered') await pagination.load(key);
      else await groups.find((group) => group.key === key)?.load();
    },
    groupError: pagination.error,
    orderedGroups: {
      enabled: () => mode === 'ordered',
      identity: () => 'fixture',
      retain: pagination.retain,
      error: pagination.error,
      load: pagination.load,
    },
  };
  return (
    <div style={{ padding: '8px', height: '100vh' }}>
      <div class="flex gap-2 flex-wrap" style={{ 'min-height': '40px' }}>
        <button onClick={() => toggle('a')}>Toggle a</button>
        <button onClick={() => setReady((value) => !value)}>
          Toggle readiness
        </button>
        <button onClick={() => setFailNext(true)}>Fail next</button>
        <button
          onClick={() => setHeight((value) => (value === 280 ? 650 : 280))}
        >
          Resize
        </button>
        <output
          data-testid="requests"
          data-group-b-index={rows().findIndex(
            (row) => row.kind === 'group-header' && row.groupId === 'b'
          )}
        >
          {requests().join(',')}
        </output>
        <output data-testid="moved">{moved()}</output>
      </div>
      <div style={{ height: `${height()}px`, width: '100%' }}>
        <TaskGanttView
          source={source}
          groupBy={
            mode === 'flat' ? 'none' : mode === 'date' ? 'date' : 'status'
          }
          createAssigneeName={(id) => id}
          isGroupExpanded={(id) => !collapsed().has(id)}
          onToggleGroup={toggle}
          onOpen={() => {}}
          groupMoves={{
            scope: 'fixture',
            canDrag: () => true,
            canDrop: () => true,
            getPlacement: (move) =>
              ganttGroupPlacement({
                items: rows(),
                move,
                getEntity: (row) =>
                  row.kind === 'entity' ? row.entity : undefined,
                getGroup: (row) =>
                  row.kind === 'section-header' ? undefined : row.groupId,
                compare: (a, b) => a.name.localeCompare(b.name),
              }),
            onMove: async (move) => {
              setMoved(`${move.fromGroup}:${move.toGroup}`);
            },
          }}
          renderEntity={(task, label) => (
            <>
              {label}
              <CalendarPosition />
              <Gantt.Bar start={task().createdAt} title={task().name}>
                {task().name}
              </Gantt.Bar>
            </>
          )}
        />
      </div>
    </div>
  );
}
render(() => <Fixture />, document.getElementById('root')!);
