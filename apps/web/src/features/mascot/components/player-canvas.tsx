import MacroLogo from '@icon/macro-logo.svg';
import { Show } from 'solid-js';

export function PlayerCanvas(props: {
  canvas: (element: HTMLCanvasElement) => void;
  size: number;
  error?: string;
  ready: boolean;
}) {
  return (
    <span
      class="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: `${props.size}px`, height: `${props.size}px` }}
      aria-hidden="true"
    >
      <canvas
        ref={props.canvas}
        class="h-full w-full"
        classList={{ invisible: !props.ready || !!props.error }}
      />
      <Show when={!props.ready || props.error}>
        <MacroLogo class="absolute size-4 text-ink-muted" />
      </Show>
    </span>
  );
}
