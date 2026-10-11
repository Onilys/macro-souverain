import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeInboxModeToggle } from './HomeInboxModeToggle';

const [inboxMode, setInboxModeSignal] = createSignal(false);
const setInboxMode = vi.fn((enabled: boolean) => setInboxModeSignal(enabled));

vi.mock('../home-view-context', () => ({
  useHomeView: () => ({ inboxMode, setInboxMode }),
}));

afterEach(() => {
  cleanup();
  setInboxModeSignal(false);
  setInboxMode.mockClear();
});

describe('HomeInboxModeToggle', () => {
  it('turns inbox mode on and off', () => {
    render(() => <HomeInboxModeToggle />);

    const enter = screen.getByRole('button', { name: 'Inbox mode' });
    expect(enter.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(enter);
    expect(setInboxMode).toHaveBeenLastCalledWith(true);

    const exit = screen.getByRole('button', { name: 'Exit inbox mode' });
    expect(exit.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(exit);
    expect(setInboxMode).toHaveBeenLastCalledWith(false);
  });
});
