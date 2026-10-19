import {
  pendingNotificationNavigation,
  setPendingNotificationNavigationId,
} from '@notifications/notification-navigation-intent';
import { endNotificationOpen } from '@notifications/notification-open-trace';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { prepareNotificationLaunch } from './notification-launch';

const bridge = vi.hoisted(() => ({
  supported: true,
  watch: vi.fn(),
  pending: vi.fn(),
  acknowledge: vi.fn(),
}));
vi.mock('./push-api', () => ({
  supportsNotificationLaunch: () => bridge.supported,
  createPushApi: () => bridge,
}));

beforeEach(() => {
  bridge.supported = true;
  bridge.watch.mockResolvedValue(undefined);
  bridge.pending.mockResolvedValue(null);
  bridge.acknowledge.mockResolvedValue(undefined);
  window.history.replaceState(null, '', '/app/#/channels/previous-channel');
});
afterEach(() => {
  vi.clearAllMocks();
  setPendingNotificationNavigationId(undefined);
  endNotificationOpen('test_complete');
});

it('captures a cold-launch tap before the router restores the previous channel', async () => {
  bridge.pending.mockResolvedValue({
    type: 'BACKGROUND_TAP',
    payload: { notificationId: 'notification' },
    deliveryId: 'cold-launch',
  });
  await prepareNotificationLaunch();
  expect(bridge.watch.mock.invocationCallOrder[0]).toBeLessThan(
    bridge.pending.mock.invocationCallOrder[0]
  );
  expect(window.location.hash).toBe('#/');
  expect(pendingNotificationNavigation()?.notificationId).toBe('notification');
  expect(bridge.acknowledge).not.toHaveBeenCalled();
});

it('keeps ordinary icon launches on their restored route', async () => {
  await prepareNotificationLaunch();
  expect(window.location.hash).toBe('#/channels/previous-channel');
});

it('does not call new native commands on older iOS binaries', async () => {
  bridge.supported = false;
  await prepareNotificationLaunch();
  expect(bridge.watch).not.toHaveBeenCalled();
  expect(bridge.pending).not.toHaveBeenCalled();
});
