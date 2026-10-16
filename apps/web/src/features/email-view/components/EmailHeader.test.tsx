import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@solidjs/testing-library';
import type { ParentProps } from 'solid-js';
import { createStore } from 'solid-js/store';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EmailTopBar } from './EmailHeader';

const [state, setState] = createStore({ tab: 'important' });
const setTab = vi.fn((tab: string) => setState('tab', tab));
vi.mock('../email-view-context', () => ({
  useEmailView: () => ({ state, setTab }),
}));
vi.mock('../queries/use-inbox-view-counts', () => ({
  useInboxViewCounts: () => () => ({ important: 194, noise: 12, calendar: 51 }),
}));
vi.mock('@app/components/view-shell', () => ({
  ViewShell: {
    TopBar: (props: ParentProps) => <header>{props.children}</header>,
  },
  ViewBreadcrumbs: { Outlet: () => <span>Folder location</span> },
  SidebarActionRow: () => null,
  useViewControlHotkeys: () => {},
}));
vi.mock('./EmailControls', () => ({ EmailControls: () => null }));
vi.mock('./EmailInboxSelector', () => ({ EmailInboxMenu: () => null }));
afterEach(cleanup);
beforeEach(() => {
  setState('tab', 'important');
  setTab.mockClear();
});

it('shows text views in Important, Other, Calendar order with their totals', () => {
  render(() => <EmailTopBar />);
  const views = within(screen.getByRole('navigation', { name: 'Inbox views' }));
  expect(
    views.getAllByRole('button').map((button) => button.textContent)
  ).toEqual(['Important194', 'Other12', 'Calendar51']);
  expect(
    views
      .getByRole('button', { name: /Important/ })
      .getAttribute('aria-current')
  ).toBe('page');
  expect(screen.queryByText('Inbox')).toBeNull();
  expect(screen.queryByText('Signal')).toBeNull();
});

it('switches the view and selected text when a header control is clicked', () => {
  render(() => <EmailTopBar />);
  fireEvent.click(screen.getByRole('button', { name: /Calendar/ }));
  expect(setTab).toHaveBeenLastCalledWith('calendar');
  expect(
    screen
      .getByRole('button', { name: /Calendar/ })
      .getAttribute('aria-current')
  ).toBe('page');
  fireEvent.click(screen.getByRole('button', { name: /Other/ }));
  expect(setTab).toHaveBeenLastCalledWith('noise');
});
