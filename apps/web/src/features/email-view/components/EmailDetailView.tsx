import { EntityDetailBreadcrumbSkeleton } from '@app/components/entity-detail/EntityDetailBreadcrumbSkeleton';
import { useListNavigationHotkeys } from '@app/components/entity-detail/use-list-navigation-hotkeys';
import { ViewBreadcrumbs, ViewShell } from '@app/components/view-shell';
import { displaySubject } from '@app/features/email-compose/core/subject-text';
import type {
  EmailThreadHost,
  EmailThreadListNavigation,
} from '@app/features/email-thread/context/email-thread-context';
import {
  delegateThreadKeyboard,
  type EmailThreadKeyboardHandlers,
} from '@app/features/email-thread/core/thread-keyboard';
import { createEmailThreadSource } from '@app/features/email-thread/queries/thread-source';
import { useBlockEntityCommands } from '@app/features/next-soup/actions';
import { createSearchParams, useRouteParams } from '@app/lib/split-router';
import { emailThreadRoute } from '@app/routes/routes';
import { EmailThreadControls } from '@block-email/component/EmailThreadControls';
import { EmailThreadLoadGate } from '@block-email/component/EmailThreadLoadGate';
import {
  type EmailThreadToolsOptions,
  useEmailThreadTools,
} from '@block-email/component/useEmailThreadTools';
import { EmailThreadHostView } from '@block-email/EmailThreadHostView';
import { registerEmailHotkeys } from '@block-email/util/emailHotkeys';
import { useGlobalNotificationSource } from '@components/app/GlobalAppState';
import { SidePanel } from '@components/app/side-panel';
import { SplitFileMenu } from '@components/app/split-layout/components/SplitFileMenu';
import { ListNavigationButtons } from '@components/app/split-layout/components/SplitHeader';
import {
  useCanAutofocusSplitContent,
  useSplitDisplayName,
  useSplitPanelOrThrow,
} from '@components/app/split-layout/layoutUtils';
import { createSplitAutofocus } from '@components/app/split-layout/utils/createSplitAutofocus';
import { EntityIcon } from '@core/component/EntityIcon';
import { toEntityLoadError } from '@core/component/EntityLoadGate';
import { getPermissions } from '@core/component/SharePermissions';
import { ShareTrigger } from '@core/component/TopBar/ShareButton';
import { useShareModal } from '@core/component/TopBar/shareModal';
import { ENABLE_EMAIL_SHARING } from '@core/constant/featureFlags';
import { registerHotkey } from '@core/hotkey/hotkeys';
import { TOKENS } from '@core/hotkey/tokens';
import { isTouchDevice } from '@core/mobile/isTouchDevice';
import { fireAndForget } from '@core/util/fireAndForget';
import { buildEntityData, type EntityData } from '@entity';
import { useThreadQuery } from '@queries/email/thread';
import { representativeThreadMessage } from '@queries/email/thread-subject';
import { ButtonGroup, cn } from '@ui';
import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from 'solid-js';
import { Portal } from 'solid-js/web';
import { emailDetailSearch } from '../email-route';
import { useEmailView } from '../email-view-context';
import {
  type BufferedThreadView,
  createBufferedThread,
} from '../primitives/buffered-thread';
import { useEmailReaderPane } from '../reader-pane';
import type { EmailThreadTarget } from '../types';
import { useEmailDetailListNavigation } from '../use-email-detail-list-navigation';

