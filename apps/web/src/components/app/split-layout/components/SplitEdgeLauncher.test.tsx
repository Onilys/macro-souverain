import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@solidjs/testing-library';
import type { ParentProps } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { SplitEdgeLauncher } from './SplitEdgeLauncher';

vi.mock('@ui', async () => ({
  ...(await import('../../../ui/components/Button')),
}));
vi.mock('../../../ui/components/Tooltip', () => ({
  Tooltip: (props: ParentProps) => props.children,
}));

const mocks = vi.hoisted(() => ({
  split: vi.fn(),
  create: vi.fn(),
  more: vi.fn(),
}));
vi.mock('@app/features/command/Launcher', () => ({
  runCreateAction: mocks.create,
  setCreateMenuOpen: mocks.more,
}));
vi.mock('../context', async () => ({
  SplitLayoutContext: (await import('solid-js')).createContext({
    manager: { createNewSplit: mocks.split },
  }),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('fans open, navigates actions, and reverses on Escape without creating anything', async () => {
  render(() => <SplitEdgeLauncher />);
  const trigger = screen.getByRole('button', { name: 'Open split creation' });
  expect(screen.queryByRole('menuitem')).toBeNull();
  fireEvent.click(trigger);
  const split = screen.getByRole('menuitem', { name: 'Create new split' });
  await waitFor(() => expect(document.activeElement).toBe(split));
  fireEvent.keyDown(split, { key: 'ArrowDown' });
  expect(document.activeElement).toBe(
    screen.getByRole('menuitem', { name: 'New email in split' })
  );
  fireEvent.keyDown(
    screen.getByRole('menuitem', { name: 'New email in split' }),
    { key: 'Escape' }
  );
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(trigger);
  expect(screen.queryByRole('menuitem')).toBeNull();
  expect(mocks.split).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
});

it('opens a fresh split and routes email, document, and more through existing creation', async () => {
  render(() => <SplitEdgeLauncher />);
  for (const name of [
    'Create new split',
    'New email in split',
    'New document in split',
    'More create options',
  ]) {
    fireEvent.click(
      screen.getByRole('button', { name: 'Open split creation' })
    );
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name })).toBeTruthy()
    );
    fireEvent.click(screen.getByRole('menuitem', { name }));
    expect(
      screen
        .getByRole('button', { name: 'Open split creation' })
        .getAttribute('aria-expanded')
    ).toBe('false');
  }
  expect(mocks.split).toHaveBeenCalledWith({
    content: { type: 'component', id: 'home' },
    activate: true,
    allowDuplicate: true,
    referredFrom: 'dock',
  });
  expect(mocks.create).toHaveBeenCalledWith('email', {
    shouldInsert: true,
    source: 'split_edge',
  });
  expect(mocks.create).toHaveBeenCalledWith('md', {
    shouldInsert: true,
    source: 'split_edge',
  });
  expect(mocks.more).toHaveBeenCalledWith(true);
});

it('dismisses on an outside pointer even when the target stops propagation', () => {
  render(() => (
    <>
      <SplitEdgeLauncher />
      <button onPointerDown={(event) => event.stopPropagation()}>
        Outside control
      </button>
    </>
  ));
  const trigger = screen.getByRole('button', { name: 'Open split creation' });
  fireEvent.click(trigger);
  fireEvent.pointerDown(
    screen.getByRole('button', { name: 'Outside control' })
  );
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  expect(mocks.split).not.toHaveBeenCalled();
});

it('dismisses when focus leaves the document and does not swallow Escape while closed', () => {
  render(() => <SplitEdgeLauncher />);
  const trigger = screen.getByRole('button', { name: 'Open split creation' });
  const onEscape = vi.fn();
  document.addEventListener('keydown', onEscape);
  fireEvent.keyDown(trigger, { key: 'Escape' });
  expect(onEscape).toHaveBeenCalledOnce();
  document.removeEventListener('keydown', onEscape);
  fireEvent.click(trigger);
  fireEvent.focusOut(trigger, { relatedTarget: null });
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
});
