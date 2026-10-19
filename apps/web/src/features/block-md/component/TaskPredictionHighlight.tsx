import { createEffect, on, onCleanup, type ParentProps } from 'solid-js';

/** Keep the property control mounted and focused while its value changes. */
export function TaskPredictionHighlight(
  props: ParentProps<{ version: number }>
) {
  let element: HTMLDivElement | undefined;
  createEffect(
    on(
      () => props.version,
      (version) => {
        if (
          !version ||
          !element ||
          window.matchMedia('(prefers-reduced-motion: reduce)').matches
        )
          return;
        const animation = element.animate([{ opacity: 0.45 }, { opacity: 1 }], {
          duration: 650,
          easing: 'ease-out',
        });
        onCleanup(() => animation.cancel());
      }
    )
  );
  return (
    <div ref={element} class="flex min-w-0">
      {props.children}
    </div>
  );
}
