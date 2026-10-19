import type { createKanbanVirtualizer } from '@app/components/kanban/kanban-virtualizer';
import { afterEach, beforeEach, vi } from 'vitest';

type BoardVirtualizer = ReturnType<typeof createKanbanVirtualizer>;

// JSDOM has no layout. Render all IDs while retaining the real drag surface.
vi.mock('@app/components/kanban/kanban-virtualizer', () => ({
  createKanbanVirtualizer: (
    options: Parameters<typeof createKanbanVirtualizer>[0]
  ) =>
    ({
      virtualizer: {
        get scrollElement() {
          return options.getScrollElement() ?? null;
        },
        getVirtualItems: () =>
          options.keys().map((key, index) => ({
            key,
            index,
            start: index * 100,
            end: (index + 1) * 100,
            size: 100,
            lane: 0,
          })),
        getTotalSize: () => options.keys().length * 100,
        scrollToIndex: vi.fn(),
        measureElement: vi.fn(),
        takeSnapshot: () => [],
      },
      viewport: () => ({
        offset: options.snapshot?.offset ?? 0,
        size: options.keys().length * 100,
      }),
    }) satisfies Omit<BoardVirtualizer, 'virtualizer'> & {
      virtualizer: Pick<
        BoardVirtualizer['virtualizer'],
        | 'scrollElement'
        | 'getTotalSize'
        | 'scrollToIndex'
        | 'measureElement'
        | 'takeSnapshot'
      > & {
        getVirtualItems: () => ReturnType<
          BoardVirtualizer['virtualizer']['getVirtualItems']
        >;
      };
    },
}));

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
  );
});
afterEach(() => vi.unstubAllGlobals());

export function boardLane(label: string): HTMLElement {
  const lane = Array.from(
    document.querySelectorAll<HTMLElement>('[data-kanban-lane]')
  ).find((lane) => lane.getAttribute('aria-label') === label);
  if (!lane) throw new Error(`Missing board lane: ${label}`);
  return lane;
}