function EmailDetailHeader(
  props: EmailThreadToolsOptions & {
    value: string;
    focusThread: () => void;
    controlsMount: HTMLDivElement | undefined;
    onEmailReminderSaved: () => void | Promise<void>;
  }
) {
  const { emailEntity, permissions, menuTools, controls } =
    useEmailThreadTools(props);
  return (
    <>
      <ViewBreadcrumbs.Item
        value={props.value}
        metadata={{ type: 'email', id: props.id }}
        order={1}
      >
        {(item) => (
          <div class="flex min-w-0 items-center gap-0.5">
            <ViewBreadcrumbs.Button
              class="gap-1.5"
              isActive={item.isActive()}
              onClick={() => {
                item.onSelect();
                props.focusThread();
              }}
              tooltip={props.title}
            >
              <EntityIcon targetType="email" size="xs" class="shrink-0" />
              <span class="truncate">{props.title}</span>
            </ViewBreadcrumbs.Button>
            <div class="shrink-0">
              <SplitFileMenu
                id={props.id}
                itemType="email"
                entityKind="email"
                name={props.title}
                entity={emailEntity()}
                permissions={permissions()}
                ops={[]}
                tools={menuTools}
                onEmailReminderSaved={props.onEmailReminderSaved}
              />
            </div>
          </div>
        )}
      </ViewBreadcrumbs.Item>
      <Show when={props.controlsMount}>
        {(mount) => (
          <Portal mount={mount()}>
            <ButtonGroup variant="outline" size="icon-md" class="touch:hidden">
              <EmailThreadControls {...controls} />
              <Show when={props.listNavigation}>
                {(navigation) => (
                  <ListNavigationButtons
                    navigation={navigation()}
                    class="gap-0"
                  />
                )}
              </Show>
            </ButtonGroup>
          </Portal>
        )}
      </Show>
    </>
  );
}

/**
 * Tells its parent when the content beside it is in the DOM. Effects under a
 * suspended load gate wait for it to resolve, so `onMount` runs only once the
 * content is inserted.
 */
function OnContentMount(props: { set: (mounted: boolean) => void }) {
  onMount(() => props.set(true));
  onCleanup(() => props.set(false));
  return null;
}

/** What a mounted thread hands the route, which acts on the one on screen. */
type EmailThreadView = BufferedThreadView & {
  title: Accessor<string>;
  entity: Accessor<EntityData | undefined>;
  keyboard: Accessor<EmailThreadKeyboardHandlers | undefined>;
};

/**
 * One thread in the reader. It may be loading hidden behind the thread on
 * screen; until it is shown it does not mark itself read or render its
 * header, and its side panel leaves `]` to the shown thread's.
 */
