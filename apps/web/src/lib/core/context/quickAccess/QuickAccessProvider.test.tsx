import { cleanup, render, screen } from '@solidjs/testing-library';
import { createSignal, onCleanup, type ParentProps } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { useQuickAccess } from './context';
import { QuickAccessProvider } from './QuickAccessProvider';

const [authenticated, setAuthenticated] = createSignal<boolean | undefined>();
const [userId, setUserId] = createSignal<string>();
const mountSource = vi.fn();
const disposeSource = vi.fn();
const refresh = vi.fn();
const loadMore = vi.fn();

vi.mock('@core/context/user', () => ({
  useIsAuthenticated: () => authenticated,
  useUserId: () => userId,
}));
vi.mock('@channel/DebugSuspense', () => ({
  DebugSuspense: (props: ParentProps) => props.children,
}));
vi.mock('./QuickAccessSource', () => ({
  createQuickAccessValue: () => {
    const id = userId();
    mountSource(id);
    onCleanup(() => disposeSource(id));
    return {
      useList: () => ({
        items: () => [{ kind: 'user', id }],
        totalCount: () => 1,
        hasMore: () => true,
        isLoading: () => false,
        isLoadingMore: () => false,
        loadMore,
      }),
      usesRecordSelection: () => true,
      usesSearchProjection: () => true,
      isLoading: () => false,
      refresh,
      getById: () => undefined,
    };
  },
}));

afterEach(() => {
  cleanup();
  setAuthenticated(undefined);
  setUserId(undefined);
  vi.clearAllMocks();
});

it('keeps consumers mounted while creating and disposing account sources across login and logout', async () => {
  let mounted = 0;
  let refreshCurrent: () => void = () => {};
  let loadCurrent: () => Promise<void> = async () => {};
  function Consumer() {
    mounted++;
    const access = useQuickAccess();
    const list = access.useList('person');
    refreshCurrent = access.refresh;
    loadCurrent = list.loadMore;
    return (
      <div>
        {list
          .items()
          .map((item) => item.id)
          .join(',') || 'No account data'}
      </div>
    );
  }
  render(() => (
    <QuickAccessProvider>
      <Consumer />
    </QuickAccessProvider>
  ));
  expect(screen.getByText('No account data')).toBeTruthy();
  expect(mountSource).not.toHaveBeenCalled();
  refreshCurrent();
  await loadCurrent();
  expect(refresh).not.toHaveBeenCalled();
  expect(loadMore).not.toHaveBeenCalled();

  setUserId('alice');
  setAuthenticated(false);
  expect(mountSource).not.toHaveBeenCalled();
  setAuthenticated(true);
  expect(screen.getByText('alice')).toBeTruthy();
  refreshCurrent();
  await loadCurrent();
  expect(refresh).toHaveBeenCalledOnce();
  expect(loadMore).toHaveBeenCalledOnce();

  setUserId('bob');
  expect(disposeSource).toHaveBeenCalledWith('alice');
  expect(screen.getByText('bob')).toBeTruthy();
  setAuthenticated(false);
  expect(disposeSource).toHaveBeenCalledWith('bob');
  expect(screen.getByText('No account data')).toBeTruthy();
  expect(mountSource).toHaveBeenCalledTimes(2);
  expect(mounted).toBe(1);
});
