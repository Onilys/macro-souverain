import type { PipedreamConnectOutcome } from '@queries/pipedream-connectors';
import { createSignal, onCleanup } from 'solid-js';

/**
 * Resume only the agent turn that initiated a successful connection, and say
 * how each attempt is going for the button that started it.
 */
export function createConnectorContinuation(deps: {
  disabled: () => boolean;
  revision: () => string;
  connect: (app: {
    appSlug: string;
    serverName: string;
  }) => Promise<PipedreamConnectOutcome>;
  resume: (name: string) => Promise<void>;
  notify: (message: string) => void;
}) {
  const [pending, setPending] = createSignal(false);
  // What the button that started a connection shows: the app whose sign-in
  // is open, the app whose last attempt failed, and the apps whose agent
  // carried on once they were connected.
  const [connecting, setConnecting] = createSignal<string>();
  const [failed, setFailed] = createSignal<string>();
  const [resumed, setResumed] = createSignal<ReadonlySet<string>>(new Set());
  let disposed = false;
  onCleanup(() => {
    disposed = true;
  });
  const disabled = () => pending() || deps.disabled();

  async function connect(app: { appSlug: string; name: string }) {
    if (disposed || disabled()) return;
    const revision = deps.revision();
    setPending(true);
    setConnecting(app.appSlug);
    setFailed(undefined);
    try {
      const outcome = await deps.connect({
        appSlug: app.appSlug,
        serverName: app.name,
      });
      if (disposed) return;
      if (outcome === 'unsupported') {
        deps.notify('Connectors are not available on this deployment');
        setFailed(app.appSlug);
        return;
      }
      if (outcome !== 'connected') return;
      if (deps.disabled() || revision !== deps.revision()) {
        deps.notify(
          `${app.name} connected. Send a message when you are ready to continue.`
        );
        return;
      }
      await deps.resume(app.name);
      setResumed((apps) => new Set(apps).add(app.appSlug));
    } catch {
      if (!disposed) {
        deps.notify(
          `Could not connect ${app.name} and continue. Please try again.`
        );
        setFailed(app.appSlug);
      }
    } finally {
      setPending(false);
      setConnecting(undefined);
    }
  }
  return { connect, disabled, connecting, failed, resumed };
}