function EmailDetailView(props: {
  thread: EmailThreadTarget;
  targetMessageId?: string;
  targetRequest?: string;
  shown: boolean;
  listNavigation: EmailThreadListNavigation;
  focusReader: () => void;
  attach: (view: EmailThreadView) => void;
}) {
  const { closeThread } = useEmailView();
  const panel = useSplitPanelOrThrow();
  const keyScope = useEmailReaderPane()?.hotkeyScope ?? panel.splitHotkeyScope;
  const notificationSource = useGlobalNotificationSource();
  const [controlsMount, setControlsMount] = createSignal<HTMLDivElement>();
  const [keyboard, setKeyboard] = createSignal<EmailThreadKeyboardHandlers>();
  const threadId = () => props.thread.id;
  const threadQuery = useThreadQuery(threadId, () => ({
    enabled: !!threadId(),
  }));
  const source = createEmailThreadSource(threadId, threadQuery);
  const threadData = source.thread;
  const title = () => {
    const thread = threadData();
    return (
      (thread &&
        displaySubject(
          representativeThreadMessage(thread.messages)?.subject
        )) ||
      props.thread.fallbackName ||
      'Email'
    );
  };
  const openShare = useShareModal(() => {
    const thread = threadData();
    if (!thread) return;
    return {
      id: props.thread.id,
      blockAlias: 'email',
      itemType: 'email',
      name: title(),
      userPermissions: getPermissions(thread.access_level),
    };
  });
  const commandEntity = createMemo(() => {
    if (!threadQuery.isSuccess) return undefined;
    const thread = threadData();
    if (!thread) return undefined;
    return buildEntityData({
      id: thread.db_id,
      name: displaySubject(
        representativeThreadMessage(thread.messages)?.subject
      ),
      blockName: 'email',
      isRead: thread.is_read,
      done: !thread.inbox_visible,
    });
  });
  const [contentMounted, setContentMounted] = createSignal(false);
  // The load gate shows data over an error. With data, the content can still
  // suspend for a moment; it has rendered once it is in the DOM.
  props.attach({
    state: () => {
      if (threadData() !== undefined)
        return contentMounted() ? 'rendered' : 'loading';
      return threadQuery.isError ? 'failed' : 'loading';
    },
    title,
    entity: commandEntity,
    keyboard,
  });
  const host: EmailThreadHost = {
    returnToList: closeThread,
    listNavigation: props.listNavigation,
    focusContainer: props.focusReader,
    targetMessageId: () => props.targetMessageId,
    targetRequest: () => props.targetRequest,
    isActive: panel.isPanelActive,
    registerKeyboard: (handlers) => {
      setKeyboard(() => handlers);
      // The thread content can unmount (loading, error) before this view.
      onCleanup(() =>
        setKeyboard((current) => (current === handlers ? undefined : current))
      );
    },
  };
  const breadcrumbValue = () => `email-thread:${props.thread.id}`;
  const loadResult = {
    data: threadData,
    error: () =>
      threadQuery.isError ? toEntityLoadError(threadQuery.error) : undefined,
    isPending: () => threadQuery.isLoading,
  };

  return (
    <SidePanel.Root floating defaultOpen={false} keyboard={props.shown}>
      <div class="flex size-full min-h-0 min-w-0 flex-col overflow-hidden">
        <ViewShell.TopBar class="touch:flex">
          <ViewBreadcrumbs.Outlet
            class="flex-1"
            aria-label="Email location"
            fallback={<EntityDetailBreadcrumbSkeleton />}
          />
          <div class="ml-auto flex shrink-0 items-center gap-1 @max-[900px]/split-header:[&_[data-header-action]]:w-8 @max-[900px]/split-header:[&_[data-header-action]]:p-0 @max-[900px]/split-header:[&_[data-header-action-label]]:hidden">
            <div ref={setControlsMount} class="flex items-center" />
            <SidePanel.HeaderActionsOutlet />
            <Show when={ENABLE_EMAIL_SHARING && props.shown}>
              <ShareTrigger
                onClick={openShare}
                id={props.thread.id}
                blockType="email"
                hotkeyScope={keyScope}
              />
            </Show>
            <SidePanel.Toggle />
          </div>
        </ViewShell.TopBar>
        <div class="relative min-h-0 min-w-0 flex-1">
          <EmailThreadLoadGate
            result={loadResult}
            notificationSource={notificationSource}
            threadId={props.thread.id}
            linkId={threadData()?.link_id}
            markRead={props.shown}
            debounceTime={100}
            onRetry={() => fireAndForget(threadQuery.refetch(), 'email-view')}
          >
            <EmailThreadHostView
              title={title()}
              threadId={threadId}
              source={source}
              threadTransport={() => threadQuery.transport}
              host={host}
              chrome={({ createTask }) => (
                <Show when={props.shown}>
                  <EmailDetailHeader
                    onEmailReminderSaved={async () => {
                      await props.listNavigation.afterReminderSaved?.();
                    }}
                    id={props.thread.id}
                    title={title()}
                    onCreateTask={createTask}
                    onMarkedUnread={closeThread}
                    onDeleted={closeThread}
                    listNavigation={props.listNavigation}
                    value={breadcrumbValue()}
                    focusThread={props.focusReader}
                    controlsMount={controlsMount()}
                  />
                </Show>
              )}
              sidePanelHeaderToggle={false}
            />
            <OnContentMount set={setContentMounted} />
          </EmailThreadLoadGate>
        </div>
      </div>
    </SidePanel.Root>
  );
}

/**
 * Keeps the open thread on screen while the next one loads behind it, so
 * stepping through threads never flashes an empty reader. The incoming thread
 * renders hidden and inert, and replaces the current one once it has loaded
 * or failed, or after a deadline with its own loading state.
 *
 * Whatever acts on what the user sees is set up here once and follows the
 * thread on screen: its keys, the split's name and focus. A swap re-registers
 * nothing, and focus on the reader survives it.
 */
