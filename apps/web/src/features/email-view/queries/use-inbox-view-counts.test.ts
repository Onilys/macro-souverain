import { useSoupAstItemsQuery } from '@queries/soup/items';
import { createRoot } from 'solid-js';
import { createStore } from 'solid-js/store';
import { expect, it, vi } from 'vitest';
import type { EmailViewState } from '../types';
import { useInboxViewCounts } from './use-inbox-view-counts';

vi.mock('@core/context/user', () => ({ useUserId: () => () => 'user' }));
vi.mock('@queries/soup/items', () => ({ useSoupAstItemsQuery: vi.fn() }));

it('uses server group totals rather than the size of the loaded item page', () => {
  const query = vi.mocked(useSoupAstItemsQuery);
  let failure: Error | null = null;
  const result = {
    data: {
      entities: [],
      groups: [
        {
          key: 'email',
          label: 'Email',
          displayOrder: 0,
          totalCount: 194,
          itemIds: [],
          nextCursor: null,
        },
      ],
      cachedMail: false,
    },
    get error() {
      return failure;
    },
    isPending: false,
    isLoading: false,
    isFetching: false,
    isPlaceholderData: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    isEnabled: true,
    hasNextPage: false,
    transport: 'graphql' as const,
    fetchNextPage: async () => {},
    refetch: async () => {},
    refresh: async () => {},
    resetToInitialPage: () => {},
  };
  query.mockReturnValue(result);
  createRoot((dispose) => {
    const [scope, setScope] = createStore<
      Pick<EmailViewState, 'inboxIds' | 'aliasFilter'>
    >({ inboxIds: ['account'] });
    const counts = useInboxViewCounts(scope);
    const args = () => query.mock.calls[0][0]();
    expect(JSON.stringify(args().body)).toContain('account');
    setScope('aliasFilter', {
      inboxId: 'account',
      emailAddress: 'alias@example.com',
    });
    expect(JSON.stringify(args().body)).toContain('alias@example.com');
    setScope({ inboxIds: ['second'], aliasFilter: undefined });
    expect(JSON.stringify(args().body)).toContain('second');
    expect(JSON.stringify(args().body)).not.toContain('alias@example.com');
    expect(counts()).toEqual({ important: 194, noise: 194, calendar: 194 });
    result.isPending = true;
    expect(counts().important).toBeUndefined();
    result.isPending = false;
    failure = new Error('Unavailable');
    expect(counts().important).toBeUndefined();
    failure = null;
    result.isPlaceholderData = true;
    expect(counts().important).toBeUndefined();
    result.isPlaceholderData = false;
    result.data.cachedMail = true;
    expect(counts().important).toBeUndefined();
    dispose();
  });
});

vi.mock('@app/features/soup', async () => ({
  ...(await import('@app/features/soup/filters')),
}));
vi.mock('@service-storage/websocket', () => ({
  storageWS: { reconnectIfDisconnected: vi.fn() },
  createWebSocketJob: vi.fn(),
}));
vi.mock('@service-connection/websocket', () => ({
  ws: { addEventListener: vi.fn(), send: vi.fn() },
  state: () => 'closed',
  createConnectionBlockWebsocketEffect: vi.fn(),
  createConnectionWebsocketEffect: vi.fn(),
}));
