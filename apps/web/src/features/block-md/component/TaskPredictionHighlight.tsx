import {
  createEffect,
  createMemo,
  on,
  onCleanup,
  type ParentProps,
} from 'solid-js';

/** Keep the property control mounted and focused while its value changes. */
export function TaskPredictionHighlight(
  props: ParentProps<{ version: number }>
) {
  let highlight: HTMLSpanElement | undefined;
  // Property objects also change on manual edits; animate only a new AI version.
  const predictionVersion = createMemo(() => props.version);
  createEffect(
    on(predictionVersion, (version) => {
      if (
        !version ||
        !highlight ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      )
        return;
      const animation = highlight.animate(
        [
          { opacity: 0 },
          { opacity: 1, offset: 0.15 },
          { opacity: 1, offset: 0.35 },
          { opacity: 0 },
        ],
        { duration: 1200, easing: 'ease-out' }
      );
      onCleanup(() => animation.cancel());
    })
  );
  return (
    <div class="relative flex min-w-0">
      {props.children}
      <span
        ref={highlight}
        aria-hidden="true"
        class="pointer-events-none absolute inset-0 rounded-md bg-accent/10 opacity-0 ring-1 ring-accent/30"
      />
    </div>
  );
}
