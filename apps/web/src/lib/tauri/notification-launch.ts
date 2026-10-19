import {
  pendingNotificationNavigation,
  receiveNotificationTap,
} from '@notifications/notification-navigation-intent';
import { createPushApi, supportsNotificationLaunch } from './push-api';

/** Read the native launch intent before the hash router can restore another page. */
export async function prepareNotificationLaunch(): Promise<void> {
  if (!supportsNotificationLaunch()) return;
  const api = createPushApi('ios');
  await api.watch((event) => {
    receiveNotificationTap(event, api.acknowledge);
  });
  const pending = await api.pending();
  if (pending) receiveNotificationTap(pending, api.acknowledge);
  if (!pendingNotificationNavigation()) return;
  const url = new URL(window.location.href);
  // BasePath verifies the account and chooses the notification route. Do not
  // restore a previous page while that identity is still unknown.
  url.hash = '/';
  window.history.replaceState(window.history.state, '', url);
}
