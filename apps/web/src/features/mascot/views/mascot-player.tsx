import { PlayerCanvas } from '../components/player-canvas';
import type { Snapshot, Target } from '../core/types';
import { createPlayer } from '../primitives/create-player';
import type { StateMachinePlayer } from '../runtime/player.js';

export const publishedMascot = `${import.meta.env.BASE_URL}mascots/current/manifest.json`;
export function MascotPlayer(props: {
  target: Target;
  size?: number;
  manifestUrl?: string;
  onChange?: (snapshot: Snapshot) => void;
  onReady?: (player: StateMachinePlayer) => void;
  onError?: (message: string) => void;
}) {
  let canvas!: HTMLCanvasElement;
  const player = createPlayer({
    canvas: () => canvas,
    url: () => props.manifestUrl ?? publishedMascot,
    target: () => props.target,
    onChange: props.onChange,
    onReady: props.onReady,
    onError: props.onError,
  });
  return (
    <PlayerCanvas
      canvas={(element) => {
        canvas = element;
      }}
      size={props.size ?? 48}
      ready={player.ready()}
      error={player.error()}
    />
  );
}
