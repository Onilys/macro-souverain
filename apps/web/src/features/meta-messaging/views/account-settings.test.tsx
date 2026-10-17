/** @vitest-environment jsdom */
import type { MetaConnection } from '@service-storage/generated/schemas/metaConnection';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { InstagramLoginError } from '../queries/instagram-login';
import { BusinessMessagingSettings } from './account-settings';

const mocks = vi.hoisted(() => ({
  begin: vi.fn(),
  complete: vi.fn(),
  authorize: vi.fn(),
  close: vi.fn(),
}));
const [connections, setConnections] = createSignal<MetaConnection[]>([]);
vi.mock('@core/context/user', () => ({
  useUserId: () => () => 'macro|owner@fixture.test',
}));
vi.mock('@core/user', () => ({
  getDisplayName: () => 'Owner',
  tryMacroId: (id: string) => id,
}));
vi.mock('@queries/team/teams', () => ({
  useCurrentTeamQuery: () => ({
    isSuccess: true,
    data: { team: { id: 'team', name: 'Messaging team' } },
  }),
  useIsTeamAdmin: () => () => true,
}));
vi.mock('@queries/meta-messaging', () => ({
  useMetaConfiguration: () => ({
    isSuccess: true,
    data: { instagram_app_id: 'app' },
  }),
  useMetaConnections: () => ({
    isSuccess: true,
    get data() {
      return connections();
    },
  }),
  useMetaActions: () => ({
    begin: { mutateAsync: mocks.begin },
    complete: { mutateAsync: mocks.complete },
    register: vi.fn(),
  }),
}));
vi.mock('../queries/instagram-login', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../queries/instagram-login')>()),
  instagramLoginWindow: () => ({
    authorize: mocks.authorize,
    close: mocks.close,
  }),
}));
vi.mock('./history-import', () => ({ AccountHistoryImport: () => null }));

const account: MetaConnection = {
  id: 'connection',
  account_id: 'business',
  team_id: 'team',
  user_id: 'macro|owner@fixture.test',
  provider: 'instagram',
  display_name: 'Controlled business',
  status: 'connected',
  developer_account: false,
  human_agent_approved: false,
};
beforeEach(() => {
  vi.clearAllMocks();
  setConnections([]);
  mocks.begin.mockResolvedValue({
    state: 'state',
    browser_transaction: 'proof',
    configuration: {},
  });
});
afterEach(cleanup);

it('clears transient login instructions after completion and shows the account status', async () => {
  const authorization = Promise.withResolvers<{ code: string }>();
  mocks.authorize.mockReturnValue(authorization.promise);
  mocks.complete.mockImplementation(async () => {
    setConnections([account]);
    return account;
  });
  render(() => <BusinessMessagingSettings />);
  fireEvent.click(screen.getByRole('button', { name: 'Connect Instagram' }));
  fireEvent.click(screen.getByRole('button', { name: 'Connect account' }));
  await screen.findByText(
    'Finish connecting in the Instagram window. Keep Settings open.'
  );
  setConnections([{ ...account, status: 'connecting' }]);
  authorization.resolve({ code: 'code' });
  await screen.findByText('Connected', { exact: true });
  await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  expect(mocks.complete).toHaveBeenCalledWith({
    code: 'code',
    state: 'state',
    browser_transaction: 'proof',
  });
  expect(mocks.close).toHaveBeenCalledOnce();
});

it('clears the popup instruction on cancellation while retaining the error', async () => {
  const authorization = Promise.withResolvers<{ code: string }>();
  mocks.authorize.mockReturnValue(authorization.promise);
  render(() => <BusinessMessagingSettings />);
  fireEvent.click(screen.getByRole('button', { name: 'Connect Instagram' }));
  fireEvent.click(screen.getByRole('button', { name: 'Connect account' }));
  await screen.findByText(
    'Finish connecting in the Instagram window. Keep Settings open.'
  );
  authorization.reject(
    new InstagramLoginError('Instagram connection canceled. You can try again.')
  );
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Instagram connection canceled'
  );
  expect(screen.queryByRole('status')).toBeNull();
  expect(mocks.complete).not.toHaveBeenCalled();
  expect(mocks.close).toHaveBeenCalledOnce();
});
