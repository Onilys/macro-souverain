import { cleanup, render, screen } from '@solidjs/testing-library';
import { createSignal, type ParentProps } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { useQuickAccess } from './context';
import { QuickAccessProvider } from './QuickAccessProvider';

const [sourceError, setSourceError] = createSignal<Error>();

vi.mock('@channel/DebugSuspense', () => ({
  DebugSuspense: (props: ParentProps) => props.children,
}));
vi.mock('./QuickAccessSource', () => ({
  createQuickAccessValue: () => ({
    useList: () => ({
      error: sourceError,
      items: () => [],
      totalCount: () => 0,
      hasMore: () => false,
      isLoading: () => false,
      isLoadingMore: () => false,
      loadMore: async () => {},
    }),
    usesRecordSelection: () => true,
    usesSearchProjection: () => true,
    isLoading: () => false,
    refresh: () => {},
    getById: () => undefined,
  }),
}));

afterEach(() => {
  cleanup();
  setSourceError(undefined);
});

it.each(['buckets', 'options'])(
  'forwards reactive list errors and recovery with %s',
  (mode) => {
    function Consumer() {
      const access = useQuickAccess();
      const list =
        mode === 'buckets'
          ? access.useList('person')
          : access.useList({
              buckets: ['email'],
              searchTerm: () => 'proposal',
            });
      return <div>{list.error() ? 'Unavailable' : 'Ready'}</div>;
    }
    render(() => (
      <QuickAccessProvider>
        <Consumer />
      </QuickAccessProvider>
    ));
    expect(screen.getByText('Ready')).toBeTruthy();

    setSourceError(new Error('Cache unavailable'));
    expect(screen.getByText('Unavailable')).toBeTruthy();

    setSourceError(undefined);
    expect(screen.getByText('Ready')).toBeTruthy();
  }
);
