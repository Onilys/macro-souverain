import { analytics } from '@app/lib/analytics';
import { Telemetry } from '@macro-inc/observability';
import type { DesktopSnapshot } from './desktop';

/** Called once per document, including recovery after a WebContent termination. */
export function recordNativeWebviewStart(
  snapshot: DesktopSnapshot | undefined
) {
  const bundleBuild = document
    .querySelector('meta[name="macro-bundle-build"]')
    ?.getAttribute('content');
  const navigation = performance.getEntriesByType('navigation')[0];
  // Native snapshots include this field on every platform, but only Apple's
  // WebKit termination callback records it. Other platforms remain unknown.
  const webContent =
    snapshot?.identity.os === 'ios' || snapshot?.identity.os === 'macos'
      ? snapshot.webContent
      : undefined;
  const attributes = {
    native_instance_id: snapshot?.identity.instanceId,
    native_version: snapshot?.identity.nativeVersion,
    native_diagnostics_available: snapshot !== undefined,
    native_termination_reporting_available: webContent !== undefined,
    native_web_content_terminations: webContent?.terminations,
    native_last_termination_ms: webContent?.lastTerminationMs ?? undefined,
    native_bundle_reload_dispatches: snapshot?.bundleReloads?.dispatches,
    native_bundle_reload_last_source:
      snapshot?.bundleReloads?.lastSource ?? undefined,
    loaded_bundle_build: bundleBuild ?? undefined,
    web_version: import.meta.env.__APP_VERSION__,
    navigation_type:
      navigation && 'type' in navigation && typeof navigation.type === 'string'
        ? navigation.type
        : 'unknown',
  };
  // Include the native launch and termination count on subsequent exceptions.
  // These are runtime identifiers, not account data.
  analytics.posthog.register(attributes);
  analytics.track('native_webview_started', attributes);
  const span = Telemetry.span('native.webview.start');
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== undefined) span.setAttr(key, value);
  }
  span.end();
}
