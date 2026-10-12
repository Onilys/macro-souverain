import {
  useViewShell,
  ViewBreadcrumbs,
  ViewShell,
} from '@app/components/view-shell';
import { ViewTour } from '@app/features/tours/ViewTour';
import { useFeatureFlag } from '@app/lib/analytics/posthog';
import { SplitRouter } from '@app/lib/split-router';
import { type PillTabItem, PillTabs } from '@components/app/mobile/PillTabs';
import { SplitHeaderLeft } from '@components/app/split-layout/components/SplitHeader';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { SplitPanel } from '@components/app/split-panel';
import { StaticMarkdownContext } from '@core/component/LexicalMarkdown/component/core/StaticMarkdown';
import { enableReminders } from '@core/constant/featureFlags';
import { isTouchDevice } from '@core/mobile/isTouchDevice';
import {
  ListEntityMetadataQueryProvider,
  type NarrowLayoutVariant,
} from '@entity';
import EnvelopeSimpleOpenIcon from '@phosphor/envelope-simple-open.svg';
import SpinnerIcon from '@phosphor/spinner.svg';
import {
  createEffect,
  createSignal,
  type JSX,
  on,
  onMount,
  type ParentProps,
  Show,
  Suspense,
} from 'solid-js';
import { EmailFilterDrawer } from './components/EmailFilterDrawer';
import {
  EmailHeader,
  EmailTopBar,
  EmailViewBreadcrumbItem,
} from './components/EmailHeader';
import { EmailList } from './components/EmailList';
import { EmailPreviewSidebar } from './components/EmailPreviewSidebar';
import { EmailSidebar } from './components/EmailSidebar';
import { EMAIL_TABS } from './constants';
import { EmailViewProvider, useEmailView } from './email-view-context';
import { emailTour } from './tour';
import type { EmailTab, EmailViewStateOptions } from './types';

export type EmailViewProps = {
  /** Explicit navigation state. When present, it wins over entry restoration. */
  initialState?: EmailViewStateOptions;
};

function EmailViewBreadcrumbs(props: ParentProps) {
  const { closeThread, selectedThread } = useEmailView();
  const value = () => {
    const thread = selectedThread();
    return thread ? `email-thread:${thread.id}` : 'email-view';
  };

  return (
    <ViewBreadcrumbs.Root
      value={value()}
      onChange={(next) => {
        if (next === 'email-view') closeThread();
      }}
    >
      <EmailViewBreadcrumbItem />
      {props.children}
    </ViewBreadcrumbs.Root>
  );
}

function EmailListFallback() {
  return (
    <div class="grid size-full min-h-0 min-w-0 place-items-center text-ink-muted touch:pt-(--mobile-content-inset-top) touch:pb-(--mobile-content-inset-bottom)">
      <SpinnerIcon aria-label="Loading email" class="size-5 animate-spin" />
    </div>
  );
}

type EmailListOptions = {
  /** Whether the list owns the split's keyboard; see `EmailList`. */
  keyboardEnabled?: () => boolean;
  narrowLayout?: NarrowLayoutVariant;
};

type RenderEmailList = (options?: EmailListOptions) => JSX.Element;

/** The Preview layout gives its sidebar a reading-list width. */
const PREVIEW_ASIDE_LAYOUT = { width: 400, min: 320, max: 560 };
const LIST_ASIDE_LAYOUT = { preserveDuringResize: false };
const LIST_MAIN_LAYOUT = { preferredWidth: 640 };

/**
 * Whether the Preview layout's list sits in the sidebar. A hidden or overlaid
 * sidebar can't hold it, so the list falls back to the main area, as in
 * List, until the docked sidebar returns.
 */
function useListInSidebar() {
  const shell = useViewShell();
  const { layout } = useEmailView();
  return () =>
    layout() === 'preview' &&
    !shell.aside.isCollapsed() &&
    !shell.breakpoints.narrow?.();
}

function EmailDesktopAside(props: {
  list: RenderEmailList;
  focusList: () => void;
}) {
  const { selectedThread } = useEmailView();
  const listInSidebar = useListInSidebar();

  // Leaving a thread unmounts what held focus; hand it back to the list.
  createEffect(
    on(
      selectedThread,
      (thread, previous) => {
        if (thread || !previous || !listInSidebar()) return;
        queueMicrotask(() => {
          const active = document.activeElement;
          if (!active || active === document.body) props.focusList();
        });
      },
      { defer: true }
    )
  );

  return (
    <Show when={listInSidebar()} fallback={<EmailSidebar />}>
      <EmailPreviewSidebar
        list={props.list({
          keyboardEnabled: () => !selectedThread(),
          narrowLayout: 'inbox',
        })}
        onSearchEscape={props.focusList}
      />
    </Show>
  );
}

