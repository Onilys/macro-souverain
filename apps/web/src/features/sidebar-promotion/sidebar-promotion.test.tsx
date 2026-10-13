import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SidebarPromotion } from './sidebar-promotion';

const server = vi.hoisted(() => ({
  status: 'success' as 'success' | 'pending' | 'error',
  dismissed: [] as string[],
  dismiss: vi.fn(),
}));
vi.mock('@core/context/user', () => ({ useUserId: () => () => 'user' }));
vi.mock('@queries/prompt-dismissals', () => ({
  usePromptDismissalsQuery: () => ({
    get isSuccess() {
      return server.status === 'success';
    },
    get isError() {
      return server.status === 'error';
    },
    get data() {
      return { dismissed: server.dismissed };
    },
  }),
  dismissPromptEverywhere: server.dismiss,
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  server.status = 'success';
  server.dismissed = [];
  server.dismiss.mockClear();
});

const logos = [{ name: 'GitHub', icon: () => <svg /> }];

describe('SidebarPromotion', () => {
  it('runs both actions with their buttons and stays dismissed', () => {
    const action = vi.fn();
    const secondary = vi.fn();
    const view = render(() => (
      <SidebarPromotion
        id="test"
        logos={logos}
        headline="Set up"
        pitch="Do the thing."
        action={{ label: 'Connect tools', onClick: action }}
        secondaryAction={{ label: 'Invite team', onClick: secondary }}
      />
    ));
    fireEvent.click(screen.getByRole('button', { name: 'Connect tools' }));
    fireEvent.click(screen.getByRole('button', { name: 'Invite team' }));
    expect(action).toHaveBeenCalledWith(expect.any(HTMLButtonElement));
    expect(secondary).toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss connect tools' })
    );
    expect(screen.queryByText('Set up')).toBeNull();
    expect(server.dismiss).toHaveBeenCalledWith('test');
    view.unmount();
    render(() => (
      <SidebarPromotion
        id="test"
        logos={logos}
        headline="Set up"
        pitch="Do the thing."
        action={{ label: 'Connect tools', onClick: action }}
      />
    ));
    expect(screen.queryByText('Set up')).toBeNull();
  });

  it('hides while satisfied without recording a dismissal', () => {
    const [satisfied, setSatisfied] = createSignal(true);
    render(() => (
      <SidebarPromotion
        id="satisfied"
        logos={logos}
        headline="More calendars"
        pitch="Add one."
        satisfied={satisfied()}
        action={{ label: 'Connect', onClick: () => {} }}
      />
    ));
    expect(screen.queryByText('More calendars')).toBeNull();
    setSatisfied(false);
    expect(screen.getByText('More calendars')).toBeTruthy();
  });

  it('stays hidden when another device dismissed it', () => {
    server.dismissed = ['elsewhere'];
    render(() => (
      <SidebarPromotion
        id="elsewhere"
        logos={logos}
        headline="Dismissed elsewhere"
        pitch="Gone."
        action={{ label: 'Go', onClick: () => {} }}
      />
    ));
    expect(screen.queryByText('Dismissed elsewhere')).toBeNull();
  });

  it('waits for the server, then falls back to showing on error', () => {
    server.status = 'pending';
    const view = render(() => (
      <SidebarPromotion
        id="loading"
        logos={logos}
        headline="Loading card"
        pitch="Wait."
        action={{ label: 'Go', onClick: () => {} }}
      />
    ));
    expect(screen.queryByText('Loading card')).toBeNull();
    view.unmount();
    server.status = 'error';
    render(() => (
      <SidebarPromotion
        id="loading"
        logos={logos}
        headline="Loading card"
        pitch="Wait."
        action={{ label: 'Go', onClick: () => {} }}
      />
    ));
    expect(screen.getByText('Loading card')).toBeTruthy();
  });
});
