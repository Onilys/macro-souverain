import {
  setPendingNotificationNavigationId,
  triggerNotificationNavigation,
} from '@app/features/notifications/notification-navigation-intent';
import { getChannelParams } from '@channel/Channel/link';
import type { NotificationEvent } from '@inkibra/tauri-plugins/packages/tauri-plugin-notifications';
import { Telemetry } from '@macro-inc/observability';
import { z } from 'zod';

// The native iOS bridge converts each payload value to a string. Keep routing
// fields flat, validate all IDs, and leave older/unsupported pushes to lookup.
const channelTargetSchema = z.object({
  channelId: z.uuid(),
  messageId: z.uuid(),
  threadId: z.uuid().optional(),
});

export function openPushNotification(
  event: NotificationEvent,
  beforeRouter: boolean
) {
  if (event.type !== 'BACKGROUND_TAP' && event.type !== 'FOREGROUND_TAP')
    return;
  const notificationId = event.payload.notificationId;
  if (typeof notificationId !== 'string' || !notificationId) return;

  const parsed = channelTargetSchema.safeParse(event.payload);
  const target = parsed.success ? parsed.data : undefined;
  // This measures routing handoff, not the channel's asynchronous data load.
  const span = Telemetry.span('notification.push.handoff');
  span.setAttr('notification.id', notificationId);
  span.setAttr('notification.navigation', target ? 'direct' : 'lookup');
  span.setAttr('notification.before_router', beforeRouter);
  try {
    if (target) span.setAttr('channel.id', target.channelId);
    if (beforeRouter && target) {
      const query = new URLSearchParams(
        getChannelParams(target.messageId, target.threadId)
      );
      const url = new URL(window.location.href);
      url.hash = `/channel/${target.channelId}?${query}`;
      // The router has not mounted yet. Set its first location without loading
      // a second document or adding the previous page to navigation history.
      window.history.replaceState(window.history.state, '', url);
      setPendingNotificationNavigationId(undefined);
      span.setAttr('notification.handoff.outcome', 'initial_route');
      return;
    }
    triggerNotificationNavigation(notificationId, target);
    span.setAttr('notification.handoff.outcome', 'queued');
  } catch (error) {
    span.error('Push navigation failed');
    throw error;
  } finally {
    span.end();
  }
}
