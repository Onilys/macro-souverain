import { createRoot, createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGroupPaginationViewport } from './group-pagination-viewport';

vi.mock('@solid-primitives/resize-observer', () => ({
  createElementSize: () => ({ height: 240 }),
}));

function setup(initial = ['a', 'b', 'c', 'd', 'status'], height = 240) {
  return createRoot((dispose) => {
    const [rows, setRows] = createSignal(initial);
    const [enabled, setEnabled] = createSignal(true);
    const [identity, setIdentity] = createSignal('first');
    const viewport = document.createElement('div');
    Object.defineProperty(viewport, 'clientHeight', { value: height });
    const load = vi.fn();
    const handle = {
      scrollOffset: 0,
      viewportSize: 0,
      get scrollSize() {
        return rows().length * 40;
      },
      findItemIndex: (offset: number) => Math.floor(offset / 40),
      getItemOffset: (index: number) => index * 40,
      scrollTo: vi.fn(),
    };
    const pagination = createGroupPaginationViewport({
      enabled,
      identity,
      rows,
      handle: () => handle,
      viewport: () => viewport,
      key: (row) => row,
      group: () => 'group',
      header: () => false,
      boundary: (row) => (row === 'status' ? 'group' : undefined),
      loading: () => false,
      error: () => null,
      load,
    });
    const scroll = (offset: number) => {
      handle.scrollOffset = offset;
      viewport.scrollTop = offset;
      pagination.onScroll();
    };
    return {
      dispose,
      setRows,
      setEnabled,
      setIdentity,
      rows,
      handle,
      load,
      viewport,
      scroll,
    };
  });
}

describe('group pagination viewport', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fills the actual viewport before virtualizer measurements are ready', () => {
    const state = setup([
      ...Array.from({ length: 11 }, (_, i) => `${i}`),
      'status',
    ]);
    vi.runAllTimers();
    expect(state.load).toHaveBeenCalledWith('group');
    state.dispose();
  });

  it('retains the row through consecutive insertions before scroll acknowledgment', () => {
    const state = setup(undefined, 80);
    state.handle.viewportSize = 80;
    state.scroll(120);
    state.load.mockClear();
    state.setRows((rows) => ['1', '2', '3', '4', '5', ...rows]);
    vi.runAllTimers();
    expect(state.handle.scrollTo).toHaveBeenLastCalledWith(320);
    expect(state.load).not.toHaveBeenCalled();
    state.setRows((rows) => ['6', '7', ...rows]);
    vi.runAllTimers();
    expect(state.handle.scrollTo).toHaveBeenLastCalledWith(400);
    expect(state.load).not.toHaveBeenCalled();
    state.scroll(400);
    expect(state.load).toHaveBeenCalledWith('group');
    state.dispose();
  });

  it('lets user input interrupt pending restoration and resume demand', () => {
    const state = setup(undefined, 80);
    state.handle.viewportSize = 80;
    state.scroll(120);
    state.setRows((rows) => ['1', '2', '3', '4', '5', ...rows]);
    vi.runAllTimers();
    expect(state.handle.scrollTo).toHaveBeenLastCalledWith(320);
    state.viewport.dispatchEvent(new Event('wheel'));
    expect(state.handle.scrollTo).toHaveBeenLastCalledWith(120);
    state.load.mockClear();
    state.scroll(160);
    expect(state.load).toHaveBeenCalledWith('group');
    state.dispose();
  });

  it('clears the old anchor when query identity changes while demand is disabled', () => {
    const state = setup(undefined, 80);
    state.handle.viewportSize = 80;
    state.scroll(120);
    state.setEnabled(false);
    state.setIdentity('next-filter');
    expect(state.handle.scrollTo).toHaveBeenLastCalledWith(0);
    state.handle.scrollOffset = 0;
    state.handle.scrollTo.mockClear();
    state.load.mockClear();
    state.setRows(['new-a', 'new-b', 'status']);
    vi.runAllTimers();
    expect(state.load).not.toHaveBeenCalled();
    state.setEnabled(true);
    vi.runAllTimers();
    expect(state.handle.scrollTo).not.toHaveBeenCalled();
    expect(state.load).toHaveBeenCalledWith('group');
    state.dispose();
  });
});
