import { useViewShell, ViewShell } from '@app/components/view-shell';
import { SidebarCreateHeader } from '@app/components/view-shell/SidebarCreateButton';
import { calendarSearch } from '@app/features/calendar-view/calendar-url';
import { ViewTour } from '@app/features/tours/ViewTour';
import { createSearchParams, SplitRouter } from '@app/lib/split-router';
import { homeCalendarRoute } from '@app/routes/routes';
import { DebugSuspense } from '@channel/DebugSuspense';
import { useGlobalBlockOrchestrator } from '@components/app/GlobalAppState';
import { PreviewFrame, PreviewPanel } from '@components/app/PreviewPanel';
import type { PreviewSelection } from '@components/app/previewTarget';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { SplitPanel } from '@components/app/split-panel';
import { StaticMarkdownContext } from '@core/component/LexicalMarkdown/component/core/StaticMarkdown';
import { isTouchDevice } from '@core/mobile/isTouchDevice';
import { lazyNamed } from '@core/util/lazyNamed';
import { ListEntityMetadataQueryProvider } from '@entity';
import { cn } from '@ui';
import { type JSX, onMount, Show } from 'solid-js';
import { HomeChatStart } from './components/HomeChatStart';
import { HomeList } from './components/HomeList';
import { HomeListLayout } from './components/HomeListLayout';
import { HomeListSkeleton } from './components/HomeListSkeleton';
import { HomeReturnBreadcrumb } from './components/HomeReturnBreadcrumb';
import { HomeTabs } from './components/HomeTabs';
import { HomeViewProvider, useHomeView } from './home-view-context';
import { homeTour } from './tour';
import type { HomeViewStateOptions } from './types';

// The calendar grid (FullCalendar) only loads once Home's calendar route opens.
const CalendarView = lazyNamed(
  () => import('@app/features/calendar-view/calendar-view'),
  'CalendarView'
);

export type HomeViewProps = {
  /** Explicit navigation state. When present, it wins over entry restoration. */
  initialState?: HomeViewStateOptions;
};

function HomeFallback() {
  const { state } = useHomeView();
  return (
    <div class="mt-3 min-h-0 min-w-0 flex-1 overflow-hidden touch:mt-0 touch:pt-(--mobile-content-inset-top)">
      <HomeListSkeleton
        grouped={state.groupBy === 'date' && !state.search.trim()}
      />
    </div>
  );
}

function HomeListPane(props: {
  hasPreview: boolean;
  onPreviewEntityChange: (entity: PreviewSelection | undefined) => void;
  onNewChat: () => void;
}) {
  const shell = useViewShell();
  const showContent = () => {
    if (shell.aside.isOverlay()) shell.aside.collapse();
  };

  return (
    <HomeListLayout
      tabs={
        <DebugSuspense name="HomeView.tabs">
          <HomeTabs />
        </DebugSuspense>
      }
      onNewChat={() => {
        props.onNewChat();
        showContent();
      }}
    >
      <ViewTour tour={homeTour} />
      <DebugSuspense name="HomeView.list" fallback={<HomeFallback />}>
        <HomeList
          hasPreview={props.hasPreview}
          onPreviewEntityChange={props.onPreviewEntityChange}
          onPreviewActivate={showContent}
        />
      </DebugSuspense>
    </HomeListLayout>
  );
}

/** Detail routes load lazily. Suspend only this area, so the list stays
 * mounted and a pending detail's effects wait until it resolves. */
function HomeDetailOutlet() {
  return (
    <DebugSuspense name="HomeView.outlet" fallback={<HomeFallback />}>
      <SplitRouter.Outlet fallback={() => <HomeChatStart />} />
    </DebugSuspense>
  );
}

/**
 * Inbox mode: the list fills the view until Space previews an item, which
 * opens beside the list. A narrow split shows the preview in place of the
 * list, keeping the list mounted so its focus and scroll survive.
 */
function HomeInboxLayout(props: { list: JSX.Element; hasPreview: boolean }) {
  const shell = useViewShell();
  const narrow = () => shell.breakpoints.narrow?.() ?? false;

  return (
    <div class="flex size-full min-h-0 min-w-0">
      <div
        class={cn(
          'flex min-h-0 min-w-0 flex-col bg-panel',
          !props.hasPreview && 'flex-1',
          props.hasPreview &&
            !narrow() &&
            'w-100 shrink-0 border-r border-edge-frame',
          props.hasPreview && narrow() && 'hidden'
        )}
      >
        {props.list}
      </div>
      <Show when={props.hasPreview}>
        <div class="min-h-0 min-w-0 flex-1 overflow-hidden" data-home-preview>
          <HomeDetailOutlet />
        </div>
      </Show>
    </div>
  );
}

