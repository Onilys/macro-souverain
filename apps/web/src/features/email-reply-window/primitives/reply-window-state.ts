import { type Accessor, createSignal } from 'solid-js';
import type { ReplyType } from '../../email-compose/core/reply-type';
import type {
  EmailReplyHandoff,
  EmailReplyTarget,
  EmailReplyWindow,
} from '../../email-thread/context/email-thread-view-context';

export type ReplyWindowState = EmailReplyWindow & {
  /** The reply in the window. */
  reply: Accessor<EmailReplyHandoff | undefined>;
  minimized: Accessor<boolean>;
  setMinimized: (minimized: boolean) => void;
  /** Fills the screen instead of floating in its corner. */
  expanded: Accessor<boolean>;
  setExpanded: (expanded: boolean) => void;
  /** Bumped each time the window should take focus. */
  focusRequest: Accessor<number>;
  /** Closes the window and gives the reply, already saved, to its thread. */
  giveBack: (replyType: ReplyType) => void;
  /** The mounted reply's save-then-give-back, for the window's own controls. */
  registerMove: (move: () => Promise<void>) => () => void;
  /** Returns the reply to its thread, saving it first when it is mounted. */
  requestClose: () => Promise<void>;
  /** The reply was sent or discarded: close, and let threads drop it. */
  finish: () => void;
  /**
   * Shows a reply that left the window again, such as one whose send was
   * undone after the window closed. A reply the window holds stays mounted.
   */
  reopen: (reply: EmailReplyHandoff) => void;
};

/** One reply at a time floats over the app, wherever the user goes. */
export function createReplyWindowState(): ReplyWindowState {
  const [reply, setReply] = createSignal<EmailReplyHandoff>();
  const [minimized, setMinimized] = createSignal(false);
  const [expanded, setExpanded] = createSignal(false);
  const [focusRequest, setFocusRequest] = createSignal(0);
  const [returned, setReturned] = createSignal<EmailReplyHandoff>();
  // A new object per event, so a repeat for the same reply still notifies.
  const [removed, setRemoved] = createSignal<EmailReplyTarget | undefined>(
    undefined,
    { equals: false }
  );

  const close = () => {
    setReply(undefined);
    setMinimized(false);
    setExpanded(false);
  };
  let move: (() => Promise<void>) | undefined;
  const holds = (target: EmailReplyTarget) => {
    const current = reply();
    return (
      current?.threadId === target.threadId &&
      current.messageId === target.messageId
    );
  };
  const open = (next: EmailReplyHandoff) => {
    setReturned(undefined);
    setMinimized(false);
    setReply({ ...next });
    setFocusRequest((count) => count + 1);
  };

  return {
    reply,
    holds,
    open,
    focus: () => {
      setMinimized(false);
      setFocusRequest((count) => count + 1);
    },
    returned,
    clearReturned: () => setReturned(undefined),
    removed,
    minimized,
    setMinimized,
    expanded,
    setExpanded,
    focusRequest,
    giveBack: (replyType) => {
      const current = reply();
      if (!current) return;
      close();
      setReturned({ ...current, replyType });
    },
    registerMove: (next) => {
      move = next;
      return () => {
        if (move === next) move = undefined;
      };
    },
    // Still loading, the reply has nothing unsaved to hand back.
    requestClose: async () => (move ? await move() : close()),
    finish: () => {
      const current = reply();
      if (!current) return;
      close();
      setRemoved({ threadId: current.threadId, messageId: current.messageId });
    },
    reopen: (next) => {
      if (!holds(next)) open(next);
    },
  };
}
