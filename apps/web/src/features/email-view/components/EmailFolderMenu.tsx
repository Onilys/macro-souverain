import CaretDownIcon from '@phosphor/caret-down.svg';
import CheckIcon from '@phosphor/check.svg';
import { selectSidebarTag } from '@property/tags/SidebarTagsSection';
import { TagDot } from '@property/tags/TagDot';
import { useTagOptionSummaries } from '@property/tags/tag-sets-context';
import { cn, Dropdown } from '@ui';
import { For, type JSX, Show } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { EMAIL_TABS } from '../constants';
import { useEmailView } from '../email-view-context';
import type { EmailTab } from '../types';
import { EmailInboxDropdownGroups } from './EmailInboxSelector';
import {
  EMAIL_TAB_ICONS,
  SIDEBAR_TAG_SCOPES,
  useVisibleEmailTabs,
} from './EmailSidebar';

function MenuIcon(props: { children: JSX.Element }) {
  return (
    <span
      aria-hidden="true"
      class="flex size-4 shrink-0 items-center justify-center [&_svg]:size-4"
    >
      {props.children}
    </span>
  );
}

/**
 * The Preview layout's navigation: tabs, inboxes, and tags folded into one
 * dropdown so the sidebar can hold the email list. Like the List layout's sidebar,
 * every row is a destination: a tab clears any tag, and a tag shows alone.
 */
export function EmailFolderMenu(props: { class?: string }) {
  const { state, setTab, showTags } = useEmailView();
  const tabs = useVisibleEmailTabs();
  const tagOptions = useTagOptionSummaries();
  const tags = () =>
    tagOptions().filter((tag) => SIDEBAR_TAG_SCOPES.includes(tag.scope));
  const activeTagIds = () => state.facets.tags ?? [];
  const activeTags = () =>
    tags().filter((tag) => activeTagIds().includes(tag.id));
  const tab = () => EMAIL_TABS.find((item) => item.id === state.tab);
  const label = () => {
    const [first, ...rest] = activeTags();
    if (!first) return tab()?.label ?? 'Email';
    return rest.length > 0 ? `${first.label} +${rest.length}` : first.label;
  };
  const selectTab = (next: EmailTab) => {
    // The tab is already showing beneath a tag; choosing it drops the tag.
    if (next === state.tab && activeTagIds().length > 0) showTags([]);
    else setTab(next);
  };

  return (
    <Dropdown placement="bottom-start">
      <Dropdown.Trigger
        variant="ghost"
        size="sm"
        aria-label={`Email folder: ${label()}`}
        class={cn(
          'min-w-0 justify-start gap-1.5 px-2 font-semibold text-ink',
          props.class
        )}
      >
        <Show
          when={activeTags()[0]}
          fallback={
            <Show when={tab()}>
              {(item) => (
                <Dynamic
                  component={EMAIL_TAB_ICONS[item().id]}
                  aria-hidden="true"
                  class="size-4 shrink-0"
                />
              )}
            </Show>
          }
        >
          {(tag) => <TagDot color={tag().color} />}
        </Show>
        <span class="min-w-0 truncate">{label()}</span>
        <CaretDownIcon aria-hidden="true" class="size-3 shrink-0" />
      </Dropdown.Trigger>
      <Dropdown.Content class="max-h-[min(36rem,80vh)] min-w-56 overflow-y-auto">
        <Dropdown.Group>
          <Dropdown.RadioGroup
            value={activeTagIds().length > 0 ? '' : state.tab}
            onChange={(value) => {
              const next = EMAIL_TABS.find((item) => item.id === value);
              if (next) selectTab(next.id);
            }}
          >
            <For each={tabs()}>
              {(item) => (
                <Dropdown.RadioItem closeOnSelect value={item.id}>
                  <MenuIcon>
                    <Dynamic component={EMAIL_TAB_ICONS[item.id]} />
                  </MenuIcon>
                  <span class="min-w-0 flex-1 truncate">{item.label}</span>
                  <Dropdown.ItemIndicator>
                    <CheckIcon class="size-3.5 text-accent" />
                  </Dropdown.ItemIndicator>
                </Dropdown.RadioItem>
              )}
            </For>
          </Dropdown.RadioGroup>
        </Dropdown.Group>
        <EmailInboxDropdownGroups />
        <Show when={tags().length > 0}>
          <Dropdown.Group>
            <Dropdown.GroupLabel>Tags</Dropdown.GroupLabel>
            <For each={tags()}>
              {(tag) => (
                <Dropdown.Item
                  closeOnSelect
                  onSelect={() =>
                    showTags(selectSidebarTag(activeTagIds(), tag.id))
                  }
                >
                  <MenuIcon>
                    <TagDot color={tag.color} />
                  </MenuIcon>
                  <span class="min-w-0 flex-1 truncate">{tag.label}</span>
                  <Show when={activeTagIds().includes(tag.id)}>
                    <CheckIcon
                      aria-label="Showing"
                      class="size-3.5 text-accent"
                    />
                  </Show>
                </Dropdown.Item>
              )}
            </For>
          </Dropdown.Group>
        </Show>
      </Dropdown.Content>
    </Dropdown>
  );
}
