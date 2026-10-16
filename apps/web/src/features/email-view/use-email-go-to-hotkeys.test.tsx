import { GO_TO_COMMAND_SCOPE } from '@app/constants/hotkeys';
import type { CommandWithInfo } from '@core/hotkey/getCommands';
import { registerHotkey, useHotKeyRoot } from '@core/hotkey/hotkeys';
import { setActiveScope, setPressedKeys } from '@core/hotkey/state';
import type { ValidHotkey } from '@core/hotkey/types';
import { registerScope, removeScope } from '@core/hotkey/utils';
import type { TagOptionSummary } from '@property/tags/list-tag-options';
import { fireEvent } from '@solidjs/testing-library';
import { createRoot } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { useEmailGoToHotkeys } from './use-email-go-to-hotkeys';

const mocks = vi.hoisted(() => ({
  setTab: vi.fn(),
  showTags: vi.fn(),
  alert: vi.fn(),
  setCommandScopeCommands: vi.fn(),
  open: vi.fn(),
  reminders: true,
  tags: [] as TagOptionSummary[],
}));

vi.mock('@core/mobile/isTouchDevice', () => ({ isTouchDevice: () => false }));
vi.mock('./email-view-context', () => ({
  useEmailView: () => ({ setTab: mocks.setTab, showTags: mocks.showTags }),
}));
vi.mock('./components/EmailSidebar', () => ({
  EMAIL_TAB_ICONS: new Proxy({}, { get: () => () => null }),
}));
vi.mock('@app/lib/analytics/posthog', () => ({
  useFeatureFlag: () => () => ({ enabled: mocks.reminders, loading: false }),
}));
vi.mock('@core/component/Toast/Toast', () => ({
  toast: { alert: mocks.alert },
}));
vi.mock('@property/tags/TagDot', () => ({ TagDot: () => null }));
vi.mock('@app/features/command/state', () => ({
  CommandState: {
    setCommandScopeCommands: mocks.setCommandScopeCommands,
    activateCommandScopePlaceholder: vi.fn(),
    open: mocks.open,
    registerCommandScopePlaceholder: () => () => {},
  },
}));
vi.mock('@property/tags/tag-sets-context', () => ({
  useTagOptionSummaries: () => () => mocks.tags,
}));

const EMAIL_SCOPE = 'test-email-split';
const OTHER_SCOPE = 'test-other-split';
const disposers: (() => void)[] = [];

function setup() {
  registerScope({ scopeId: EMAIL_SCOPE, parentScopeId: 'global', type: 'dom' });
  registerScope({ scopeId: OTHER_SCOPE, parentScopeId: 'global', type: 'dom' });
  const sidebar = vi.fn((_key: ValidHotkey) => true);
  const registerSidebarLink = (key: ValidHotkey) =>
    registerHotkey({
      hotkey: key,
      scopeId: GO_TO_COMMAND_SCOPE,
      description: `Sidebar ${key}`,
      keyDownHandler: () => sidebar(key),
      registrationType: 'add',
    });
  createRoot((dispose) => {
    disposers.push(dispose);
    useHotKeyRoot();
    registerHotkey({
      hotkey: 'g',
      scopeId: 'global',
      description: 'Go to page',
      activateCommandScopeId: GO_TO_COMMAND_SCOPE,
      keyDownHandler: () => true,
      registrationType: 'add',
    });
    for (const key of ['i', 'e', 'h', 'l'] as const) registerSidebarLink(key);
    useEmailGoToHotkeys(EMAIL_SCOPE);
  });
  return { sidebar, registerSidebarLink };
}

function pressGoTo(key: string, scopeId = EMAIL_SCOPE) {
  setActiveScope(scopeId);
  for (const pressed of ['g', key]) {
    fireEvent.keyDown(document, { key: pressed });
    fireEvent.keyUp(document, { key: pressed });
  }
}

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  removeScope(EMAIL_SCOPE);
  removeScope(OTHER_SCOPE);
  setActiveScope('global');
  setPressedKeys(new Set<string>());
  mocks.tags = [];
  mocks.reminders = true;
  vi.clearAllMocks();
});

it('goes to email tabs instead of the sidebar links that share their keys', () => {
  const { sidebar } = setup();
  pressGoTo('i');
  pressGoTo('e');
  pressGoTo('h');
  expect(mocks.setTab.mock.calls).toEqual([
    ['important'],
    ['archived'],
    ['reminders'],
  ]);
  expect(sidebar).not.toHaveBeenCalled();
});

it('keeps priority over sidebar links registered after the view', () => {
  const { sidebar, registerSidebarLink } = setup();
  createRoot((dispose) => {
    disposers.push(dispose);
    registerSidebarLink('o');
  });
  pressGoTo('o');
  expect(mocks.setTab).toHaveBeenCalledExactlyOnceWith('noise');
  expect(sidebar).not.toHaveBeenCalled();
});

it('leaves the sidebar links alone outside the email split', () => {
  const { sidebar } = setup();
  pressGoTo('e', OTHER_SCOPE);
  expect(sidebar).toHaveBeenCalledExactlyOnceWith('e');
  expect(mocks.setTab).not.toHaveBeenCalled();
});

it('falls through to the sidebar for Reminders while that rollout is off', () => {
  mocks.reminders = false;
  const { sidebar } = setup();
  pressGoTo('h');
  expect(sidebar).toHaveBeenCalledExactlyOnceWith('h');
  expect(mocks.setTab).not.toHaveBeenCalled();
});

it('opens a picker of personal tags that shows the chosen tag', () => {
  mocks.tags = [
    {
      id: 'team-tag',
      label: 'Team',
      scope: 'team',
      propertyDefinitionId: 'team-set',
    },
    {
      id: 'client-tag',
      label: 'Clients/Acme',
      scope: 'user',
      propertyDefinitionId: 'user-set',
    },
  ];
  const { sidebar } = setup();
  pressGoTo('l');
  expect(sidebar).not.toHaveBeenCalled();
  expect(mocks.open).toHaveBeenCalledOnce();
  const [commands] = mocks.setCommandScopeCommands.mock.calls[0] as [
    CommandWithInfo[],
  ];
  expect(commands.map((command) => command.description)).toEqual([
    'Clients/Acme',
  ]);
  commands[0]?.keyDownHandler?.();
  expect(mocks.showTags).toHaveBeenCalledExactlyOnceWith(['client-tag']);
});

it('reports a missing tag list instead of opening an empty picker', () => {
  const { sidebar } = setup();
  pressGoTo('l');
  expect(mocks.alert).toHaveBeenCalledExactlyOnceWith('No tags yet');
  expect(mocks.open).not.toHaveBeenCalled();
  expect(sidebar).not.toHaveBeenCalled();
});
