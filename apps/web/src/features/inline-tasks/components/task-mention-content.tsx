import { type JSX, Show } from 'solid-js';

/** Checklist spacing belongs to the inline experience, not the standard shell. */
export function TaskMentionContent(props: {
  icon: JSX.Element;
  text: JSX.Element;
  collapsed?: boolean;
}) {
  return (
    <span class="pointer-events-auto">
      <span class="relative top-[0.125em] inline-flex ml-[0.25em] size-[1.125em] mr-[0.5em]">
        {props.icon}
      </span>
      <Show when={!props.collapsed}>
        <span>{props.text}</span>
      </Show>
    </span>
  );
}
