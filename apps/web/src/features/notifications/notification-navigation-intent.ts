import { createSignal } from 'solid-js';

/** A validated channel destination; notification lookup remains optional. */
export type ChannelNotificationTarget = {
  channelId: string;
  messageId: string;
  threadId?: string;
};

const [pending, setPending] = createSignal<{
  id: string;
  channelTarget?: ChannelNotificationTarget;
}>();

export const pendingNotificationNavigationId = () => pending()?.id;
export const pendingNotificationChannelTarget = () => pending()?.channelTarget;

export function setPendingNotificationNavigationId(id: string | undefined) {
  setPending(id ? { id } : undefined);
}

export function triggerNotificationNavigation(
  notificationId: string,
  channelTarget?: ChannelNotificationTarget
) {
  setPending({ id: notificationId, channelTarget });
}
