import { createRoot, createSignal } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';
import {
  createOrderedGroupPagination,
  type OrderedGroupSource,
} from './ordered-group-pagination';

function setup() {
  const [identity, setIdentity] = createSignal('first');
  const [collapsed, setCollapsed] = createSignal(new Set<string>());
  const makeGroup = (key: string) => {
    const [hasMore, setMore] = createSignal(true);
    const load = vi.fn(async () => {
      setMore(false);
    });
    return {
      key,
      hasMore,
      setMore,
      load,
      isLoading: () => false,
      error: () => null,
    };
  };
  const groups = [makeGroup('a'), makeGroup('b'), makeGroup('c')];
  const [sources, setSources] =
    createSignal<readonly OrderedGroupSource[]>(groups);
  const pagination = createOrderedGroupPagination({
    identity,
    groups: sources,
    isExpanded: (key) => !collapsed().has(key),
  });
  const toggle = (key: string) => {
    pagination.retain();
    setCollapsed((old) => {
      const next = new Set(old);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  return {
    pagination,
    groups,
    setIdentity,
    toggle,
    setSources,
    keys: () => pagination.visible().map((group) => group.key),
  };
}

describe('ordered group pagination', () => {
  it('reveals expanded groups in sequence and does not fetch eagerly', async () => {
    await createRoot(async (dispose) => {
      const state = setup();
      expect(state.keys()).toEqual(['a']);
      expect(state.groups[0].load).not.toHaveBeenCalled();
      await state.pagination.load('b');
      expect(state.groups[1].load).not.toHaveBeenCalled();
      await state.pagination.load('a');
      expect(state.keys()).toEqual(['a', 'b']);
      await state.pagination.load('b');
      expect(state.keys()).toEqual(['a', 'b', 'c']);
      dispose();
    });
  });
  it('skips collapsed groups and keeps later groups on re-expansion', () => {
    createRoot((dispose) => {
      const state = setup();
      state.toggle('a');
      expect(state.keys()).toEqual(['a', 'b']);
      state.toggle('b');
      expect(state.keys()).toEqual(['a', 'b', 'c']);
      state.toggle('a');
      expect(state.keys()).toEqual(['a', 'b', 'c']);
      expect(
        state.groups.every((group) => group.load.mock.calls.length === 0)
      ).toBe(true);
      dispose();
    });
  });
  it('stops after failures until explicit retry', async () => {
    await createRoot(async (dispose) => {
      const state = setup();
      state.groups[0].load.mockRejectedValueOnce(new Error('offline'));
      await state.pagination.load('a');
      expect(state.pagination.error('a')?.message).toBe('offline');
      await state.pagination.load('a');
      expect(state.groups[0].load).toHaveBeenCalledTimes(1);
      await state.pagination.load('a', true);
      expect(state.keys()).toEqual(['a', 'b']);
      expect(state.pagination.error('a')).toBeNull();
      dispose();
    });
  });
  it('allows retry after a source throws synchronously', async () => {
    await createRoot(async (dispose) => {
      const state = setup();
      state.groups[0].load.mockImplementationOnce(() => {
        throw new Error('failed before dispatch');
      });
      await state.pagination.load('a');
      expect(state.pagination.error('a')?.message).toBe(
        'failed before dispatch'
      );
      await state.pagination.load('a', true);
      expect(state.groups[0].load).toHaveBeenCalledTimes(2);
      expect(state.keys()).toEqual(['a', 'b']);
      dispose();
    });
  });
  it('keeps boundary demand pending until a background refresh settles', async () => {
    await createRoot(async (dispose) => {
      const state = setup();
      const [refreshing, setRefreshing] = createSignal(true);
      state.groups[0].isLoading = refreshing;
      let settled = false;
      const request = state.pagination.load('a').then(() => {
        settled = true;
      });
      const repeated = state.pagination.load('a');

      // A navigation caller must yield to I/O rather than repeatedly await a
      // resolved load while the boundary and background request remain active.
      await Promise.resolve();
      expect(settled).toBe(false);
      expect(state.groups[0].load).not.toHaveBeenCalled();

      setRefreshing(false);
      await Promise.all([request, repeated]);
      expect(state.groups[0].load).toHaveBeenCalledTimes(1);
      expect(state.keys()).toEqual(['a', 'b']);
      dispose();
    });
  });
  it.each(['view change', 'refresh', 'collapse', 'dispose'] as const)(
    'cancels waiting boundary demand on %s',
    async (reason) => {
      await createRoot(async (dispose) => {
        const state = setup();
        state.groups[0].isLoading = () => true;
        const request = state.pagination.load('a');

        if (reason === 'view change') state.setIdentity('second');
        else if (reason === 'refresh') state.pagination.reset();
        else if (reason === 'collapse') state.toggle('a');
        else dispose();

        await request;
        expect(state.groups[0].load).not.toHaveBeenCalled();
        expect(state.pagination.error('a')).toBeNull();
        dispose();
      });
    }
  );
  it('discards an old request failure after explicit refresh of the same view', async () => {
    await createRoot(async (dispose) => {
      const state = setup();
      let fail!: (error: Error) => void;
      state.groups[0].load.mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            fail = reject;
          })
      );
      const old = state.pagination.load('a');
      state.pagination.reset();
      await state.pagination.load('a');
      fail(new Error('obsolete'));
      await old;
      expect(state.pagination.error('a')).toBeNull();
      expect(state.keys()).toEqual(['a', 'b']);
      dispose();
    });
  });
  it('coalesces requests and discards errors from a previous view', async () => {
    await createRoot(async (dispose) => {
      const state = setup();
      let fail!: (error: Error) => void;
      state.groups[0].load.mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            fail = reject;
          })
      );
      const first = state.pagination.load('a');
      const second = state.pagination.load('a');
      expect(state.groups[0].load).toHaveBeenCalledTimes(1);
      state.setIdentity('second');
      fail(new Error('stale'));
      await Promise.all([first, second]);
      expect(state.pagination.error('a')).toBeNull();
      dispose();
    });
  });
});
