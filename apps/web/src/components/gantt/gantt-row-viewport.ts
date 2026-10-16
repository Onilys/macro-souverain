import type { Accessor } from 'solid-js';
import { HEADER_HEIGHT } from './gantt-context';

export type GanttViewportRow<T> = {
  key: string | number;
  /** Drag previews occupy geometry without representing a source item. */
  item?: T;
};

/** Geometry of the shared vertical timeline, including drag preview rows. */
export function createGanttRowViewport<T>(options: {
  rows: Accessor<readonly GanttViewportRow<T>[]>;
  element: Accessor<HTMLDivElement | undefined>;
  rowHeight: Accessor<number>;
}) {
  return {
    rows: options.rows,
    element: options.element,
    handle: {
      findItemIndex: (offset: number) =>
        Math.max(
          0,
          Math.min(
            options.rows().length - 1,
            Math.floor((offset - HEADER_HEIGHT) / options.rowHeight())
          )
        ),
      getItemOffset: (index: number) =>
        HEADER_HEIGHT + index * options.rowHeight(),
      scrollTo: (offset: number) => {
        const element = options.element();
        if (element) element.scrollTop = offset;
      },
      get scrollOffset() {
        return options.element()?.scrollTop ?? 0;
      },
      get viewportSize() {
        return options.element()?.clientHeight ?? 0;
      },
      get scrollSize() {
        return options.element()?.scrollHeight ?? 0;
      },
    },
  };
}

export type GanttRowViewport<T> = ReturnType<typeof createGanttRowViewport<T>>;
