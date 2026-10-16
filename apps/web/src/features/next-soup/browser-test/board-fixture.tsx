import '@app/index.css';
import { createMemo, createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';
import { render } from 'solid-js/web';
import type { TaskBoardData } from '../../tasks-view/context/task-board';
import type { TasksDataSource } from '../../tasks-view/queries/use-tasks-query';
import type { TasksViewState } from '../../tasks-view/types';
import { TaskBoardView } from '../../tasks-view/views/task-board-view';

function Fixture() {
  const params = new URLSearchParams(location.search);
  const global = params.has('global') || params.has('empty');
  const [ready, setReady] = createSignal(!params.has('paused'));
  const [counts, setCounts] = createSignal({ a: 0, b: 0, c: global ? 5 : 0 });
  const [failNext, setFailNext] = createSignal(false);
  const [requests, setRequests] = createSignal<string[]>([]);
  const [pending, setPending] = createSignal(new Set<string>());
  const [errors, setErrors] = createSignal(new Map<string, Error>());
  const [height, setHeight] = createSignal(360);
  const [width, setWidth] = createSignal(360);
  const [globalPages, setGlobalPages] = createSignal(0);
  const [state, setState] = createStore<TasksViewState>({
    layout: 'board',
    tab: 'my-tasks',
    groupBy: 'status',
    search: global ? 'task' : '',
    facets: {},
    sort: [],
    collapsedGroupIds: [],
    collapsedSidebarSectionIds: [],
  });
  async function load(key: string) {
    setPending((previous) => new Set([...previous, key]));
    setErrors(
      (previous) => new Map([...previous].filter(([id]) => id !== key))
    );
    setRequests((values) => [...values, key]);
    await Promise.resolve();
    try {
      if (failNext()) {
        setFailNext(false);
        const error = new Error('fixture failure');
        setErrors((previous) => new Map([...previous, [key, error]]));
        throw error;
      }
      if (key === 'global') {
        setGlobalPages((value) => value + 1);
        const destination = globalPages() === 1 ? 'c' : 'a';
        setCounts((values) => ({
          ...values,
          [destination]: values[destination] + 5,
        }));
      } else if (key === 'a' || key === 'b' || key === 'c') {
        setCounts((values) => ({ ...values, [key]: values[key] + 5 }));
      }
    } finally {
      setPending(
        (previous) => new Set([...previous].filter((id) => id !== key))
      );
    }
  }
  const columns = createMemo(() =>
    (params.has('empty') && globalPages() < 2
      ? []
      : Object.entries(counts())
    ).map(([id, count]) => ({
      id,
      label: id,
      count: global ? undefined : 30,
      hasMore: !global && count < 30,
      loadingMore: pending().has(id),
      tasks: Array.from({ length: count }, (_, index) => ({
        id: `${id}:${index}`,
        name: `${id}:${index}`,
        statusId: id,
        assigneeIds: [],
        projectIds: [],
      })),
    }))
  );
  const source: TasksDataSource = {
    items: () => [],
    paginationReady: ready,
    isLoading: () => false,
    isFetching: () => pending().size > 0,
    error: () => errors().get('global'),
    hasMore: () => global && globalPages() < 3,
    isLoadingMore: () => pending().has('global'),
    loadMore: () => load('global'),
    loadMoreGroup: load,
    groupError: (id) => errors().get(id),
    refresh: async () => {
      setErrors(new Map());
    },
  };
  const data: TaskBoardData = {
    columns,
    task: (id) =>
      columns()
        .flatMap((column) => column.tasks)
        .find((task) => task.id === id),
    hiddenColumnCount: () => 0,
    createAssigneeName: (id) => id,
    actions: {
      canEditTask: () => true,
      canMoveTo: () => true,
      save: async () => undefined,
    },
    property: () => undefined,
    canEditProperty: () => false,
    saveProperty: async () => undefined,
    definitionError: () => false,
    retryDefinitions: async () => undefined,
  };
  return (
    <>
      <button onClick={() => setFailNext(true)}>Fail next</button>
      <button onClick={() => setReady(true)}>Resume</button>
      <button onClick={() => setHeight(700)}>Grow height</button>
      <button onClick={() => setWidth(720)}>Grow width</button>
      <button
        onClick={() => {
          setState('search', 'changed');
          setErrors(new Map());
        }}
      >
        Change filters
      </button>
      <output data-testid="requests">{requests().join(',')}</output>
      <output data-testid="counts">{JSON.stringify(counts())}</output>
      <div
        style={{
          width: `${width()}px`,
          height: `${height()}px`,
          display: 'flex',
        }}
      >
        <TaskBoardView
          data={data}
          source={source}
          state={state}
          projectsEnabled={() => false}
          onFacetsChange={() => undefined}
          onOpen={() => undefined}
        />
      </div>
    </>
  );
}

render(() => <Fixture />, document.getElementById('root')!);
