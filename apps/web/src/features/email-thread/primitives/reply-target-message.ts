import { type Accessor, createEffect, createSignal } from 'solid-js';
import type { EmailMessage } from '../../email-message/core/email-message';
import type { EmailThreadSource } from '../context/email-thread-context';

/**
 * The message a reply answers, for a reply shown without its thread (the
 * reply window). It may sit beyond the thread's first page, so older pages
 * load until it appears; `missing` is true once the whole thread has loaded
 * without it, or loading failed.
 */
export function createReplyTargetMessage(options: {
  messageId: Accessor<string>;
  messages: Accessor<EmailMessage[]>;
  source: Pick<
    EmailThreadSource,
    'thread' | 'isError' | 'hasMore' | 'isFetchingOlder' | 'fetchOlder'
  >;
  reportError: (error: unknown) => void;
}) {
  const [failed, setFailed] = createSignal(false);
  const message = () =>
    options
      .messages()
      .find((candidate) => candidate.db_id === options.messageId());
  const loadOlder = async () => {
    try {
      await options.source.fetchOlder();
    } catch (error) {
      setFailed(true);
      options.reportError(error);
    }
  };
  createEffect(() => {
    const source = options.source;
    if (message() || failed() || !source.thread() || source.isFetchingOlder())
      return;
    if (source.hasMore()) void loadOlder();
  });
  return {
    message,
    missing: () =>
      !message() &&
      (failed() ||
        options.source.isError() ||
        (!!options.source.thread() &&
          !options.source.hasMore() &&
          !options.source.isFetchingOlder())),
  };
}
