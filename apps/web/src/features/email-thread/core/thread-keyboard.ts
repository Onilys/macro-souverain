export interface EmailThreadKeyboardHandlers {
  activate: () => boolean;
  cancel: () => boolean;
  replyToFocusedMessage: () => boolean;
  replyAllToFocusedMessage?: () => boolean;
  forwardFocusedMessage: () => boolean;
  blockSender: () => boolean;
  markDone: () => boolean;
  markNotDone: () => boolean;
  /** Gates which of Mark done / Mark as not done is active. */
  isThreadDone: () => boolean;
  /** Whether the done state can be reversed at all — false for threads that
   *  are structurally done (no inbound message), where Mark as not done is a
   *  no-op. */
  canMarkNotDone: () => boolean;
  markUnread: () => boolean;
  markRead: () => boolean;
  /** Gates which of Mark as unread / Mark as read is active. */
  isThreadMarkedUnread: () => boolean;
  markSenderSignal: () => boolean;
  markSenderNoise: () => boolean;
  navigateToPreviousMessage: () => boolean;
  navigateToNextMessage: () => boolean;
}

/**
 * Holds the thread's actions while `ready` is false, swallowing their keys so
 * they neither act on this thread nor fall through to another. Escape and
 * message navigation keep working.
 */
export function holdThreadActions(
  handlers: EmailThreadKeyboardHandlers,
  ready: () => boolean
): EmailThreadKeyboardHandlers {
  const hold = (action: () => boolean) => (): boolean =>
    ready() ? action() : true;
  const replyAll = handlers.replyAllToFocusedMessage;
  return {
    ...handlers,
    activate: hold(handlers.activate),
    replyToFocusedMessage: hold(handlers.replyToFocusedMessage),
    replyAllToFocusedMessage: replyAll && hold(replyAll),
    forwardFocusedMessage: hold(handlers.forwardFocusedMessage),
    blockSender: hold(handlers.blockSender),
    markDone: hold(handlers.markDone),
    markNotDone: hold(handlers.markNotDone),
    markUnread: hold(handlers.markUnread),
    markRead: hold(handlers.markRead),
    markSenderSignal: hold(handlers.markSenderSignal),
    markSenderNoise: hold(handlers.markSenderNoise),
  };
}
