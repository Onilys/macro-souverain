import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DesktopSnapshot } from './desktop';
import { frontendInstanceId } from './frontend-instance';
import {
  recordNativeWebviewStart,
  reportRecoveredEvents,
} from './native-lifecycle';

const telemetry = vi.hoisted(() => ({
  track: vi.fn(),
  register: vi.fn(),
  recordSample: vi.fn(),
  span: { setAttr: vi.fn(), end: vi.fn() },
}));
vi.mock('@app/lib/analytics', () => ({
  analytics: {
    track: telemetry.track,
    posthog: { register: telemetry.register },
  },
}));
vi.mock('@macro-inc/observability', () => ({
  Telemetry: {
    span: () => telemetry.span,
    recordSample: telemetry.recordSample,
  },
}));

afterEach(() => {
  document.head.querySelector('meta[name="macro-bundle-build"]')?.remove();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  sessionStorage.clear();
});

it('replays a previous document with original identity/time and no duplicate context entries', () => {
  const channel = {
    sequence: 1,
    timestampMs: 100,
    frontendInstanceId: 'previous',
    event: { kind: 'channel' as const, channel_id: 'channel', open: true },
  };
  const snapshot: DesktopSnapshot = {
    identity: {
      instanceId: 'host',
      nativeVersion: '2.5',
      os: 'ios',
      hostPid: 1,
      recordingId: null,
      tracesUrl: null,
    },
    samples: [],
    droppedSamples: 0,
    recentEvents: {
      currentFrontendInstanceId: 'previous',
      events: [
        channel,
        {
          sequence: 3,
          timestampMs: 300,
          frontendInstanceId: 'previous',
          event: { kind: 'web_content_terminated' },
        },
      ],
      activeContext: [channel],
      heartbeat: {
        sequence: 2,
        timestampMs: 200,
        frontendInstanceId: 'previous',
        event: {
          kind: 'heartbeat',
          visible: true,
          online: false,
          last_scroll_age_ms: 10,
          last_interaction_age_ms: null,
        },
      },
      dropped: 0,
      memoryWarningReporting: true,
    },
  };
  reportRecoveredEvents(snapshot, 'previous');
  reportRecoveredEvents(snapshot, 'previous');
  expect(telemetry.recordSample).toHaveBeenCalledTimes(3);
  expect(telemetry.recordSample).toHaveBeenNthCalledWith(
    2,
    'native.diagnostic.recovered',
    expect.objectContaining({
      source_frontend_instance_id: 'previous',
      recovered_by_frontend_instance_id: frontendInstanceId,
      native_event_id: 'host:2',
      visible: true,
      online: false,
      last_scroll_age_ms: 10,
    }),
    200
  );
  expect(telemetry.track).toHaveBeenCalledTimes(3);
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
