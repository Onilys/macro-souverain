import {
  finishNotificationNavigation,
  pendingNotificationNavigation,
  setPendingNotificationNavigationId,
} from '@notifications/notification-navigation-intent';
import { endNotificationOpen } from '@notifications/notification-open-trace';
import { waitFor } from '@solidjs/testing-library';
import { createRoot } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MaybePushNotificationRegistration } from './PushNotification';
import type { PushEvent } from './push-api';

const registration = vi.hoisted(() => ({
  os: 'android',
  version: '16',
  signedIn: true,
  sync: undefined as (() => Promise<void>) | undefined,
  logout: undefined as (() => Promise<void>) | undefined,
  onEvent: undefined as ((event: PushEvent) => void) | undefined,
  register: vi.fn(async () => ({ isErr: () => false })),
  configureRecipient: vi.fn(async (_recipientId: string | null) => {}),
  acknowledge: vi.fn(async (_deliveryId: string) => {}),
  clearPending: vi.fn(async () => {}),
  releaseCover: vi.fn(async () => {}),
  removeAllActive: vi.fn(async () => {}),
}));
vi.mock('@core/constant/featureFlags', () => ({ ENABLE_CALLKIT: true }));
vi.mock('@core/util/platform', () => ({
  isTauri: () => true,
  isPlatform: (os: string) => registration.os === os,
}));
vi.mock('@tauri-apps/plugin-os', () => ({
  version: () => registration.version,
}));
vi.mock('@core/util/cookies', () => ({
  hasLoginCookie: () => registration.signedIn,
}));
vi.mock('@core/auth/push-registration-lifecycle', () => ({
  registerPushRegistrationLifecycle: (hooks: {
    syncRegistration: () => Promise<void>;
    unregisterForLogout: () => Promise<void>;
  }) => {
    registration.sync = hooks.syncRegistration;
    registration.logout = hooks.unregisterForLogout;
    return () => {};
  },
  syncPushRegistrations: async () => {},
}));
vi.mock('@queries/notification/device-registration', () => ({
  fetchPushRecipient: async () => 'macro|test@example.com',
  registerPushDevice: registration.register,
  unregisterPushDevice: async () => ({ isErr: () => false }),
}));
vi.mock('@solid-primitives/storage', () => ({
  makePersisted: (signal: unknown) => signal,
}));
vi.mock('@tauri-apps/plugin-notification', () => ({
  removeAllActive: registration.removeAllActive,
}));
vi.mock('@notifications', () => ({
  PlatformNotificationProvider: () => null,
  triggerNotificationNavigation: vi.fn(),
}));
vi.mock('./TauriProvider', () => ({
  useExpectTauri: () => ({ os: registration.os }),
}));
vi.mock('./notification', () => ({
  createTauriNotificationInterface: vi.fn(),
}));
vi.mock('./push-api', () => ({
  createPushApi: () => ({
    checkPermissions: async () => ({ status: 'granted' }),
    register: async () => ({ token: 'test-device-token' }),
    configureRecipient: registration.configureRecipient,
    watch: async (callback: (event: PushEvent) => void) => {
      registration.onEvent = callback;
    },
    unwatch: async () => {},
    acknowledge: registration.acknowledge,
    clearPending: registration.clearPending,
  }),
  releaseNotificationCover: registration.releaseCover,
}));

let dispose: (() => void) | undefined;
beforeEach(() => {
  registration.os = 'android';
  registration.version = '16';
  registration.signedIn = true;
  registration.sync = undefined;
  registration.logout = undefined;
  registration.onEvent = undefined;
  vi.clearAllMocks();
  delete window.__MACRO_ANDROID_CALL_KIT__;
});
afterEach(() => {
  dispose?.();
  setPendingNotificationNavigationId(undefined);
  endNotificationOpen('test_complete');
  delete window.__MACRO_ANDROID_CALL_KIT__;
});

function mountRegistration() {
  createRoot((cleanup) => {
    dispose = cleanup;
    MaybePushNotificationRegistration({ children: null });
  });
}

