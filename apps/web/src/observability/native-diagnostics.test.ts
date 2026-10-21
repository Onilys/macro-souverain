import { invoke } from '@tauri-apps/api/core';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DesktopSnapshot } from './desktop';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@core/util/platform', () => ({ isTauri: () => true }));

const snapshot: DesktopSnapshot = {
  identity: {
    instanceId: 'launch',
    nativeVersion: '2.5',
    os: 'ios',
    hostPid: 1,
    recordingId: null,
    tracesUrl: null,
  },
  samples: [],
  droppedSamples: 0,
  recentEvents: {
    events: [],
    currentFrontendInstanceId: null,
    activeContext: [],
    heartbeat: null,
    dropped: 0,
    memoryWarningReporting: true,
  },
};
let dispose: (() => void) | undefined;

beforeEach(() => {
  sessionStorage.clear();
  vi.resetModules();
  vi.mocked(invoke).mockReset().mockResolvedValue(undefined);
  vi.useFakeTimers();
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.useRealTimers();
});

it('does not send unsupported commands to an older binary', async () => {
  const diagnostics = await import('./native-diagnostics');
  diagnostics.recordNativeDiagnostic({ kind: 'visibility', visible: true });
  dispose = diagnostics.startNativeDiagnostics(undefined);
  await diagnostics.sendNativeDiagnostic({
    kind: 'visibility',
    visible: false,
  });
  expect(invoke).not.toHaveBeenCalled();
});

it('bounds a hung bridge and keeps reload and logout usable', async () => {
  const diagnostics = await import('./native-diagnostics');
  dispose = diagnostics.startNativeDiagnostics(snapshot);
  await vi.advanceTimersByTimeAsync(0);
  vi.mocked(invoke)
    .mockClear()
    .mockImplementation(() => new Promise(() => {}));
  const write = diagnostics.sendNativeDiagnostic({
    kind: 'visibility',
    visible: false,
  });
  await vi.advanceTimersByTimeAsync(250);
  await write;
  await diagnostics.sendNativeDiagnostic({
    kind: 'reload_requested',
    reload_id: crypto.randomUUID(),
    reason: 'user_recovery',
  });
  const clearing = diagnostics.clearNativeDiagnostics();
  expect(sessionStorage.getItem('macro-native-diagnostic-document')).toBeNull();
  await vi.advanceTimersByTimeAsync(250);
  await clearing;
  expect(invoke).toHaveBeenCalledTimes(2);
});

it('clears native context before retiring callbacks from the signed-out document', async () => {
  const diagnostics = await import('./native-diagnostics');
  dispose = diagnostics.startNativeDiagnostics(snapshot);
  await diagnostics.clearNativeDiagnostics();
  vi.mocked(invoke).mockClear();
  await diagnostics.sendNativeDiagnostic({
    kind: 'channel',
    channel_id: crypto.randomUUID(),
    open: true,
  });
  await vi.advanceTimersByTimeAsync(10_000);
  expect(invoke).not.toHaveBeenCalled();
  await diagnostics.sendNativeDiagnostic({
    kind: 'reload_requested',
    reload_id: crypto.randomUUID(),
    reason: 'logout',
  });
  expect(invoke).toHaveBeenCalledOnce();
});

it('still clears the previous document if logout happens during startup', async () => {
  const diagnostics = await import('./native-diagnostics');
  await diagnostics.clearNativeDiagnostics();
  dispose = diagnostics.startNativeDiagnostics(snapshot);
  expect(invoke).toHaveBeenNthCalledWith(
    1,
    'record_frontend_diagnostic',
    expect.objectContaining({
      event: { kind: 'started', previous_instance_id: null },
    })
  );
  expect(invoke).toHaveBeenNthCalledWith(
    2,
    'record_frontend_diagnostic',
    expect.objectContaining({ event: { kind: 'account_cleared' } })
  );
});

it('does not recover an old account after native clearing fails', async () => {
  sessionStorage.setItem('macro-native-diagnostic-document', 'launch:previous');
  const diagnostics = await import('./native-diagnostics');
  dispose = diagnostics.startNativeDiagnostics(snapshot);
  expect(diagnostics.recoverableNativeFrontend()).toBe('previous');
  vi.mocked(invoke).mockRejectedValue(new Error('bridge gone'));
  await diagnostics.clearNativeDiagnostics();
  dispose();
  vi.resetModules();
  const replacement = await import('./native-diagnostics');
  dispose = replacement.startNativeDiagnostics(snapshot);
  expect(replacement.recoverableNativeFrontend()).toBeUndefined();
});
