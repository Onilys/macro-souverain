import { expect, it, vi } from 'vitest';
import {
  type EmailThreadKeyboardHandlers,
  holdThreadActions,
} from './thread-keyboard';

function handlers() {
  const action = () => vi.fn(() => true);
  return {
    activate: action(),
    cancel: action(),
    replyToFocusedMessage: action(),
    replyAllToFocusedMessage: action(),
    forwardFocusedMessage: action(),
    blockSender: action(),
    markDone: action(),
    markNotDone: action(),
    isThreadDone: () => false,
    canMarkNotDone: () => true,
    markUnread: action(),
    markRead: action(),
    isThreadMarkedUnread: () => false,
    markSenderSignal: action(),
    markSenderNoise: action(),
    navigateToPreviousMessage: action(),
    navigateToNextMessage: action(),
  } satisfies EmailThreadKeyboardHandlers;
}

it('swallows thread actions while held and runs them once ready', () => {
  const inner = handlers();
  let ready = false;
  const held = holdThreadActions(inner, () => ready);

  expect(held.markDone()).toBe(true);
  expect(held.replyToFocusedMessage()).toBe(true);
  expect(held.activate()).toBe(true);
  expect(inner.markDone).not.toHaveBeenCalled();
  expect(inner.replyToFocusedMessage).not.toHaveBeenCalled();
  expect(inner.activate).not.toHaveBeenCalled();
  // Escape and message navigation are not actions on the thread.
  held.cancel();
  held.navigateToNextMessage();
  expect(inner.cancel).toHaveBeenCalledOnce();
  expect(inner.navigateToNextMessage).toHaveBeenCalledOnce();

  ready = true;
  held.markDone();
  expect(inner.markDone).toHaveBeenCalledOnce();
});
