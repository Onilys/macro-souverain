import { useViewTabHotkeys, ViewSidebar } from '@app/components/view-shell';
import { SidebarCreateButton } from '@app/components/view-shell/SidebarCreateButton';
import { useFeatureFlag } from '@app/lib/analytics/posthog';
import { useSplitLayout } from '@components/app/split-layout/layout';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { enableReminders } from '@core/constant/featureFlags';
import { isTouchDevice } from '@core/mobile/isTouchDevice';
import ArchiveIcon from '@phosphor/archive.svg';
import BellIcon from '@phosphor/bell-simple.svg';
import CalendarBlankIcon from '@phosphor/calendar-blank.svg';
import ClockIcon from '@phosphor/clock.svg';
import EnvelopeIcon from '@phosphor/envelope.svg';
import FileIcon from '@phosphor/file.svg';
import PaperPlaneTiltIcon from '@phosphor/paper-plane-tilt.svg';
import StarIcon from '@phosphor/star.svg';
import UsersThreeIcon from '@phosphor/users-three.svg';
import SignalIcon from '@phosphor/wave-sine.svg';
import NoiseIcon from '@phosphor/waveform.svg';
import { SidebarTagsSection } from '@property/tags/SidebarTagsSection';
import type { TagScope } from '@service-properties/generated/schemas/tagScope';
import { pressHandlers } from '@ui';
import { tourTarget } from '@ui/components/Tour';
import { type Component, For, Show } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { composeEmail } from '../compose-email';
import { EMAIL_TABS, type EmailTabItem } from '../constants';
import { useEmailView } from '../email-view-context';
import { EMAIL_TOUR } from '../tour';
import type { EmailTab } from '../types';
import { EmailInboxList } from './EmailInboxSelector';
import { EmailLayoutToggle } from './EmailLayoutToggle';

// Email is personal, so the sidebar lists only the user's own tags.
export const SIDEBAR_TAG_SCOPES: readonly TagScope[] = ['user'];

export const EMAIL_TAB_ICONS: Record<
  EmailTab,
  Component<{ class?: string }>
> = {
  important: SignalIcon,
  noise: NoiseIcon,
  favorites: StarIcon,
  sent: PaperPlaneTiltIcon,
  scheduled: ClockIcon,
  reminders: BellIcon,
  calendar: CalendarBlankIcon,
  drafts: FileIcon,
  shared: UsersThreeIcon,
  archived: ArchiveIcon,
  all: EnvelopeIcon,
};

function Tab(props: { item: EmailTabItem; onNavigate?: () => void }) {
  const { state, setTab } = useEmailView();

  return (
    <ViewSidebar.Item
      active={state.tab === props.item.id}
      {...pressHandlers(() => {
        setTab(props.item.id);
        props.onNavigate?.();
      })}
    >
      <ViewSidebar.Icon>
        <Dynamic component={EMAIL_TAB_ICONS[props.item.id]} class="size-4" />
      </ViewSidebar.Icon>
      <span class="truncate">{props.item.label}</span>
    </ViewSidebar.Item>
  );
}

/** Tabs the user can open; Reminders waits on its feature flag. */
export function useVisibleEmailTabs() {
  const { state } = useEmailView();
  const reminders = useFeatureFlag(enableReminders);
  return () =>
    EMAIL_TABS.filter(
      (tab) =>
        tab.id !== 'reminders' ||
        reminders().enabled ||
        (reminders().loading && state.tab === 'reminders')
    );
}

export function EmailNavigation(props: { onNavigate?: () => void }) {
  const tabs = useVisibleEmailTabs();
  return (
    <ViewSidebar.Nav aria-label="Email tabs">
      <div
        ref={tourTarget(EMAIL_TOUR.signalNoise)}
        class="flex flex-col gap-(--sidebar-row-gap)"
      >
        <For each={tabs().slice(0, 2)}>
          {(item) => <Tab item={item} onNavigate={props.onNavigate} />}
        </For>
      </div>
      <For each={tabs().slice(2)}>
        {(item) => <Tab item={item} onNavigate={props.onNavigate} />}
      </For>
    </ViewSidebar.Nav>
  );
}

/** Number-key tab switching, registered by whichever sidebar is showing. */
export function useEmailTabHotkeys() {
  const panel = useSplitPanelOrThrow();
  const { state, setTab } = useEmailView();
  const tabs = useVisibleEmailTabs();

  useViewTabHotkeys({
    scopeId: panel.splitHotkeyScope,
    enabled: panel.isPanelActive,
    ids: () => tabs().map((tab) => tab.id),
    activeId: () => state.tab,
    setActiveId: setTab,
    shouldHandleSequentialKeyEvent: (event) =>
      !(
        event?.target instanceof Element &&
        event.target.closest('[role="grid"][aria-label="Email"]')
      ),
  });
}

export function EmailSidebar() {
  const { openWithSplit } = useSplitLayout();
  const { state, showTags, isSidebarSectionOpen, setSidebarSectionOpen } =
    useEmailView();

  useEmailTabHotkeys();

  return (
    <ViewSidebar.Root aria-label="Email navigation">
      <Show when={!isTouchDevice()}>
        <ViewSidebar.Header>
          <div class="flex min-w-0 items-center gap-1">
            <ViewSidebar.CloseButton class="shrink-0" />
            <ViewSidebar.Title>Email</ViewSidebar.Title>
          </div>
        </ViewSidebar.Header>
      </Show>

      <Show when={!isTouchDevice()}>
        <ViewSidebar.Primary>
          <EmailLayoutToggle />
        </ViewSidebar.Primary>
      </Show>

      <ViewSidebar.Content>
        <EmailInboxList />

        <SidebarCreateButton
          label="New email"
          onCreate={() => composeEmail(openWithSplit, state.inboxIds)}
        />

        <EmailNavigation />

        <div ref={tourTarget(EMAIL_TOUR.tags)}>
          <SidebarTagsSection
            activeIds={state.facets.tags ?? []}
            onActiveIdsChange={showTags}
            open={isSidebarSectionOpen('tags')}
            onOpenChange={(open) => setSidebarSectionOpen('tags', open)}
            scopes={SIDEBAR_TAG_SCOPES}
          />
        </div>
      </ViewSidebar.Content>
    </ViewSidebar.Root>
  );
}