export function EmailDetailRouteView() {
  const params = useRouteParams(emailThreadRoute);
  const [search] = createSearchParams(emailDetailSearch);
  const { closeThread } = useEmailView();
  const panel = useSplitPanelOrThrow();
  // In the reading pane the thread keeps its keys in the reader's scope, and
  // Escape hands the keyboard back to the list instead of closing it.
  const pane = useEmailReaderPane();
  const keyScope = pane?.hotkeyScope ?? panel.splitHotkeyScope;
  const canAutofocus = useCanAutofocusSplitContent();
  const buffer = createBufferedThread<EmailThreadView>(() => params.threadId);
  // Steps from the latest request, so presses made while a thread loads
  // behind the current one are not lost. It outlives each thread, so Undo
  // after Mark done can still step back to the archived one.
  const listNavigation = useEmailDetailListNavigation(() => params.threadId);
  // While the next thread loads, the one on screen holds its actions: the
  // user has moved on, so `e` must not archive the thread they left.
  const ready = () => !buffer.switching();
  const keyboard = delegateThreadKeyboard(
    () => buffer.current()?.keyboard(),
    ready
  );

  useSplitDisplayName(() => buffer.current()?.title());
  useBlockEntityCommands({
    id: buffer.shown,
    scopeId: keyScope,
    resolveEntity: () => (ready() ? buffer.current()?.entity() : undefined),
    onDeleted: closeThread,
    onEmailReminderSaved: async () => {
      await listNavigation.afterReminderSaved?.();
    },
  });
  useListNavigationHotkeys({
    scopeId: keyScope,
    enabled: panel.isPanelActive,
    navigation: listNavigation,
    arrowKeys: true,
  });
  // After the block commands, which register in an effect: the thread keys
  // take r, e and Enter from them.
  onMount(() => {
    registerEmailHotkeys(keyScope, keyboard);
    registerHotkey({
      hotkey: 'enter',
      scopeId: keyScope,
      description: 'Reply to message',
      keyDownHandler: keyboard.activate,
      hotkeyToken: TOKENS.block.focus,
      hide: true,
    });
    registerHotkey({
      hotkey: 'escape',
      scopeId: keyScope,
      description: 'Collapse message or back to list',
      // Escape unwinds thread state first (reply, expanded body, focused
      // message). Once nothing is left to unwind it follows the breadcrumb
      // back to the list this thread was opened from.
      keyDownHandler: () => {
        if (keyboard.cancel()) return true;
        (pane?.focusList ?? closeThread)();
        return true;
      },
      hotkeyToken: TOKENS.email.cancelReply,
      hide: true,
    });
  });

  let reader: HTMLDivElement | undefined;
  const focusReader = () => reader?.focus({ preventScroll: true });
  createSplitAutofocus({
    element: () => reader ?? null,
    enabled: () => canAutofocus && panel.isPanelActive() && !isTouchDevice(),
  });
  createEffect(() => {
    if (!pane || pane.focusRequest() !== buffer.shown()) return;
    pane.clearFocusRequest();
    focusReader();
  });

  return (
    <div ref={reader} class="relative size-full min-h-0 min-w-0" tabIndex={-1}>
      <For each={buffer.mounted()}>
        {(threadId) => {
          let slot: HTMLDivElement | undefined;
          const shown = () => buffer.shown() === threadId;
          // A message target belongs to the thread it was requested for.
          const targetMessageId = createMemo<string | undefined>((previous) =>
            params.threadId === threadId
              ? search.messageId || undefined
              : previous
          );
          const targetRequest = createMemo<string | undefined>((previous) =>
            params.threadId === threadId ? search.seek : previous
          );
          // Removing the thread that holds focus would drop it to the body.
          onCleanup(() => {
            if (slot?.contains(document.activeElement)) focusReader();
          });
          return (
            <div
              ref={slot}
              class={cn(
                'size-full min-h-0 min-w-0',
                !shown() && 'invisible absolute inset-0'
              )}
              inert={!shown()}
              aria-hidden={!shown()}
            >
              <EmailDetailView
                thread={{ id: threadId }}
                targetMessageId={targetMessageId()}
                targetRequest={targetRequest()}
                shown={shown()}
                listNavigation={listNavigation}
                focusReader={focusReader}
                attach={(view) => buffer.attach(threadId, view)}
              />
            </div>
          );
        }}
      </For>
    </div>
  );
}