describe('push registration native-call capability', () => {
  it.each([
    { os: 'android', version: '16', binary: true, expected: true },
    { os: 'android', version: '16', binary: false, expected: false },
    { os: 'android', version: '7.1.2', binary: true, expected: false },
    { os: 'ios', version: '18', binary: false, expected: undefined },
  ])(
    'registers $os $version with binary capability $binary',
    async ({ os, version, binary, expected }) => {
      registration.os = os;
      registration.version = version;
      if (binary) window.__MACRO_ANDROID_CALL_KIT__ = true;
      mountRegistration();
      expect(registration.sync).toBeDefined();
      await registration.sync!();
      expect(registration.register).toHaveBeenCalledExactlyOnceWith({
        deviceType: os,
        token: 'test-device-token',
        ...(expected === undefined ? {} : { nativeCallCapable: expected }),
      });
    }
  );
});

describe('iOS notification launch integration', () => {
  const tap: PushEvent = {
    type: 'BACKGROUND_TAP',
    deliveryId: 'delivery-1',
    receivedAtMs: 123,
    payload: {
      notificationId: 'notification-1',
      recipientId: 'macro|test@example.com',
      navigation: JSON.stringify({
        type: 'channel',
        channelId: '11111111-1111-4111-8111-111111111111',
        messageId: '22222222-2222-4222-8222-222222222222',
        threadId: null,
      }),
    },
  };

  beforeEach(() => {
    registration.os = 'ios';
  });

  it('binds the iOS receiver to the actual registered recipient', async () => {
    mountRegistration();
    await registration.sync!();
    expect(registration.configureRecipient).toHaveBeenCalledExactlyOnceWith(
      'macro|test@example.com'
    );
  });

  it('retains a delivered tap until navigation and native acknowledgment finish', async () => {
    let completeAcknowledgment!: () => void;
    registration.acknowledge.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          completeAcknowledgment = resolve;
        })
    );
    mountRegistration();
    await waitFor(() => expect(registration.onEvent).toBeDefined());
    registration.onEvent!(tap);
    const intent = pendingNotificationNavigation();
    expect(intent).toMatchObject({
      notificationId: 'notification-1',
      deliveryId: 'delivery-1',
      target: { messageId: '22222222-2222-4222-8222-222222222222' },
    });
    expect(registration.acknowledge).not.toHaveBeenCalled();

    finishNotificationNavigation(intent!);
    expect(registration.acknowledge).toHaveBeenCalledExactlyOnceWith(
      'delivery-1'
    );
    expect(pendingNotificationNavigation()).toBe(intent);
    completeAcknowledgment();
    await waitFor(() =>
      expect(pendingNotificationNavigation()).toBeUndefined()
    );
  });

  it('retains a signed-out tap and reveals the sign-in UI', async () => {
    registration.signedIn = false;
    mountRegistration();
    await waitFor(() => expect(registration.onEvent).toBeDefined());
    registration.onEvent!(tap);
    await waitFor(() =>
      expect(registration.releaseCover).toHaveBeenCalledOnce()
    );
    expect(pendingNotificationNavigation()).toMatchObject({
      notificationId: 'notification-1',
      deliveryId: 'delivery-1',
    });
    expect(registration.acknowledge).not.toHaveBeenCalled();
    expect(registration.clearPending).not.toHaveBeenCalled();
    expect(registration.configureRecipient).not.toHaveBeenCalled();
  });

  it('clears the pending tap and disarms the receiver on explicit logout', async () => {
    mountRegistration();
    await waitFor(() => expect(registration.onEvent).toBeDefined());
    registration.onEvent!(tap);
    expect(pendingNotificationNavigation()).toBeDefined();
    registration.signedIn = false;
    await registration.logout!();
    expect(pendingNotificationNavigation()).toBeUndefined();
    expect(registration.clearPending).toHaveBeenCalledOnce();
    expect(registration.configureRecipient).toHaveBeenCalledExactlyOnceWith(
      null
    );
    expect(registration.removeAllActive).toHaveBeenCalledOnce();
    expect(registration.acknowledge).not.toHaveBeenCalled();
  });
});
