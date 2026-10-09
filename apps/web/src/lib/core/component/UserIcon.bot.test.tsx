import { botProfileKeys } from '@queries/bots/keys';
import { cleanup, fireEvent, render, waitFor } from '@solidjs/testing-library';
import { QueryClient, QueryClientProvider } from '@tanstack/solid-query';
import { ok } from 'neverthrow';
import { createSignal, Suspense } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UserIcon } from './UserIcon';

const { getBotOwnerProfiles } = vi.hoisted(() => ({
  getBotOwnerProfiles: vi.fn(),
}));
vi.mock('@service-storage/client', () => ({
  storageServiceClient: { getBotOwnerProfiles },
}));
vi.mock('@components/app/split-layout/layout', () => ({
  useSplitLayout: () => ({ openWithSplit: vi.fn() }),
}));
vi.mock('@queries/channel/get-or-create-dm', () => ({
  useGetOrCreateDirectMessageMutation: () => ({ mutate: vi.fn() }),
}));
vi.mock('@core/user', () => ({
  getDisplayName: () => undefined,
  getDisplayNameParts: () => ({ firstName: '', lastName: '' }),
  getInitials: () => '?',
  macroIdToEmail: (id: string) => id,
  tryMacroId: () => undefined,
  useIsConnectedSecondaryInbox: () => () => false,
}));
vi.mock('@core/signal/profilePicture', () => ({
  useProfilePictureUrl: () => [() => undefined],
}));
vi.mock('@core/component/UserCardTrigger', () => ({
  UserCardTrigger: () => null,
}));

const BOT_ID = '11111111-2222-3333-4444-555555555555';
const SECOND_BOT_ID = '22222222-2222-3333-4444-555555555555';
const avatarUrl = 'https://example.com/pickle.png';
const clients: QueryClient[] = [];
function client() {
  const value = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(value);
  return value;
}
afterEach(() => {
  cleanup();
  for (const value of clients.splice(0)) value.clear();
  vi.clearAllMocks();
});

describe('agent avatars from a principal ID', () => {
  it('loads the saved picture without suspending the thread and shares duplicate lookups', async () => {
    const response = ok([
      { id: BOT_ID, name: 'pickle', avatar_url: avatarUrl },
    ]);
    let resolve!: (value: typeof response) => void;
    getBotOwnerProfiles.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    const { container, queryByText } = render(() => (
      <QueryClientProvider client={client()}>
        <Suspense fallback={<span>Thread hidden</span>}>
          <UserIcon id={`bot|${BOT_ID}`} suppressClick showTooltip={false} />
          <UserIcon id={`bot|${BOT_ID}`} suppressClick showTooltip={false} />
        </Suspense>
      </QueryClientProvider>
    ));
    await waitFor(() => expect(getBotOwnerProfiles).toHaveBeenCalledOnce());
    expect(queryByText('Thread hidden')).toBeNull();
    expect(container.querySelectorAll('svg')).toHaveLength(2);
    expect(getBotOwnerProfiles).toHaveBeenCalledWith({ ids: [BOT_ID] });
    resolve(response);
    await waitFor(() =>
      expect(container.querySelectorAll('img')).toHaveLength(2)
    );
    expect(container.querySelector('img')?.src).toBe(avatarUrl);
  });

  it('uses a supplied picture without fetching and keeps a fallback if the image fails', () => {
    const { container } = render(() => (
      <QueryClientProvider client={client()}>
        <UserIcon id={`bot|${BOT_ID}`} photoUrl={avatarUrl} />
      </QueryClientProvider>
    ));
    const image = container.querySelector('img')!;
    expect(image.src).toBe(avatarUrl);
    fireEvent.error(image);
    expect(image.hasAttribute('data-failed')).toBe(true);
    expect(container.querySelector('svg')).not.toBeNull();
    expect(getBotOwnerProfiles).not.toHaveBeenCalled();
  });

  it('updates the image when the saved profile or principal changes', async () => {
    const queryClient = client();
    queryClient.setQueryData(botProfileKeys.detail(BOT_ID).queryKey, {
      name: 'pickle',
      avatarUrl,
      deleted: false,
    });
    queryClient.setQueryData(botProfileKeys.detail(SECOND_BOT_ID).queryKey, {
      name: 'Other',
      avatarUrl: 'https://example.com/other.png',
      deleted: false,
    });
    queryClient.setDefaultOptions({ queries: { staleTime: Infinity } });
    const [id, setId] = createSignal(BOT_ID);
    const { container } = render(() => (
      <QueryClientProvider client={queryClient}>
        <UserIcon id={`bot|${id()}`} />
      </QueryClientProvider>
    ));
    expect(container.querySelector('img')?.src).toBe(avatarUrl);
    queryClient.setQueryData(botProfileKeys.detail(BOT_ID).queryKey, {
      name: 'pickle',
      avatarUrl: 'https://example.com/new.png',
      deleted: false,
    });
    await waitFor(() =>
      expect(container.querySelector('img')?.src).toBe(
        'https://example.com/new.png'
      )
    );
    setId(SECOND_BOT_ID);
    await waitFor(() =>
      expect(container.querySelector('img')?.src).toBe(
        'https://example.com/other.png'
      )
    );
    expect(getBotOwnerProfiles).not.toHaveBeenCalled();
  });
});
