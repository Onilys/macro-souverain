import { useHotKeyRoot } from '@core/hotkey/hotkeys';
import { setActiveScope, setPressedKeys } from '@core/hotkey/state';
import { registerScope, removeScope } from '@core/hotkey/utils';
import type { EntityData } from '@entity';
import { fireEvent } from '@solidjs/testing-library';
import { createRoot, createSignal } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { useEmailListHotkeys } from './use-email-list-hotkeys';

vi.mock('@core/mobile/isTouchDevice', () => ({ isTouchDevice: () => false }));
vi.mock('@app/lib/analytics/analytics-context', () => ({
  useAnalytics: () => ({ track: vi.fn() }),
}));
vi.mock('@app/features/command/state', () => ({
  CommandState: { isOpen: () => false },
}));

const SCOPE = 'test-email-list';
const disposers: (() => void)[] = [];
const email = { id: 'thread', type: 'email' } as EntityData;

function setup(initial: { selected: EntityData[]; atSignal: boolean }) {
  registerScope({ scopeId: SCOPE, parentScopeId: 'global', type: 'dom' });
  const [selected, setSelected] = createSignal(initial.selected);
  const [atSignal, setAtSignal] = createSignal(initial.atSignal);
  const clearSelection = vi.fn(() => setSelected([]));
  const showSignal = vi.fn(() => setAtSignal(true));
  createRoot((dispose) => {
    disposers.push(dispose);
    useHotKeyRoot();
    useEmailListHotkeys({
      scopeId: SCOPE,
      enabled: () => true,
      selectedEntities: selected,
      clearSelection,
      isShowingSignal: atSignal,
      showSignal,
    });
  });
  setActiveScope(SCOPE);
  return { clearSelection, showSignal };
}

function pressEscape() {
  fireEvent.keyDown(document, { key: 'Escape' });
  fireEvent.keyUp(document, { key: 'Escape' });
}

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  removeScope(SCOPE);
  setActiveScope('global');
  setPressedKeys(new Set<string>());
});

it('clears the selection before leaving the current tab', () => {
  const { clearSelection, showSignal } = setup({
    selected: [email],
    atSignal: false,
  });
  pressEscape();
  expect(clearSelection).toHaveBeenCalledOnce();
  expect(showSignal).not.toHaveBeenCalled();
  pressEscape();
  expect(showSignal).toHaveBeenCalledOnce();
  pressEscape();
  expect(clearSelection).toHaveBeenCalledOnce();
  expect(showSignal).toHaveBeenCalledOnce();
});

it('leaves Escape to other handlers once Signal is showing', () => {
  const { clearSelection, showSignal } = setup({
    selected: [],
    atSignal: true,
  });
  pressEscape();
  expect(clearSelection).not.toHaveBeenCalled();
  expect(showSignal).not.toHaveBeenCalled();
});
