import { soupListContainerAttribute } from '@core/dom-selectors';
import { createElementSize } from '@solid-primitives/resize-observer';
import {
  type Accessor,
  createMemo,
  createSignal,
  type JSX,
  Show,
} from 'solid-js';
import { Virtualizer, type VirtualizerHandle } from 'virtua/solid';
import type { CacheSnapshot } from 'virtua/unstable_core';
import type { SoupRow } from '../create-soup-state';
import { createGroupPaginationViewport } from '../primitives/group-pagination-viewport';

const DEFAULT_OVERSCAN = 5;
const DEFAULT_ITEM_SIZE_ESTIMATE = 40;

interface SoupListProps {
  ref?: (el: HTMLDivElement) => void;
  /** Receives the inner scroll container (the element that owns scrollTop). */
  scrollerRef?: (el: HTMLDivElement) => void;
  virtualizerRef?: (handle: VirtualizerHandle) => void;
  touch?: boolean;
  class?: string;
  virtualizerClass?: string;
  itemSize?: number;
  overscan?: number;
  children: (row: SoupRow, index: Accessor<number>) => JSX.Element;
  onScrollOffsetChange?: (offset: number) => void;
  onScrollBottom?: VoidFunction;
  onGroupBoundary?: (key: string) => void;
  paginationIdentity?: string;
  groupIsLoading?: (key: string) => boolean;
  groupError?: (key: string) => Error | null;
  scrollBottomOffset?: number;
  rows: SoupRow[];
  cache?: CacheSnapshot;
}

export const SoupList = (props: SoupListProps) => {
  const [virtualizerHandle, setVirtualizerHandle] =
    createSignal<VirtualizerHandle>();

  const overscan = createMemo(() => props.overscan ?? DEFAULT_OVERSCAN);

  const [topSpacerRef, setTopSpacerRef] = createSignal<HTMLDivElement>();
  const topSpacerSize = createElementSize(topSpacerRef);

  // Full-frame touch devices: rows under-scroll the status bar; this in-scroll
  // spacer is their resting inset (safe-top — list views have no header).
  // Keyed on touch, not width: an iPad is a full-frame native app but is wider
  // than the mobile breakpoint, so a width check would leave it at 0.
  const topInset = () => (props.touch ? (topSpacerSize.height ?? 0) : 0);

  const [scroller, setScroller] = createSignal<HTMLDivElement>();
  const groupViewport = createGroupPaginationViewport({
    enabled: () => !!props.onGroupBoundary,
    identity: () => props.paginationIdentity,
    rows: () => props.rows,
    handle: virtualizerHandle,
    viewport: scroller,
    key: (row) => row.identityKey,
    group: (row) => row.group?.key,
    header: (row) => row.kind === 'group-header',
    boundary: (row) =>
      row.kind === 'group-status' && row.group?.isExpanded()
        ? row.group.key
        : undefined,
    loading: (key) => props.groupIsLoading?.(key) ?? false,
    error: (key) => props.groupError?.(key) ?? null,
    load: (key) => props.onGroupBoundary?.(key),
  });
  const handleScroll = (offset: number) => {
    props.onScrollOffsetChange?.(offset);
    if (props.onGroupBoundary) {
      groupViewport.onScroll();
      return;
    }
    const handle = virtualizerHandle();
    if (!handle) return;
    const threshold = Math.max(
      props.scrollBottomOffset ?? 100,
      handle.viewportSize
    );
    if (handle.scrollSize - handle.viewportSize - offset <= threshold)
      props.onScrollBottom?.();
  };

  const registerVirtualizerHandler = (
    handle: VirtualizerHandle | undefined
  ) => {
    setVirtualizerHandle(handle);

    if (handle) props.virtualizerRef?.(handle);
  };

  return (
    <div
      ref={props.ref}
      // `soup-list` scopes the --soup-inbox-* metrics (ListEntity.css) for
      // everything in the list; the row geometry itself travels with the rows
      // and the group headers, which each carry their own family class.
      class={`soup-list unified-table-body w-full flex-1 min-h-0 relative ${props.class ?? ''}`}
    >
      {/* Hand-rolled VList (scroller + Virtualizer) so the full-frame mobile
          insets can live inside the scroller: rows rest clear of the chrome
          but still slide beneath it. `startMargin` keeps virtua's scroll
          math correct for the leading spacer. */}
      <div
        ref={(el) => {
          setScroller(el);
          props.scrollerRef?.(el);
        }}
        class={`overscroll-none ${props.virtualizerClass ?? ''}`}
        style={{
          display: 'block',
          'overflow-y': 'auto',
          'overflow-anchor': props.onGroupBoundary ? 'none' : undefined,
          contain: 'strict',
          width: '100%',
          height: '100%',
        }}
        {...soupListContainerAttribute}
      >
        <div
          ref={setTopSpacerRef}
          aria-hidden
          class="h-0 block touch:h-(--mobile-content-inset-top)"
        />
        <Virtualizer
          cache={props.cache}
          ref={registerVirtualizerHandler}
          startMargin={topInset()}
          data={props.rows}
          // Leave itemSize unset for heterogeneous lists so Virtua measures
          // larger rows; 40px is only the default overscan estimate.
          itemSize={props.itemSize}
          bufferSize={
            overscan() * (props.itemSize ?? DEFAULT_ITEM_SIZE_ESTIMATE)
          }
          onScroll={(offset) => handleScroll(offset)}
        >
          {(row, i) => props.children(row, i)}
        </Virtualizer>
        <Show when={props.touch}>
          <div aria-hidden class="h-(--mobile-content-inset-bottom)" />
        </Show>
      </div>
    </div>
  );
};
