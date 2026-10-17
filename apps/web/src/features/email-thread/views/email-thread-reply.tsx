import { EmailFormContextProvider } from '@app/features/email-compose/context/email-form-context';
import { ContentLoading } from '@components/app/ContentLoading';
import { Show } from 'solid-js';
import type { ReplyType } from '../../email-compose/core/reply-type';
import {
  type EmailRenderingContextValue,
  EmailRenderingProvider,
} from '../../email-message/context/email-rendering-context';
import { EmailThreadStateProvider } from '../context/email-thread-state-context';
import {
  type EmailReplyHandoff,
  type EmailThreadViewContext,
  EmailThreadViewProvider,
} from '../context/email-thread-view-context';
import { createEmailThreadState } from '../primitives/email-thread-state';
import { createReplyTargetMessage } from '../primitives/reply-target-message';
import { ThreadReplyInput } from './thread-reply-input';

/**
 * One reply of a thread without the thread around it, as the app's reply
 * window shows it. It loads the reply from its saved draft, like a thread
 * reopened after navigating away.
 */
export function EmailThreadReplySurface(props: {
  context: EmailThreadViewContext;
  emailRendering: EmailRenderingContextValue;
  reply: EmailReplyHandoff;
  /** The reply is saved; hand it back to its thread. */
  onGiveBack: (replyType: ReplyType) => void;
  /** The reply was sent or discarded. */
  onFinished: () => void;
  /** The reply asked to be shown again, as when its send is undone. */
  onReopen: () => void;
  registerMove: (move: () => Promise<void>) => () => void;
}) {
  const state = createEmailThreadState(props.context.thread);
  // Lands the reply type and the cursor once the composer mounts.
  state.replyRequest.set(props.reply.messageId, props.reply.replyType);
  const target = createReplyTargetMessage({
    messageId: () => props.reply.messageId,
    messages: state.messages.unfiltered,
    source: props.context.thread.source,
    reportError: props.context.compose.notices.reportError,
  });

  return (
    <EmailThreadViewProvider value={props.context}>
      <EmailRenderingProvider value={props.emailRendering}>
        <EmailThreadStateProvider value={state}>
          <EmailFormContextProvider
            context={{
              viewerEmail: props.context.compose.viewerEmail,
              inboxes: props.context.compose.accounts.inboxes,
            }}
            formOptions={{
              getMessageById: (id) =>
                state.messages.unfiltered().find((m) => m.db_id === id),
              getDraftForMessageReply: state.drafts.getDraftForMessage,
              onRecipientsChange: state.onRecipientsChange,
            }}
          >
            <Show
              when={target.message()}
              fallback={
                <Show when={target.missing()} fallback={<ContentLoading />}>
                  <p class="py-6 text-center text-sm text-ink-muted">
                    The message this reply answers could not be loaded.
                  </p>
                </Show>
              }
            >
              {(replyingTo) => (
                <ThreadReplyInput
                  replyingTo={replyingTo}
                  draft={state.drafts.getDraftForMessage(props.reply.messageId)}
                  // The composer outlives a send by its undo: closing finishes
                  // the window's reply, showing it again reopens the window.
                  setShowReply={(value) => {
                    const show =
                      typeof value === 'function' ? value(true) : value;
                    if (show) props.onReopen();
                    else props.onFinished();
                    return show;
                  }}
                  unframed
                  popout={{
                    inWindow: true,
                    move: props.onGiveBack,
                    registerMove: props.registerMove,
                  }}
                />
              )}
            </Show>
          </EmailFormContextProvider>
        </EmailThreadStateProvider>
      </EmailRenderingProvider>
    </EmailThreadViewProvider>
  );
}
