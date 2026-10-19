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
  let container: HTMLDivElement | undefined;
  // Property objects also change on manual edits; animate only a new AI version.
  const predictionVersion = createMemo(() => props.version);
  createEffect(
    on(predictionVersion, (version) => {
      if (
        !version ||
        !container ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      )
        return;
      const pill = container.querySelector<HTMLElement>(
        '[data-slot="property-pill"]'
      );
      if (!pill) return;
      const backgroundColor = getComputedStyle(pill).backgroundColor;
      const accent = `color-mix(in srgb, var(--color-accent) 20%, ${backgroundColor})`;
      const animation = pill.animate(
        [
          { backgroundColor },
          { backgroundColor: accent, offset: 0.15 },
          { backgroundColor: accent, offset: 0.35 },
          { backgroundColor },
        ],
        { duration: 1200, easing: 'ease-out' }
      );
      onCleanup(() => animation.cancel());
    })
  );
  return (
    <div ref={container} class="flex min-w-0">
      {props.children}
    </div>
  );
}
