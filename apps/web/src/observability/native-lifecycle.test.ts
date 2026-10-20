import { afterEach, describe, expect, it, vi } from 'vitest';
import { recordNativeWebviewStart } from './native-lifecycle';

const telemetry = vi.hoisted(() => ({
  track: vi.fn(),
  register: vi.fn(),
  span: { setAttr: vi.fn(), end: vi.fn() },
}));
vi.mock('@app/lib/analytics', () => ({
  analytics: {
    track: telemetry.track,
    posthog: { register: telemetry.register },
  },
}));
vi.mock('@macro-inc/observability', () => ({
  Telemetry: { span: () => telemetry.span },
}));

afterEach(() => {
  document.head.querySelector('meta[name="macro-bundle-build"]')?.remove();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('native WebView startup diagnostics', () => {
  it.each(['android', 'windows', 'linux'])(
    'does not claim termination coverage for %s',
    (os) => {
      recordNativeWebviewStart({
        identity: {
          instanceId: 'native-launch',
          nativeVersion: '2.0',
          recordingId: null,
          tracesUrl: null,
          os,
          hostPid: 123,
        },
        samples: [],
        droppedSamples: 0,
        webContent: { terminations: 0, lastTerminationMs: null },
      });
      expect(telemetry.track).toHaveBeenCalledWith(
        'native_webview_started',
        expect.objectContaining({
          native_diagnostics_available: true,
          native_termination_reporting_available: false,
          native_web_content_terminations: undefined,
          native_last_termination_ms: undefined,
        })
      );
    }
  );

  it('correlates replacement documents with their native launch and termination history', () => {
    const meta = document.createElement('meta');
    meta.name = 'macro-bundle-build';
    meta.content = '42';
    document.head.append(meta);
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([]);
    recordNativeWebviewStart({
      identity: {
        instanceId: 'native-launch',
        nativeVersion: '2.0',
        recordingId: null,
        tracesUrl: null,
        os: 'ios',
        hostPid: 123,
      },
      samples: [],
      droppedSamples: 0,
      webContent: { terminations: 2, lastTerminationMs: 1234 },
      bundleReloads: { dispatches: 1, lastSource: 'run_event_resumed' },
    });
    const expected = expect.objectContaining({
      native_instance_id: 'native-launch',
      native_web_content_terminations: 2,
      native_last_termination_ms: 1234,
      native_termination_reporting_available: true,
      loaded_bundle_build: '42',
      native_bundle_reload_dispatches: 1,
      native_bundle_reload_last_source: 'run_event_resumed',
    });
    expect(telemetry.register).toHaveBeenCalledWith(expected);
    expect(telemetry.track).toHaveBeenCalledWith(
      'native_webview_started',
      expected
    );
    expect(telemetry.span.end).toHaveBeenCalledOnce();
  });

  it('reports missing native support as unknown, rather than zero terminations', () => {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([]);
    recordNativeWebviewStart(undefined);
    expect(telemetry.track).toHaveBeenCalledWith(
      'native_webview_started',
      expect.objectContaining({
        native_diagnostics_available: false,
        native_termination_reporting_available: false,
        native_web_content_terminations: undefined,
      })
    );
  });
});
