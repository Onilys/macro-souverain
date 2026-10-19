import {
  pendingNotificationChannelTarget,
  pendingNotificationNavigationId,
  setPendingNotificationNavigationId,
} from '@app/features/notifications/notification-navigation-intent';
import { beforeEach, describe, expect, it } from 'vitest';
import { openPushNotification } from './push-navigation';

const payload = {
  notificationId: '01943210-1234-7000-8000-000000000004',
  channelId: '01943210-1234-7000-8000-000000000003',
  messageId: '01943210-1234-7000-8000-000000000001',
  threadId: '01943210-1234-7000-8000-000000000002',
};

beforeEach(() => {
  window.history.replaceState(null, '', '/#/home');
  setPendingNotificationNavigationId(undefined);
});

describe('push destination handoff', () => {
  it('selects the message route before the router mounts without a second navigation', () => {
    const length = window.history.length;
    openPushNotification({ type: 'BACKGROUND_TAP', payload }, true);
    expect(window.location.hash).toBe(
      `#/channel/${payload.channelId}?channel_message_id=${payload.messageId}&channel_thread_id=${payload.threadId}`
    );
    expect(window.history.length).toBe(length);
    expect(pendingNotificationNavigationId()).toBeUndefined();
  });

  it('queues a warm tap with its destination without changing or reloading the document', () => {
    openPushNotification({ type: 'FOREGROUND_TAP', payload }, false);
    expect(window.location.hash).toBe('#/home');
    expect(pendingNotificationNavigationId()).toBe(payload.notificationId);
    expect(pendingNotificationChannelTarget()).toEqual({
      channelId: payload.channelId,
      messageId: payload.messageId,
      threadId: payload.threadId,
    });
  });

  it.each(['BACKGROUND_DELIVERY', 'FOREGROUND_DELIVERY'] as const)(
    'ignores %s',
    (type) => {
      openPushNotification({ type, payload }, true);
      expect(window.location.hash).toBe('#/home');
      expect(pendingNotificationNavigationId()).toBeUndefined();
    }
  );

  it.each([
    { notificationId: payload.notificationId },
    { ...payload, channelId: '../../login' },
    { ...payload, messageId: 'invalid' },
    { ...payload, threadId: 'invalid' },
  ])('falls back to lookup for old or invalid payloads', (data) => {
    openPushNotification({ type: 'BACKGROUND_TAP', payload: data }, true);
    expect(window.location.hash).toBe('#/home');
    expect(pendingNotificationNavigationId()).toBe(payload.notificationId);
    expect(pendingNotificationChannelTarget()).toBeUndefined();
  });

  it('the latest warm tap replaces the complete older target', () => {
    openPushNotification({ type: 'BACKGROUND_TAP', payload }, false);
    openPushNotification(
      {
        type: 'BACKGROUND_TAP',
        payload: {
          notificationId: 'older-format-push',
        },
      },
      false
    );
    expect(pendingNotificationNavigationId()).toBe('older-format-push');
    expect(pendingNotificationChannelTarget()).toBeUndefined();
  });
});

it('a newer buffered direct tap supersedes an older notification-ID lookup', () => {
  openPushNotification(
    { type: 'BACKGROUND_TAP', payload: { notificationId: 'older' } },
    true
  );
  openPushNotification({ type: 'BACKGROUND_TAP', payload }, true);
  expect(pendingNotificationNavigationId()).toBeUndefined();
  expect(window.location.hash).toContain(`/channel/${payload.channelId}`);
});
