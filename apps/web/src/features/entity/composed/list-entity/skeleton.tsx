import { ListSkeleton } from '@app/components/view-shell/ListSkeleton';
import { isMobile } from '@core/mobile/isMobile';
import { cn } from '@ui';
import { For, Match, Show, Switch } from 'solid-js';
import { SOUP_ROW_CLASS } from './row-geometry';
import { useListLayout } from './shared';

interface SkeletonRow {
  title: string;
  /** Stands in for a search result's "Show more [n]" content-hit toggle. */
  contentHits?: boolean;
}

const ROWS: SkeletonRow[] = [
  { title: 'w-52', contentHits: true },
  { title: 'w-36' },
  { title: 'w-64', contentHits: true },
  { title: 'w-44' },
  { title: 'w-28' },
  { title: 'w-56', contentHits: true },
  { title: 'w-40' },
  { title: 'w-48' },
];

function Icon() {
  return <ListSkeleton.Bar class="size-4 shrink-0 rounded" />;
}

function Title(props: { width: string }) {
  return <ListSkeleton.Bar class={cn('min-w-0', props.width)} />;
}

function Timestamp() {
  return <ListSkeleton.Bar class="h-2 w-[4em]" />;
}

/** `WideLayout`'s grid with an empty meta column. */
function WideRow(props: { title: string }) {
  return (
    <div
      class={cn(
        SOUP_ROW_CLASS.wide,
        'w-full min-h-[inherit] items-center text-sm pl-(--soup-row-padding-l) pr-2',
        'gap-x-(--soup-row-column-gap) grid grid-rows-[1fr] grid-cols-[var(--soup-row-indicator-width)_1fr_auto_8ch]'
      )}
    >
      <div />
      <div class="flex min-w-0 items-center gap-2">
        <Icon />
        <Title width={props.title} />
      </div>
      <div />
      <div class="flex items-center justify-end text-xs">
        <Timestamp />
      </div>
    </div>
  );
}

/** `NarrowLayout` and `NarrowSingleLineLayout`'s 44px grid, or the condensed 36px one. */
function NarrowRow(props: { title: string; condensed: boolean }) {
  return (
    <div
      class={cn(
        SOUP_ROW_CLASS.narrow,
        'w-full gap-x-(--soup-row-column-gap) items-center text-sm pr-2 pl-(--soup-row-padding-l) grid',
        props.condensed
          ? 'grid-cols-[var(--soup-row-indicator-width)_1fr_auto] grid-rows-[36px]'
          : 'grid-cols-[var(--soup-row-indicator-width)_1fr_max-content] grid-rows-[44px]'
      )}
    >
      <div />
      <div class="flex min-w-0 items-center gap-2">
        <Icon />
        <Title width={props.title} />
      </div>
      <Show when={!props.condensed} fallback={<div />}>
        <div class="flex items-center justify-end text-xs">
          <Timestamp />
        </div>
      </Show>
    </div>
  );
}

/** The content-hit block under a search result, sized by a text strut. */
function ContentHits() {
  return (
    <div class="flex gap-2 size-full items-center text-sm px-2 pb-1 -mt-2 min-w-0">
      <div class="min-w-0 flex-1 overflow-hidden ml-4 @lg/entity:ml-6">
        <div class="flex w-full items-center gap-1 px-3 py-1.5 text-[0.6875rem]">
          <ListSkeleton.Bar class="size-2.5 shrink-0" />
          <ListSkeleton.Bar class="h-1.5 w-[5.5em]" />
          <span>&#8203;</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Placeholder `ListEntity` rows: the same root, grid, and container queries as
 * the real rows, picked by the surrounding `ListLayoutProvider`.
 */
export function ListEntitySkeleton(props: {
  label: string;
  count?: number;
  class?: string;
}) {
  const listLayout = useListLayout();
  const isWide = () => listLayout?.isWide() ?? true;
  const condensed = () =>
    !isWide() && listLayout?.narrowLayout() === 'condensed';

  return (
    <ListSkeleton.Root
      label={props.label}
      class={cn('soup-list min-w-0 shrink-0', props.class)}
    >
      <For each={ROWS.slice(0, props.count ?? ROWS.length)}>
        {(row) => (
          <div
            class={cn(
              isWide() ? SOUP_ROW_CLASS.wide : SOUP_ROW_CLASS.narrow,
              'soup-list-entity rounded-xl @container/entity w-[calc(100%-0.5rem)] mr-1 relative flex flex-col py-0.5',
              {
                'min-h-10 mx-(--soup-row-gutter)': !isMobile() && !condensed(),
                'min-h-9 mx-(--soup-row-gutter)': !isMobile() && condensed(),
              }
            )}
          >
            <Switch>
              <Match when={isWide()}>
                <WideRow title={row.title} />
              </Match>
              <Match when={true}>
                <NarrowRow title={row.title} condensed={condensed()} />
              </Match>
            </Switch>
            <Show when={row.contentHits && !condensed()}>
              <ContentHits />
            </Show>
          </div>
        )}
      </For>
    </ListSkeleton.Root>
  );
}
