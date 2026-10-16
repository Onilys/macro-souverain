import { createRoot, createSignal } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';
import { useListDetailNavigation } from './use-list-detail-navigation';

type Row = { key: string; entity?: { id: string }; load?: () => Promise<void> };
describe('detail navigation through grouped page boundaries', () => {
  it('loads an internal boundary before a retained later group and coalesces repeated next', async () => {
    await createRoot(async (dispose) => {
      let finish!: () => void;
      const load = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          })
      );
      const a = { key: 'a:1', entity: { id: 'first' } };
      const next = { key: 'a:2', entity: { id: 'next' } };
      const b = { key: 'b:1', entity: { id: 'later' } };
      const [rows, setRows] = createSignal<Row[]>([
        a,
        { key: 'boundary', load },
        b,
      ]);
      const open = vi.fn();
      const navigation = useListDetailNavigation({
        currentId: () => 'first',
        source: {
          items: rows,
          hasMore: () => false,
          loadMore: async () => {},
          error: () => undefined,
        },
        getEntity: (row) => row.entity,
        getContinuation: (row) => row.load,
        open,
      });
      const pending = navigation.navigate(1);
      await navigation.navigate(1);
      expect(load).toHaveBeenCalledTimes(1);
      expect(open).not.toHaveBeenCalled();
      setRows([a, next, b]);
      finish();
      await pending;
      expect(open).toHaveBeenCalledWith(next.entity);
      dispose();
    });
  });
  it('cancels when the view changes during loading and reports failures without crossing', async () => {
    await createRoot(async (dispose) => {
      let finish!: () => void;
      const [identity, setIdentity] = createSignal('one');
      const onError = vi.fn();
      const open = vi.fn();
      const rows: Row[] = [
        { key: 'a', entity: { id: 'a' } },
        {
          key: 'boundary',
          load: () =>
            new Promise<void>((resolve) => {
              finish = resolve;
            }),
        },
        { key: 'b', entity: { id: 'b' } },
      ];
      const navigation = useListDetailNavigation({
        currentId: () => 'a',
        identity,
        source: {
          items: () => rows,
          hasMore: () => false,
          loadMore: async () => {},
          error: () => undefined,
        },
        getEntity: (row) => row.entity,
        getContinuation: (row) => row.load,
        open,
        onError,
      });
      const pending = navigation.navigate(1);
      setIdentity('two');
      finish();
      await pending;
      expect(open).not.toHaveBeenCalled();
      rows[1].load = async () => {
        throw new Error('offline');
      };
      await navigation.navigate(1);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(open).not.toHaveBeenCalled();
      dispose();
    });
  });
  it('cancels a pending boundary move when focus changes to another occurrence', async () => {
    await createRoot(async (dispose) => {
      let finish!: () => void;
      const [key, setKey] = createSignal('a:x');
      const rows: Row[] = [
        { key: 'a:x', entity: { id: 'same' } },
        {
          key: 'boundary',
          load: () =>
            new Promise<void>((resolve) => {
              finish = resolve;
            }),
        },
        { key: 'b:x', entity: { id: 'same' } },
        { key: 'b:y', entity: { id: 'next' } },
      ];
      const open = vi.fn();
      const resolved = vi.fn();
      const navigation = useListDetailNavigation({
        currentId: () => 'same',
        currentKey: key,
        getKey: (row) => row.key,
        onResolved: resolved,
        source: {
          items: () => rows,
          hasMore: () => false,
          loadMore: async () => {},
          error: () => undefined,
        },
        getEntity: (row) => row.entity,
        getContinuation: (row) => row.load,
        open,
      });
      const pending = navigation.navigate(1);
      setKey('b:x');
      finish();
      await pending;
      expect(open).not.toHaveBeenCalled();
      expect(resolved).not.toHaveBeenCalled();
      dispose();
    });
  });

  it('starts from the focused occurrence of a multi-group entity', async () => {
    await createRoot(async (dispose) => {
      const rows: Row[] = [
        { key: 'a:x', entity: { id: 'same' } },
        { key: 'a:y', entity: { id: 'wrong' } },
        { key: 'b:x', entity: { id: 'same' } },
        { key: 'b:y', entity: { id: 'right' } },
      ];
      const open = vi.fn();
      const resolved = vi.fn();
      const navigation = useListDetailNavigation({
        currentId: () => 'same',
        currentKey: () => 'b:x',
        getKey: (row) => row.key,
        onResolved: resolved,
        source: {
          items: () => rows,
          hasMore: () => false,
          loadMore: async () => {},
          error: () => undefined,
        },
        getEntity: (row) => row.entity,
        open,
      });
      await navigation.navigate(1);
      expect(open).toHaveBeenCalledWith(rows[3].entity);
      expect(resolved).toHaveBeenCalledWith(rows[3]);
      dispose();
    });
  });
});