function HomeViewRoot() {
  const panel = useSplitPanelOrThrow();
  const {
    previewTarget,
    calendarOpen,
    openPreview,
    closePreview,
    inboxMode,
    setInboxMode,
  } = useHomeView();

  const hasPreview = () => previewTarget() !== undefined || calendarOpen();
  // The chat composer lives in the sidebar layout's empty detail area.
  const newChat = () => {
    setInboxMode(false);
    closePreview();
  };
  const onPreviewEntityChange = (entity: PreviewSelection | undefined) => {
    if (entity) openPreview(entity);
    else closePreview();
  };

  // The touch nav item calls this "Notifications".
  onMount(() =>
    panel.handle.setDisplayName(isTouchDevice() ? 'Notifications' : 'Home')
  );

  const listPane = () => (
    <DebugSuspense name="HomeView.list-pane">
      <HomeListPane
        hasPreview={hasPreview()}
        onPreviewEntityChange={onPreviewEntityChange}
        onNewChat={newChat}
      />
    </DebugSuspense>
  );

  return (
    <ListEntityMetadataQueryProvider>
      <StaticMarkdownContext>
        <SplitPanel.Root>
          <SplitPanel.Body>
            <Show
              when={isTouchDevice()}
              fallback={
                <div class="size-full min-h-0 bg-panel">
                  <Show
                    when={inboxMode()}
                    fallback={
                      <ViewShell.Root
                        asidePreferenceKey="home"
                        aside={{ preserveDuringResize: false }}
                        main={{ preferredWidth: 640 }}
                        resizable
                      >
                        <ViewShell.Aside class="flex flex-col bg-panel">
                          {listPane()}
                        </ViewShell.Aside>
                        <ViewShell.Main class="overflow-hidden">
                          <HomeDetailOutlet />
                        </ViewShell.Main>
                      </ViewShell.Root>
                    }
                  >
                    <ViewShell.Root aside={false}>
                      <ViewShell.Main class="overflow-hidden">
                        <HomeInboxLayout
                          list={listPane()}
                          hasPreview={hasPreview()}
                        />
                      </ViewShell.Main>
                    </ViewShell.Root>
                  </Show>
                </div>
              }
            >
              <ViewShell.Root aside={false} main={{ min: 224 }}>
                <ViewShell.Main>{listPane()}</ViewShell.Main>
              </ViewShell.Root>
            </Show>
          </SplitPanel.Body>
        </SplitPanel.Root>
      </StaticMarkdownContext>
    </ListEntityMetadataQueryProvider>
  );
}

/**
 * Home's frame while sign-in is confirmed: the view's layout, header, and list
 * skeleton. Home's persisted state and list query key on the user, so the view
 * itself waits for identity; the frame keeps the screen from going blank.
 */
export function HomePendingView() {
  const listSkeleton = (
    <div class="mt-3 min-h-0 min-w-0 flex-1 overflow-hidden touch:mt-0 touch:pt-(--mobile-content-inset-top)">
      <HomeListSkeleton grouped />
    </div>
  );

  return (
    <SplitPanel.Root>
      <SplitPanel.Body>
        <Show
          when={isTouchDevice()}
          fallback={
            <div class="size-full min-h-0 bg-panel">
              <ViewShell.Root
                asidePreferenceKey="home"
                aside={{ preserveDuringResize: false }}
                main={{ preferredWidth: 640 }}
                resizable
              >
                <ViewShell.Aside class="flex flex-col bg-panel">
                  <SidebarCreateHeader
                    title="Home"
                    label="New chat"
                    onCreate={() => {}}
                  />
                  {listSkeleton}
                </ViewShell.Aside>
                <ViewShell.Main class="overflow-hidden" />
              </ViewShell.Root>
            </div>
          }
        >
          {listSkeleton}
        </Show>
      </SplitPanel.Body>
    </SplitPanel.Root>
  );
}

/** The Calendar view aimed at an event, inside Home's inline preview chrome. */
function HomeCalendarRouteContent() {
  const panel = useSplitPanelOrThrow();
  const { closePreview, calendarRefocus } = useHomeView();
  const [search] = createSearchParams(calendarSearch);

  return (
    <div class="flex size-full min-h-0">
      <PreviewFrame
        splitPanelContext={panel}
        headerLeading={<HomeReturnBreadcrumb onReturn={closePreview} />}
        locationKey={() => `${search.eventId}:${search.occurrenceKey}`}
      >
        <CalendarView route={homeCalendarRoute} refocus={calendarRefocus} />
      </PreviewFrame>
    </div>
  );
}

export function HomeCalendarRouteView() {
  return (
    <DebugSuspense name="HomeView.calendar-route">
      <HomeCalendarRouteContent />
    </DebugSuspense>
  );
}

function HomeDetailRouteContent() {
  const panel = useSplitPanelOrThrow();
  const orchestrator = useGlobalBlockOrchestrator();
  const { previewTarget, previewNavigationRequest, closePreview } =
    useHomeView();

  return (
    <DebugSuspense name="HomeView.detail-content">
      <PreviewPanel
        target={previewTarget()}
        navigationRequest={previewNavigationRequest()}
        orchestrator={orchestrator}
        splitPanelContext={panel}
        headerLeading={<HomeReturnBreadcrumb onReturn={closePreview} />}
      />
    </DebugSuspense>
  );
}

export function HomeDetailRouteView() {
  return (
    <DebugSuspense name="HomeView.detail-route">
      <HomeDetailRouteContent />
    </DebugSuspense>
  );
}

/** Composable heterogeneous Home built on the shared view and Soup primitives. */
export function HomeView(props: HomeViewProps) {
  return (
    <DebugSuspense name="HomeView.root">
      <HomeViewProvider initialState={props.initialState}>
        <HomeViewRoot />
      </HomeViewProvider>
    </DebugSuspense>
  );
}
