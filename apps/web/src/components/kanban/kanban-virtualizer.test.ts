import type { Range } from '@tanstack/solid-virtual';
import { createComputed, createRoot } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { createKanbanVirtualizer } from './kanban-virtualizer';

type DragSource = { kind: 'card' | 'lane'; laneId: string; itemId: string };
const drag = vi.hoisted(() => ({
  source: undefined as DragSource | undefined,
}));
type VirtualizerOptions = {
  rangeExtractor(range: Range): number[];
  observeElementRect(
    instance: unknown,
    callback: (rect: { width: number; height: number }) => void
  ): unknown;
  observeElementOffset(
    instance: unknown,
    callback: (offset: number, scrolling: boolean) => void
  ): unknown;
};
const captured = vi.hoisted(() => ({
  options: undefined as VirtualizerOptions | undefined,
  rect: undefined as
    | ((rect: { width: number; height: number }) => void)
    | undefined,
  offset: undefined as
    | ((offset: number, scrolling: boolean) => void)
    | undefined,
}));

vi.mock('@thisbeyond/solid-dnd', () => ({
  useDragDropContext: () => [
    {
      active: {
        get draggable() {
          return drag.source ? { data: drag.source } : undefined;
        },
      },
    },
    { detectCollisions: vi.fn() },
  ],
}));
vi.mock('@tanstack/solid-virtual', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/solid-virtual')>()),
  observeElementRect: (_instance: unknown, callback: typeof captured.rect) => {
    captured.rect = callback;
  },
  observeElementOffset: (
    _instance: unknown,
    callback: typeof captured.offset
  ) => {
    captured.offset = callback;
  },
  createVirtualizer: (options: VirtualizerOptions) => {
    options.observeElementRect({}, () => undefined);
    options.observeElementOffset({}, () => undefined);
    captured.options = options;
    return { getVirtualItems: () => [] };
  },
}));

afterEach(() => {
  drag.source = undefined;
  captured.options = undefined;
});

function range(direction: 'horizontal' | 'vertical', laneId = 'lane-0') {
  return createRoot((dispose) => {
    const options = {
      keys: () =>
        Array.from(
          { length: 10 },
          (_, index) =>
            `${direction === 'horizontal' ? 'lane' : 'card'}-${index}`
        ),
      getScrollElement: () => undefined,
      estimateSize: 100,
      gap: 12,
      overscan: 1,
    };
    createKanbanVirtualizer(
      direction === 'horizontal'
        ? { ...options, direction }
        : { ...options, direction, laneId: () => laneId }
    );
    const indices = captured.options!.rangeExtractor({
      startIndex: 3,
      endIndex: 5,
      overscan: 1,
      count: 10,
    });
    dispose();
    return indices;
  });
}

it('keeps a dragged lane mounted when horizontal scrolling moves the lane offscreen', () => {
  drag.source = { kind: 'lane', laneId: 'lane-0', itemId: 'lane-0' };
  expect(range('horizontal')).toEqual([0, 2, 3, 4, 5, 6]);
});

it('keeps a card source lane mounted when horizontal scrolling moves the lane offscreen', () => {
  drag.source = { kind: 'card', laneId: 'lane-0', itemId: 'card-0' };
  expect(range('horizontal')).toEqual([0, 2, 3, 4, 5, 6]);
});

it('pins a dragged card only within its own vertical lane', () => {
  drag.source = { kind: 'card', laneId: 'lane-0', itemId: 'card-0' };
  expect(range('vertical')).toEqual([0, 2, 3, 4, 5, 6]);
  expect(range('vertical', 'lane-1')).toEqual([2, 3, 4, 5, 6]);
});

it('does not pin a card for a lane drag or duplicate an already visible source lane', () => {
  drag.source = { kind: 'lane', laneId: 'lane-3', itemId: 'lane-3' };
  expect(range('horizontal')).toEqual([2, 3, 4, 5, 6]);
  expect(range('vertical')).toEqual([2, 3, 4, 5, 6]);
});

it('reports scroll and resize changes even when the mounted virtual range stays unchanged', () => {
  createRoot((dispose) => {
    const result = createKanbanVirtualizer({
      direction: 'horizontal',
      keys: () => [],
      getScrollElement: () => undefined,
      estimateSize: 100,
      gap: 12,
      overscan: 1,
    });
    const changed = vi.fn();
    createComputed(() => changed(result.viewport()));
    captured.rect!({ width: 100, height: 300 });
    captured.offset!(100, true);
    captured.rect!({ width: 200, height: 300 });
    expect(changed.mock.calls).toEqual([
      [{ offset: 0, size: 0 }],
      [{ offset: 0, size: 100 }],
      [{ offset: 100, size: 100 }],
      [{ offset: 100, size: 200 }],
    ]);
    dispose();
  });
});
