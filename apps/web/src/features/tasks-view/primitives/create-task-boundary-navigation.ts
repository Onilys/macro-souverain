import { fireAndForget } from '@core/util/fireAndForget';
import { type Accessor, onCleanup } from 'solid-js';
import type { TasksDataSourceItem } from '../queries/use-tasks-query';

/** Holds keyboard navigation at a page boundary until its current query can advance. */
export function createTaskBoundaryNavigation(options: {
  enabled: Accessor<boolean>;
  ready: Accessor<boolean>;
  identity: Accessor<string | undefined>;
  rows: Accessor<readonly TasksDataSourceItem[]>;
  focus: Accessor<{ key: string; index: number } | undefined>;
  focusKey: Accessor<string | undefined>;
  expanded: (group: string) => boolean;
  error: (group: string) => unknown;
  load: (group: string) => Promise<void>;
  move: (direction: -1 | 1, extendSelection: boolean) => void;
}) {
  let pending = false;
  let disposed = false;
  onCleanup(() => {
    disposed = true;
  });
  return (direction: -1 | 1, extendSelection = false) => {
    if (!options.enabled() || direction !== 1) return true;
    if (pending) return false;
    const current = options.focus();
    const next = options
      .rows()
      .slice((current?.index ?? -1) + 1)
      .find((row) =>
        extendSelection
          ? row.kind === 'entity' || row.kind === 'load-more'
          : row.kind !== 'section-header'
      );
    if (next?.kind !== 'load-more' || next.groupId === undefined) return true;
    const key = current?.key;
    const identity = options.identity();
    const group = next.groupId;
    if (!options.ready() || options.error(group)) return false;
    pending = true;
    const resume = async () => {
      try {
        await options.load(group);
        if (
          disposed ||
          !options.ready() ||
          key !== options.focusKey() ||
          identity !== options.identity() ||
          !options.expanded(group)
        )
          return;
      } catch {
        // The group boundary exposes Retry.
        return;
      } finally {
        pending = false;
      }
      options.move(direction, extendSelection);
    };
    fireAndForget(resume(), 'tasks-view');
    return false;
  };
}
