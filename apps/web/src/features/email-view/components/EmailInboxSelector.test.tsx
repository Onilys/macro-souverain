import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { afterEach, expect, it, vi } from 'vitest';
import { EmailInboxList } from './EmailInboxSelector';

const mocks = vi.hoisted(() => ({
  selectInbox: vi.fn(),
  selectAlias: vi.fn(),
  addAccount: vi.fn(),
}));
vi.mock('../email-view-context', () => ({
  useEmailView: () => ({
    state: { inboxIds: undefined, aliasFilter: undefined },
    setInboxIds: mocks.selectInbox,
    setAliasFilter: mocks.selectAlias,
  }),
}));
vi.mock('@app/lib/analytics/posthog', () => ({
  useFeatureFlag: () => () => ({ enabled: true }),
}));
vi.mock('@core/email-link', () => ({
  useAddInboxFlow: () => mocks.addAccount,
}));
vi.mock('@queries/email/mail-accounts', () => ({
  useMailAccountsQuery: () => ({
    isSuccess: true,
    data: {
      links: [
        {
          id: 'account',
          email_address: 'base@example.com',
          sendAs: [{ email_address: 'alias@example.com' }],
        },
      ],
    },
  }),
}));
vi.mock('@core/component/UserIcon', () => ({ UserIcon: () => <span /> }));
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
afterEach(cleanup);

it('shows compact account and alias choices plus an Add account row', () => {
  render(() => <EmailInboxList />);
  expect(
    screen.queryByRole('heading', { name: 'Accounts & Aliases' })
  ).toBeNull();
  expect(screen.queryByRole('radiogroup')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'base@example.com' }));
  expect(mocks.selectInbox).toHaveBeenLastCalledWith(['account']);
  fireEvent.click(screen.getByRole('button', { name: 'alias@example.com' }));
  expect(mocks.selectAlias).toHaveBeenLastCalledWith({
    inboxId: 'account',
    emailAddress: 'alias@example.com',
  });
  fireEvent.click(screen.getByRole('button', { name: 'All inboxes' }));
  expect(mocks.selectInbox).toHaveBeenLastCalledWith(undefined);
  fireEvent.click(screen.getByRole('button', { name: 'Add account' }));
  expect(mocks.addAccount).toHaveBeenCalledOnce();
});
