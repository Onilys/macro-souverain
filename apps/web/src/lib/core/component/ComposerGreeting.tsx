import MacroIcon from '@icon/macro-logo.svg';
import type { JSX } from 'solid-js';
import { Dynamic } from 'solid-js/web';

/** The shared brand treatment for empty conversation greetings. */
export function ComposerGreeting(props: {
  as?: 'h1' | 'h2';
  children: JSX.Element;
}) {
  return (
    <Dynamic
      component={props.as ?? 'h2'}
      class="m-0 flex items-center justify-center gap-3 font-[Roboto_Slab_Variable] text-[28px] font-[315] leading-[1.2] tracking-[-0.025em] text-ink"
    >
      <MacroIcon class="size-9 shrink-0" aria-hidden="true" />
      <span class="min-w-0 text-balance">{props.children}</span>
    </Dynamic>
  );
}
