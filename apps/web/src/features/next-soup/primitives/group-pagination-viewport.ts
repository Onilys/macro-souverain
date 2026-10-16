import { createElementSize } from '@solid-primitives/resize-observer';
import { type Accessor, createEffect, on, onCleanup } from 'solid-js';
import type { VirtualizerHandle } from 'virtua/solid';

export type GroupPaginationViewportHandle = Pick<
  VirtualizerHandle,
  | 'findItemIndex'
  | 'getItemOffset'
  | 'scrollTo'
  | 'scrollOffset'
  | 'viewportSize'
  | 'scrollSize'
>;

/** Demand and scroll anchoring for a single virtualized, ordered group stream. */
export function createGroupPaginationViewport<T>(options: {
  enabled: Accessor<boolean>;
  identity?: Accessor<string | undefined>;
  rows: Accessor<readonly T[]>;
  handle: Accessor<GroupPaginationViewportHandle | undefined>;
  viewport: Accessor<HTMLElement | undefined>;
  key: (row: T) => string;
  group: (row: T) => string | undefined;
  header: (row: T) => boolean;
  boundary: (row: T) => string | undefined;
  loading: (key: string) => boolean;
  error: (key: string) => Error | null;
  load: (key: string) => void;
}) {
  const size = createElementSize(options.viewport);
  let anchor:
    | { key: string; group?: string; index: number; inset: number }
    | undefined;
  let revision = 0;
  let restoring = false;
  let restoreOffset: number | undefined;
  let resetOnAttach = false;
  createEffect(
    on(
      () => options.identity?.(),
      (identity, previous) => {
        if (previous === undefined || identity === previous) return;
        anchor = undefined;
        restoring = false;
        restoreOffset = undefined;
        revision++;
        resetOnAttach = true;
        const handle = options.handle();
        if (handle) {
          handle.scrollTo(0);
          resetOnAttach = false;
        }
      }
    )
  );
  createEffect(
    on(options.handle, (handle) => {
      if (!handle || !resetOnAttach) return;
      handle.scrollTo(0);
      resetOnAttach = false;
    })
  );
  const capture = () => {
    const handle = options.handle();
    if (!handle) return;
    const index = handle.findItemIndex(handle.scrollOffset);
    const row = options.rows()[index];
    if (row)
      anchor = {
        key: options.key(row),
        group: options.group(row),
        index,
        inset: handle.scrollOffset - handle.getItemOffset(index),
      };
  };
  const check = () => {
    const handle = options.handle();
    if (!options.enabled() || !handle || restoring) return;
    // The element can resize before Virtua's measurement observer runs.
    const viewportSize =
      options.viewport()?.clientHeight ?? handle.viewportSize;
    const threshold = Math.max(300, viewportSize);
    for (const [index, row] of options.rows().entries()) {
      const key = options.boundary(row);
      if (key === undefined) continue;
      const offset = handle.getItemOffset(index);
      if (
        offset < handle.scrollOffset - threshold ||
        offset > handle.scrollOffset + viewportSize + threshold
      )
        continue;
      if (!options.loading(key) && !options.error(key)) options.load(key);
      break;
    }
  };
  createEffect(() => {
    const viewport = options.viewport();
    if (!viewport) return;
    const interrupt = () => {
      if (!restoring) return;
      revision++;
      restoring = false;
      restoreOffset = undefined;
      anchor = undefined;
      // Cancel Virtua's outstanding scheduled scroll before user input takes over.
      options.handle()?.scrollTo(viewport.scrollTop);
      check();
    };
    const events = [
      'wheel',
      'touchstart',
      'touchmove',
      'pointerdown',
      'keydown',
    ];
    for (const event of events)
      viewport.addEventListener(event, interrupt, { passive: true });
    onCleanup(() => {
      for (const event of events)
        viewport.removeEventListener(event, interrupt);
    });
  });
  createEffect(() => {
    size.height;
    options.enabled();
    options.handle();
    for (const row of options.rows()) {
      const key = options.boundary(row);
      if (key !== undefined) {
        options.loading(key);
        options.error(key);
      }
    }
    const timer = setTimeout(check, 0);
    onCleanup(() => clearTimeout(timer));
  });
  createEffect(
    on(options.rows, (rows, previous) => {
      const handle = options.handle();
      if (!options.enabled() || !previous || !handle || !anchor) return;
      const saved = anchor;
      const currentRevision = revision;
      restoring = true;
      restoreOffset = undefined;
      const timer = setTimeout(() => {
        if (currentRevision !== revision) return;
        let index = rows.findIndex((row) => options.key(row) === saved.key);
        if (index < 0)
          index = rows.findIndex(
            (row) => options.header(row) && options.group(row) === saved.group
          );
        if (index < 0) index = Math.min(saved.index, rows.length - 1);
        if (index < 0) {
          restoring = false;
          return;
        }
        const inset = options.key(rows[index]) === saved.key ? saved.inset : 0;
        const offset = Math.max(
          0,
          Math.min(
            handle.getItemOffset(index) + inset,
            handle.scrollSize -
              (options.viewport()?.clientHeight ?? handle.viewportSize)
          )
        );
        // scrollTo updates Virtua asynchronously. Keep the saved row until its
        // scroll event arrives; cached pages must not use the transient offset.
        anchor = { ...saved, key: options.key(rows[index]), index, inset };
        if (Math.abs(offset - handle.scrollOffset) > 1) {
          restoreOffset = offset;
          handle.scrollTo(offset);
        } else {
          restoring = false;
          check();
        }
      }, 0);
      onCleanup(() => clearTimeout(timer));
    })
  );
  return {
    onScroll: () => {
      if (restoring) {
        const handle = options.handle();
        if (
          restoreOffset === undefined ||
          !handle ||
          Math.abs(handle.scrollOffset - restoreOffset) > 1
        )
          return;
        restoring = false;
        restoreOffset = undefined;
      }
      revision++;
      capture();
      check();
    },
  };
}
