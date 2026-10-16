import { registerHotkey } from '@core/hotkey/hotkeys';
import { createRoot, createSignal } from 'solid-js';
import { expect, it, vi } from 'vitest';
import type { EmailTab } from './types';
import { useEmailInboxHotkeys } from './use-email-inbox-hotkeys';

vi.mock('@core/hotkey/hotkeys', () => ({
  registerHotkey: vi.fn(() => ({ withGroup: vi.fn() })),
  createHotkeyGroup: () => ({ dispose: vi.fn() }),
}));

it('cycles Important, Other, Calendar in both directions and preserves input focus navigation', () => {
  createRoot((dispose) => {
    const [tab, setTab] = createSignal<EmailTab>('important');
    useEmailInboxHotkeys({
      scopeId: 'mail',
      enabled: () => true,
      activeId: tab,
      setActiveId: setTab,
    });
    const next = vi
      .mocked(registerHotkey)
      .mock.calls.find(([options]) => options.hotkey === 'tab')![0]
      .keyDownHandler!;
    const prev = vi
      .mocked(registerHotkey)
      .mock.calls.find(([options]) => options.hotkey === 'shift+tab')![0]
      .keyDownHandler!;
    next();
    expect(tab()).toBe('noise');
    next();
    expect(tab()).toBe('calendar');
    next();
    expect(tab()).toBe('important');
    prev();
    expect(tab()).toBe('calendar');
    const input = document.createElement('input');
    input.addEventListener('keydown', (event) =>
      expect(next(event)).toBe(false)
    );
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
    );
    expect(tab()).toBe('calendar');
    const button = document.createElement('button');
    button.addEventListener('keydown', (event) =>
      expect(next(event)).toBe(false)
    );
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(tab()).toBe('calendar');
    const grid = document.createElement('div');
    grid.setAttribute('role', 'grid');
    grid.setAttribute('aria-label', 'Email');
    const row = document.createElement('div');
    grid.append(row);
    row.addEventListener('keydown', (event) => next(event));
    row.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
    );
    expect(tab()).toBe('important');
    grid.append(button);
    button.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
    );
    expect(tab()).toBe('important');
    for (const role of ['dialog', 'menu']) {
      const overlay = document.createElement('div');
      overlay.setAttribute('role', role);
      overlay.append(grid);
      row.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
      );
      expect(tab()).toBe('important');
    }
    const sidebar = document.createElement('aside');
    sidebar.setAttribute('data-view-sidebar', '');
    sidebar.append(grid);
    row.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
    );
    expect(tab()).toBe('important');
    dispose();
  });
});
