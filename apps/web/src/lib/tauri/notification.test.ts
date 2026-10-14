import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createTauriNotificationInterface,
  MacOSNotificationUpdateRequiredError,
} from './notification';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn<(command: string, args?: unknown) => Promise<unknown>>(),
  osType: vi.fn(() => 'macos'),
  isPermissionGranted: vi.fn(async () => true),
  requestPermission: vi.fn(async () => 'granted'),
  sendNotification: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/plugin-os', () => ({ type: mocks.osType }));
vi.mock('@tauri-apps/plugin-notification', () => ({
  isPermissionGranted: mocks.isPermissionGranted,
  requestPermission: mocks.requestPermission,
  sendNotification: mocks.sendNotification,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

const notification = {
  title: 'New message',
  options: { body: 'A teammate mentioned you', icon: 'macro-icon.svg' },
};

describe('desktop notification delivery', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.osType.mockReturnValue('macos');
    mocks.isPermissionGranted.mockResolvedValue(true);
    mocks.requestPermission.mockResolvedValue('granted');
    mocks.invoke.mockImplementation(async (command) => {
      if (command === 'get_macos_notification_permission') return 'granted';
    });
  });

  it('sends macOS notifications through the modern native command and awaits acceptance', async () => {
    const acceptance = deferred<void>();
    mocks.invoke.mockImplementation(async (command) => {
      if (command === 'get_macos_notification_permission') return 'granted';
      return acceptance.promise;
    });
    const adapter = createTauriNotificationInterface(vi.fn());
    let completed = false;
    async function deliver() {
      const result = await adapter.showNotification(notification);
      completed = true;
      return result;
    }
    const delivery = deliver();

    await vi.waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith('send_macos_notification', {
        title: notification.title,
        body: notification.options.body,
      });
    });
    expect(completed).toBe(false);
    expect(mocks.sendNotification).not.toHaveBeenCalled();

    acceptance.resolve();
    await expect(delivery).resolves.toEqual({
      onClick: expect.any(Function),
      onDismiss: expect.any(Function),
      close: expect.any(Function),
    });
    expect(completed).toBe(true);
  });

  it('supports a title without a body on macOS', async () => {
    const adapter = createTauriNotificationInterface(vi.fn());
    await adapter.showNotification({ title: 'Reminder' });
    expect(mocks.invoke).toHaveBeenCalledWith('send_macos_notification', {
      title: 'Reminder',
      body: undefined,
    });
    expect(mocks.sendNotification).not.toHaveBeenCalled();
  });

  it.each(['default', 'denied'])(
    'does not send when macOS permission is %s',
    async (permission) => {
      mocks.invoke.mockResolvedValue(permission);
      const adapter = createTauriNotificationInterface(vi.fn());
      await expect(adapter.showNotification(notification)).resolves.toBe(
        'not-granted'
      );
      expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith(
        'get_macos_notification_permission'
      );
      expect(mocks.sendNotification).not.toHaveBeenCalled();
    }
  );

  it('rechecks the in-app preference after the OS permission read completes', async () => {
    const permission = deferred<NotificationPermission>();
    mocks.invoke.mockReturnValue(permission.promise);
    let enabled = true;
    const adapter = createTauriNotificationInterface(vi.fn(), () => enabled);
    const delivery = adapter.showNotification(notification);
    enabled = false;
    permission.resolve('granted');

    await expect(delivery).resolves.toBe('not-granted');
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith(
      'get_macos_notification_permission'
    );
    expect(mocks.sendNotification).not.toHaveBeenCalled();
  });

  it('propagates native delivery failures without using the legacy sender', async () => {
    const failure = new Error('Notifications are not allowed');
    mocks.invoke
      .mockResolvedValueOnce('granted')
      .mockRejectedValueOnce(failure);
    const adapter = createTauriNotificationInterface(vi.fn());

    await expect(adapter.showNotification(notification)).rejects.toBe(failure);
    expect(mocks.sendNotification).not.toHaveBeenCalled();
  });

  it('requires an app update when an older native build has no modern sender', async () => {
    const missingCommand = 'Command send_macos_notification not found';
    mocks.invoke
      .mockResolvedValueOnce('granted')
      .mockRejectedValueOnce(missingCommand);
    const adapter = createTauriNotificationInterface(vi.fn());

    await expect(adapter.showNotification(notification)).rejects.toEqual(
      new MacOSNotificationUpdateRequiredError(missingCommand)
    );
    expect(mocks.sendNotification).not.toHaveBeenCalled();
  });

  it('never downgrades macOS delivery when an older build also lacks permission commands', async () => {
    mocks.invoke
      .mockRejectedValueOnce(
        'Command get_macos_notification_permission not found'
      )
      .mockRejectedValueOnce('Command send_macos_notification not found');
    const adapter = createTauriNotificationInterface(vi.fn());

    await expect(adapter.showNotification(notification)).rejects.toThrow(
      'Update Macro to receive desktop notifications.'
    );
    expect(mocks.isPermissionGranted).toHaveBeenCalledOnce();
    expect(mocks.sendNotification).not.toHaveBeenCalled();
  });

  it('does not dispatch when reading macOS authorization fails', async () => {
    const failure = new Error('Permission callback was dropped');
    mocks.invoke.mockRejectedValue(failure);
    const adapter = createTauriNotificationInterface(vi.fn());

    await expect(adapter.showNotification(notification)).rejects.toBe(failure);
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith(
      'get_macos_notification_permission'
    );
    expect(mocks.sendNotification).not.toHaveBeenCalled();
  });

  it.each(['windows', 'linux', 'ios', 'android'])(
    'preserves plugin delivery on %s',
    async (os) => {
      mocks.osType.mockReturnValue(os);
      const adapter = createTauriNotificationInterface(vi.fn());
      await adapter.showNotification(notification);

      expect(mocks.invoke).not.toHaveBeenCalled();
      expect(mocks.sendNotification).toHaveBeenCalledExactlyOnceWith({
        title: notification.title,
        body: notification.options.body,
        icon: notification.options.icon,
        extra: {},
      });
    }
  );

  it('preserves the title-only plugin call on other platforms', async () => {
    mocks.osType.mockReturnValue('windows');
    const adapter = createTauriNotificationInterface(vi.fn());
    await adapter.showNotification({ title: 'Reminder' });
    expect(mocks.sendNotification).toHaveBeenCalledExactlyOnceWith('Reminder');
  });
});
