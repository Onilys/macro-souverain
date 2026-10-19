import {
  pendingNotificationChannelTarget,
  pendingNotificationNavigationId,
  setPendingNotificationNavigationId,
} from '@app/features/notifications/notification-navigation-intent';
import { cleanup, render } from '@solidjs/testing-library';
import { createRoot, type JSX } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MaybePushNotificationRegistration } from './PushNotification';
import type { PushEvent } from './push-api';

const registration = vi.hoisted(() => ({
  os: 'android',
  loggedIn: true,
  watch: vi.fn<(callback: (event: PushEvent) => void) => Promise<void>>(),
  version: '16',
  sync: undefined as (() => Promise<void>) | undefined,
  register: vi.fn(async () => ({ isErr: () => false })),
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
  hasLoginCookie: () => registration.loggedIn,
}));
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
vi.mock('@notifications', () => ({
  PlatformNotificationProvider: (props: { children: JSX.Element }) =>
    props.children,
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
    configureRecipient: async () => {},
    watch: registration.watch,
    unwatch: async () => {},
  }),
}));

let dispose: (() => void) | undefined;
beforeEach(() => {
  registration.os = 'android';
  registration.loggedIn = true;
  registration.watch.mockReset().mockResolvedValue();
  window.history.replaceState(null, '', '/#/home');
  setPendingNotificationNavigationId(undefined);
  registration.version = '16';
  registration.sync = undefined;
  registration.register.mockClear();
  delete window.__MACRO_ANDROID_CALL_KIT__;
});
afterEach(() => {
  dispose?.();
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete window.__MACRO_ANDROID_CALL_KIT__;
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

const targetPayload = {
  notificationId: '01943210-1234-7000-8000-000000000004',
  channelId: '01943210-1234-7000-8000-000000000003',
  messageId: '01943210-1234-7000-8000-000000000001',
  threadId: '01943210-1234-7000-8000-000000000002',
};

function Page() {
  return <div data-testid="page">{window.location.hash}</div>;
}

describe('iOS startup notification handoff', () => {
  it('drains a buffered tap before mounting any page, independently of token registration', async () => {
    registration.os = 'ios';
    let finishWatch!: () => void;
    registration.watch.mockImplementation(async (callback) => {
      await new Promise<void>((resolve) => {
        finishWatch = resolve;
      });
      callback({ type: 'BACKGROUND_TAP', payload: targetPayload });
    });
    const screen = render(() => (
      <MaybePushNotificationRegistration>
        <Page />
      </MaybePushNotificationRegistration>
    ));
    expect(screen.queryByTestId('page')).toBeNull();
    finishWatch();
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.getByTestId('page').textContent).toContain(
      `#/channel/${targetPayload.channelId}`
    );
    expect(screen.getByTestId('page').textContent).not.toContain('/home');
    expect(pendingNotificationNavigationId()).toBeUndefined();
    expect(registration.register).not.toHaveBeenCalled();
  });

  it('renders normally after the native buffer is empty, and queues subsequent taps in place', async () => {
    registration.os = 'ios';
    const screen = render(() => (
      <MaybePushNotificationRegistration>
        <Page />
      </MaybePushNotificationRegistration>
    ));
    await Promise.resolve();
    await Promise.resolve();
    const page = screen.getByTestId('page');
    expect(page.textContent).toBe('#/home');
    registration.watch.mock.calls[0]![0]({
      type: 'BACKGROUND_TAP',
      payload: targetPayload,
    });
    expect(screen.getByTestId('page')).toBe(page);
    expect(pendingNotificationChannelTarget()?.channelId).toBe(
      targetPayload.channelId
    );
  });

  it('releases startup on listener failure and retries without remounting the page', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    registration.os = 'ios';
    registration.watch.mockRejectedValueOnce(new Error('native unavailable'));
    const screen = render(() => (
      <MaybePushNotificationRegistration>
        <Page />
      </MaybePushNotificationRegistration>
    ));
    await Promise.resolve();
    await Promise.resolve();
    const page = screen.getByTestId('page');
    await vi.advanceTimersByTimeAsync(1000);
    expect(registration.watch).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('page')).toBe(page);
  });

  it('releases startup if the bridge hangs, then handles a late tap through normal navigation', async () => {
    vi.useFakeTimers();
    registration.os = 'ios';
    registration.watch.mockImplementation(() => new Promise(() => {}));
    const screen = render(() => (
      <MaybePushNotificationRegistration>
        <Page />
      </MaybePushNotificationRegistration>
    ));
    expect(screen.queryByTestId('page')).toBeNull();
    await vi.advanceTimersByTimeAsync(1500);
    const page = screen.getByTestId('page');
    registration.watch.mock.calls[0]![0]({
      type: 'BACKGROUND_TAP',
      payload: targetPayload,
    });
    expect(screen.getByTestId('page')).toBe(page);
    expect(window.location.hash).toBe('#/home');
    expect(pendingNotificationChannelTarget()?.messageId).toBe(
      targetPayload.messageId
    );
  });

  it('does not consume a tap after logout', async () => {
    registration.os = 'ios';
    render(() => (
      <MaybePushNotificationRegistration>
        <Page />
      </MaybePushNotificationRegistration>
    ));
    await Promise.resolve();
    registration.loggedIn = false;
    registration.watch.mock.calls[0]![0]({
      type: 'BACKGROUND_TAP',
      payload: targetPayload,
    });
    expect(window.location.hash).toBe('#/home');
    expect(pendingNotificationNavigationId()).toBeUndefined();
  });
});
