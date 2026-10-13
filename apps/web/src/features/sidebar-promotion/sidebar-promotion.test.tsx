import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SidebarPromotion } from './sidebar-promotion';

vi.mock('@core/context/user', () => ({ useUserId: () => () => 'user' }));

afterEach(() => {
  cleanup();
  localStorage.clear();
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
});
