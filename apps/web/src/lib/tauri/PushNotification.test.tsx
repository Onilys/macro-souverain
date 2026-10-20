import {
  pendingNotificationNavigationId,
  setPendingNotificationNavigationId,
} from '@notifications/notification-navigation-intent';
import { createRoot } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MaybePushNotificationRegistration } from './PushNotification';
import type { PushEvent } from './push-api';

const registration = vi.hoisted(() => ({
  os: 'android',
  version: '16',
  sync: undefined as (() => Promise<void>) | undefined,
  register: vi.fn(async () => ({ isErr: () => false })),
  receive: undefined as ((event: PushEvent) => void) | undefined,
  buffered: undefined as PushEvent | undefined,
  acknowledge: vi.fn(async (_deliveryId: string) => {}),
}));
vi.mock('@core/constant/featureFlags', () => ({ ENABLE_CALLKIT: true }));
vi.mock('@core/util/platform', () => ({
  isTauri: () => true,
  isPlatform: (os: string) => registration.os === os,
}));
vi.mock('@tauri-apps/plugin-os', () => ({
  version: () => registration.version,
}));
vi.mock('@core/util/cookies', () => ({ hasLoginCookie: () => true }));
vi.mock('@core/auth/push-registration-lifecycle', () => ({
  registerPushRegistrationLifecycle: (hooks: {
    syncRegistration: () => Promise<void>;
  }) => {
    registration.sync = hooks.syncRegistration;
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
  removeAllActive: async () => {},
}));
vi.mock('@notifications', async () => ({
  PlatformNotificationProvider: () => null,
  ...(await import('@notifications/notification-navigation-intent')),
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
    configureRecipient: async () => {},
    watch: async (callback: (event: PushEvent) => void) => {
      registration.receive = callback;
      if (registration.buffered) callback(registration.buffered);
    },
    unwatch: async () => {},
    acknowledge: registration.acknowledge,
  }),
}));

let dispose: (() => void) | undefined;
beforeEach(() => {
  registration.os = 'android';
  registration.version = '16';
  registration.sync = undefined;
  registration.register.mockClear();
  registration.receive = undefined;
  registration.buffered = undefined;
  registration.acknowledge.mockClear();
  setPendingNotificationNavigationId(undefined);
  delete window.__MACRO_ANDROID_CALL_KIT__;
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  setPendingNotificationNavigationId(undefined);
  delete window.__MACRO_ANDROID_CALL_KIT__;
});

describe.each(['ios', 'android'])('%s push notification navigation', (os) => {
  beforeEach(() => {
    registration.os = os;
  });

  it.each(['FOREGROUND_TAP', 'BACKGROUND_TAP'] as const)(
    'opens the tapped location for %s before device registration completes',
    (type) => {
      createRoot((cleanup) => {
        dispose = cleanup;
        MaybePushNotificationRegistration({ children: null });
      });
      expect(registration.register).not.toHaveBeenCalled();
      expect(registration.receive).toBeDefined();
      registration.receive!({
        type,
        payload: { notificationId: 'mobile-notification' },
        deliveryId: 'mobile-delivery',
      });
      expect(pendingNotificationNavigationId()).toBe('mobile-notification');
      expect(registration.acknowledge).toHaveBeenCalledExactlyOnceWith(
        'mobile-delivery'
      );
    }
  );

  it('retains a launch tap replayed when the native listener attaches', () => {
    registration.buffered = {
      type: 'BACKGROUND_TAP',
      payload: { notificationId: 'cold-start-notification' },
    };
    createRoot((cleanup) => {
      dispose = cleanup;
      MaybePushNotificationRegistration({ children: null });
    });
    expect(pendingNotificationNavigationId()).toBe('cold-start-notification');
    expect(registration.register).not.toHaveBeenCalled();
  });

  it.each(['FOREGROUND_DELIVERY', 'BACKGROUND_DELIVERY'] as const)(
    'does not navigate on %s',
    (type) => {
      createRoot((cleanup) => {
        dispose = cleanup;
        MaybePushNotificationRegistration({ children: null });
      });
      registration.receive!({
        type,
        payload: { notificationId: 'received-notification' },
      });
      expect(pendingNotificationNavigationId()).toBeUndefined();
    }
  );

  it.each<PushEvent['payload']>([{}, { notificationId: '' }])(
    'ignores a tap without a destination (%j)',
    (payload) => {
      createRoot((cleanup) => {
        dispose = cleanup;
        MaybePushNotificationRegistration({ children: null });
      });
      registration.receive!({ type: 'BACKGROUND_TAP', payload });
      expect(pendingNotificationNavigationId()).toBeUndefined();
    }
  );

  it('ignores taps after the mobile registration provider is disposed', () => {
    createRoot((cleanup) => {
      dispose = cleanup;
      MaybePushNotificationRegistration({ children: null });
    });
    dispose?.();
    dispose = undefined;
    registration.receive!({
      type: 'BACKGROUND_TAP',
      payload: { notificationId: 'stale-notification' },
    });
    expect(pendingNotificationNavigationId()).toBeUndefined();
  });
});

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
      createRoot((cleanup) => {
        dispose = cleanup;
        MaybePushNotificationRegistration({ children: null });
      });
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
