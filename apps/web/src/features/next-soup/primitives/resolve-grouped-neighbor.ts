import type { SoupEntityRow, SoupRow } from '../create-soup-state';

/** Resolve a row occurrence without crossing an unfinished forward group boundary. */
export async function resolveGroupedNeighbor(options: {
  rows: () => readonly SoupRow[];
  currentKey: string | undefined;
  direction: -1 | 1;
  isCurrent: () => boolean;
  load: (key: string) => Promise<void>;
  error: (key: string) => Error | null;
  accept?: (row: SoupEntityRow) => boolean;
}): Promise<SoupEntityRow | undefined> {
  while (options.isCurrent()) {
    const rows = options.rows();
    const current =
      options.currentKey === undefined
        ? options.direction === 1
          ? -1
          : rows.length
        : rows.findIndex((row) => row.identityKey === options.currentKey);
    if (options.currentKey !== undefined && current < 0) return;
    let boundary: SoupRow | undefined;
    for (
      let index = current + options.direction;
      index >= 0 && index < rows.length;
      index += options.direction
    ) {
      const row = rows[index];
      if (row.group && !row.group.isExpanded()) continue;
      if (row.kind === 'entity' && (options.accept?.(row) ?? true)) return row;
      if (options.direction === 1 && row.kind === 'group-status') {
        boundary = row;
        break;
      }
    }
    if (!boundary?.group) return;
    const group = boundary.group;
    const error = options.error(group.key);
    if (error) throw error;
    await options.load(group.key);
    if (!options.isCurrent() || !group.isExpanded()) return;
    const nextError = options.error(group.key);
    if (nextError) throw nextError;
  }
}
