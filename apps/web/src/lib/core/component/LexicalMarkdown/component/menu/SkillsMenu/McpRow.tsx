import { PipedreamConnectorIcon } from '@core/pipedream/ConnectorIcon';
import type { SlashMenuMcp } from '@queries/slash-menu-mcps';
import { cn } from '@ui';
import { createEffect } from 'solid-js';

export function McpRow(props: {
  item: SlashMenuMcp;
  selected: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  let ref: HTMLDivElement | undefined;
  createEffect(() => {
    if (props.selected) ref?.scrollIntoView({ block: 'nearest' });
  });
  return (
    <div
      ref={ref}
      class={cn('flex items-center gap-2 p-1.5 mx-1.5 rounded-md', {
        'bg-ink/5': props.selected,
      })}
      onPointerDown={(event) => event.preventDefault()}
      onMouseDown={(event) => event.preventDefault()}
      onMouseMove={props.onHover}
      onClick={(event) => {
        event.stopPropagation();
        props.onSelect();
      }}
    >
      <PipedreamConnectorIcon
        appSlug={props.item.appSlug ?? ''}
        class="size-4 shrink-0 text-ink-muted"
      />
      <div class="truncate text-sm text-ink" title={props.item.name}>
        {props.item.name}
      </div>
    </div>
  );
}