/** Main's content while no thread is open. */
function EmailDesktopListArea(props: {
  list: RenderEmailList;
  onSearchEscape: () => void;
}) {
  const listInSidebar = useListInSidebar();

  return (
    <Show
      when={listInSidebar()}
      fallback={
        <>
          <EmailTopBar />
          <ViewShell.Header>
            <EmailHeader onSearchEscape={props.onSearchEscape} />
          </ViewShell.Header>
          <ViewTour tour={emailTour} />
          <ViewShell.Content>{props.list()}</ViewShell.Content>
        </>
      }
    >
      <EmailTopBar />
      <div class="grid min-h-0 flex-1 place-items-center px-6">
        <div class="flex flex-col items-center gap-2 text-center text-sm text-ink-muted">
          <EnvelopeSimpleOpenIcon
            aria-hidden="true"
            class="size-8 text-ink-extra-muted"
          />
          <p>No conversation selected</p>
        </div>
      </div>
    </Show>
  );
}

function EmailDesktopLayout(props: {
  list: RenderEmailList;
  focusList: () => void;
}) {
  const { layout } = useEmailView();
  const preview = () => layout() === 'preview';

  return (
    <ViewShell.Root
      asidePreferenceKey="email"
      resizable
      aside={preview() ? PREVIEW_ASIDE_LAYOUT : LIST_ASIDE_LAYOUT}
      main={preview() ? undefined : LIST_MAIN_LAYOUT}
    >
      <ViewShell.Aside>
        <EmailDesktopAside list={props.list} focusList={props.focusList} />
      </ViewShell.Aside>
      <ViewShell.Main>
        <SplitRouter.Outlet
          fallback={() => (
            <EmailDesktopListArea
              list={props.list}
              onSearchEscape={props.focusList}
            />
          )}
        />
      </ViewShell.Main>
    </ViewShell.Root>
  );
}

const MOBILE_EMAIL_TABS: PillTabItem<EmailTab>[] = EMAIL_TABS.map((tab) => ({
  value: tab.id,
  label: tab.label,
}));

function EmailMobileLayout(props: ParentProps) {
  const reminders = useFeatureFlag(enableReminders);
  const { state, setTab } = useEmailView();

  return (
    <>
      <SplitHeaderLeft>
        <div class="flex h-full w-full min-w-0 flex-1 items-center">
          <PillTabs
            scrollable
            class="-ml-(--mobile-chrome-gutter) w-[100cqw] max-w-none flex-none"
            contentClass="px-(--mobile-chrome-gutter)"
            leading={<EmailFilterDrawer />}
            items={MOBILE_EMAIL_TABS.filter(
              (tab) =>
                tab.value !== 'reminders' ||
                reminders().enabled ||
                (reminders().loading && state.tab === 'reminders')
            )}
            value={state.tab}
            onChange={setTab}
          />
        </div>
      </SplitHeaderLeft>
      <main
        class="size-full min-h-0 min-w-0"
        style={{
          // Match Inbox: 0.5rem above the 2.5rem pills, then a 0.75rem gap.
          '--mobile-content-inset-top': 'calc(var(--safe-top, 0px) + 3.75rem)',
        }}
      >
        {props.children}
      </main>
    </>
  );
}

function EmailViewRoot() {
  const panel = useSplitPanelOrThrow();
  const [listElement, setListElement] = createSignal<HTMLDivElement>();

  onMount(() => panel.handle.setDisplayName('Email'));

  const list: RenderEmailList = (options) => (
    <Suspense fallback={<EmailListFallback />}>
      <EmailList
        ref={setListElement}
        keyboardEnabled={options?.keyboardEnabled}
        narrowLayout={options?.narrowLayout}
      />
    </Suspense>
  );

  return (
    <StaticMarkdownContext>
      <SplitPanel.Root>
        <SplitPanel.Body>
          <Show
            when={isTouchDevice()}
            fallback={
              <EmailDesktopLayout
                list={list}
                focusList={() => listElement()?.focus()}
              />
            }
          >
            <EmailMobileLayout>{list()}</EmailMobileLayout>
          </Show>
        </SplitPanel.Body>
      </SplitPanel.Root>
    </StaticMarkdownContext>
  );
}

/** Email shares one list across desktop sidebar and mobile pill layouts. */
export function EmailView(props: EmailViewProps) {
  return (
    <ListEntityMetadataQueryProvider>
      <EmailViewProvider initialState={props.initialState}>
        <EmailViewBreadcrumbs>
          <EmailViewRoot />
        </EmailViewBreadcrumbs>
      </EmailViewProvider>
    </ListEntityMetadataQueryProvider>
  );
}
