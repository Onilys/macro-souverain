import { GO_TO_COMMAND_SCOPE } from '@app/constants/hotkeys';
import { CommandState } from '@app/features/command/state';
import { useFeatureFlag } from '@app/lib/analytics/posthog';
import { toast } from '@core/component/Toast/Toast';
import { enableReminders } from '@core/constant/featureFlags';
import { getActiveCommandsFromScope } from '@core/hotkey/getCommands';
import { registerHotkey } from '@core/hotkey/hotkeys';
import { HOTKEY_PRIORITY_HIGH, type ValidHotkey } from '@core/hotkey/types';
import { isScopeInActiveBranch } from '@core/hotkey/utils';
import TagIcon from '@phosphor/tag.svg';
import { TagDot } from '@property/tags/TagDot';
import { useTagOptionSummaries } from '@property/tags/tag-sets-context';
import { createEffect, onCleanup } from 'solid-js';
import { EMAIL_TAB_ICONS } from './components/EmailSidebar';
import { EMAIL_TABS } from './constants';
import { useEmailView } from './email-view-context';
import type { EmailTab } from './types';

/**
 * Superhuman's go-to keys. They share the app's `g` leader and, while focus is
 * in this view, win over the sidebar links on the same keys (`g i` Home, `g e`
 * Email, `g t` Tasks, ...).
 */
const GO_TO_TABS: { key: ValidHotkey; tab: EmailTab; keywords?: string[] }[] = [
  { key: 'i', tab: 'important', keywords: ['important', 'inbox'] },
  { key: 'o', tab: 'noise', keywords: ['other'] },
  { key: 'e', tab: 'archived', keywords: ['done'] },
  { key: 't', tab: 'sent' },
  { key: 'd', tab: 'drafts' },
  { key: 'h', tab: 'reminders', keywords: ['snoozed'] },
];

const tabLabel = (tab: EmailTab) =>
  EMAIL_TABS.find((item) => item.id === tab)?.label ?? tab;

/** Registers `g` + key navigation for the Email view in `scopeId`'s split. */
export function useEmailGoToHotkeys(scopeId: string) {
  const { setTab, showTags } = useEmailView();
  const reminders = useFeatureFlag(enableReminders);
  const tags = useTagOptionSummaries();
  // The sidebar's Tags section lists personal tags only; so does the picker.
  const personalTags = () => tags().filter((tag) => tag.scope === 'user');
  const inView = () => isScopeInActiveBranch(scopeId);

  for (const { key, tab, keywords } of GO_TO_TABS) {
    registerHotkey({
      hotkey: key,
      scopeId: GO_TO_COMMAND_SCOPE,
      description: `Go to ${tabLabel(tab)}`,
      condition: () => inView() && (tab !== 'reminders' || reminders().enabled),
      keyDownHandler: () => {
        setTab(tab);
        return true;
      },
      commandPaletteIcon: EMAIL_TAB_ICONS[tab],
      keywords,
      registrationType: 'add',
      handlerPriority: HOTKEY_PRIORITY_HIGH,
    });
  }

  // The tag list is this view's own command scope: the command menu opens it
  // as a sub-view when "Go to tag" is chosen there, and `g l` opens it directly.
  const { commandScopeId: tagScopeId } = registerHotkey({
    hotkey: 'l',
    scopeId: GO_TO_COMMAND_SCOPE,
    description: 'Go to tag',
    condition: inView,
    keyDownHandler: () => {
      if (personalTags().length === 0) {
        toast.alert('No tags yet');
        return true;
      }
      CommandState.setCommandScopeCommands(
        getActiveCommandsFromScope(tagScopeId, {
          sortByScopeLevel: false,
          hideShadowedCommands: false,
          hideCommandsWithoutHotkeys: false,
          limitToCurrentScope: true,
        })
      );
      CommandState.activateCommandScopePlaceholder(tagScopeId);
      CommandState.open();
      return true;
    },
    activateCommandScope: true,
    hide: () => personalTags().length === 0,
    icon: TagIcon,
    keywords: ['label'],
    registrationType: 'add',
    handlerPriority: HOTKEY_PRIORITY_HIGH,
  });

  onCleanup(
    CommandState.registerCommandScopePlaceholder(tagScopeId, 'Go to tag...')
  );

  createEffect(() => {
    for (const tag of personalTags()) {
      registerHotkey({
        scopeId: tagScopeId,
        description: tag.label,
        keyDownHandler: () => {
          showTags([tag.id]);
          return true;
        },
        commandPaletteIcon: (props) => (
          <TagDot color={tag.color} class={props.class} />
        ),
        // The sub-view's search input has focus when its commands are listed.
        runWithInputFocused: true,
      });
    }
  });
}
