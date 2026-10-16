import {
  type Accessor,
  createEffect,
  createSignal,
  on,
  onCleanup,
} from 'solid-js';
import type { Snapshot, Target } from '../core/types';
import { StateMachinePlayer } from '../runtime/player.js';

export function createPlayer(options: {
  canvas: () => HTMLCanvasElement;
  url: Accessor<string>;
  target: Accessor<Target>;
  onChange?: (snapshot: Snapshot) => void;
  onReady?: (player: StateMachinePlayer) => void;
  onError?: (message: string) => void;
}) {
  const [ready, setReady] = createSignal(false);
  const [error, setError] = createSignal<string>();
  let player: StateMachinePlayer | undefined;
  createEffect(
    on(options.url, (url) => {
      setReady(false);
      setError(undefined);
      let disposed = false;
      let current: StateMachinePlayer;
      try {
        current = new StateMachinePlayer(options.canvas(), {
          onChange: options.onChange,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Mascot unavailable';
        setError(message);
        options.onError?.(message);
        return;
      }
      player = current;
      async function load() {
        try {
          await current.load(url, { initial: options.target() });
          if (disposed) return;
          current.request(options.target());
          setReady(true);
          options.onReady?.(current);
        } catch (error) {
          if (!disposed) {
            const message =
              error instanceof Error ? error.message : 'Mascot unavailable';
            setError(message);
            options.onError?.(message);
          }
        }
      }
      void load();
      onCleanup(() => {
        disposed = true;
        current.destroy();
        if (player === current) player = undefined;
      });
    })
  );
  createEffect(on(options.target, (target) => player?.request(target)));
  return { ready, error };
}
