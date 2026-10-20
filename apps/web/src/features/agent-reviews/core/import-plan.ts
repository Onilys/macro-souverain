import { match } from 'ts-pattern';
import type { Review, ReviewItem } from './review';

/** What a workspace import does with one Notion object. */
export type ImportPlanDecision = 'copy' | 'tasks' | 'skip' | 'hand';

/** One Notion object in an import plan. */
export type ImportPlanEntry = {
  id: string;
  parentId: string | null;
  kind: 'page' | 'database';
  title: string;
  decision: ImportPlanDecision;
  reason: string | null;
  rows: number | null;
  status: 'staged' | 'importing' | 'imported' | 'discarded';
  error: string | null;
};

/** A plan entry placed in its tree, in depth-first order. */
export type ImportPlanNode = ImportPlanEntry & {
  depth: number;
  childIds: string[];
};

export type ImportPlanCounts = {
  pages: number;
  databases: number;
  copy: number;
  tasks: number;
  skip: number;
  hand: number;
};

export type ImportReportItem = { id: string; title: string; reason: string };

/** Where the import run stands, as the server reports it. */
export type ImportProgress = {
  reviewId: string | null;
  status:
    | 'running'
    | 'ready'
    | 'importing'
    | 'completed'
    | 'failed'
    | 'dismissed'
    | null;
  error: string | null;
  counts: ImportPlanCounts;
  imported: number;
  waiting: number;
  writing: number;
  failures: ImportReportItem[];
};

export type ImportReviewPhase =
  | { kind: 'preparing' }
  | { kind: 'plan' }
  | { kind: 'starting' }
  | { kind: 'importing' }
  | { kind: 'completed' }
  | { kind: 'stopped' }
  | { kind: 'failed'; error: string }
  | { kind: 'dismissed' }
  | { kind: 'unknown'; error: string | null };

/** The saved draft of an import review. */
export type ImportDraft = { source: 'notion'; excluded: string[] };

/** Whether a decision writes anything, and so can be left out. */
export function isWritten(decision: ImportPlanDecision): boolean {
  return match(decision)
    .with('copy', 'tasks', () => true)
    .with('skip', 'hand', () => false)
    .exhaustive();
}

/**
 * Orders entries depth-first under their parents. An entry whose parent is
 * not in the plan is a root; a cycle is broken where it is first revisited.
 */
export function buildPlanTree(entries: ImportPlanEntry[]): ImportPlanNode[] {
  const ids = new Set(entries.map((entry) => entry.id));
  const children = new Map<string, ImportPlanEntry[]>();
  const roots: ImportPlanEntry[] = [];
  for (const entry of entries) {
    if (
      entry.parentId &&
      entry.parentId !== entry.id &&
      ids.has(entry.parentId)
    ) {
      const siblings = children.get(entry.parentId) ?? [];
      siblings.push(entry);
      children.set(entry.parentId, siblings);
    } else {
      roots.push(entry);
    }
  }
  const placed = new Set<string>();
  const nodes: ImportPlanNode[] = [];
  const place = (entry: ImportPlanEntry, depth: number) => {
    if (placed.has(entry.id)) return;
    placed.add(entry.id);
    const below = (children.get(entry.id) ?? []).filter(
      (child) => !placed.has(child.id)
    );
    nodes.push({ ...entry, depth, childIds: below.map((child) => child.id) });
    for (const child of below) place(child, depth + 1);
  };
  for (const root of roots) place(root, 0);
  // Entries only reachable through a cycle become roots.
  for (const entry of entries) place(entry, 0);
  return nodes;
}

/** The nodes left showing when the given nodes are collapsed. */
export function visiblePlanNodes(
  nodes: ImportPlanNode[],
  collapsed: ReadonlySet<string>
): ImportPlanNode[] {
  const visible: ImportPlanNode[] = [];
  let hiddenBelow: number | null = null;
  for (const node of nodes) {
    if (hiddenBelow !== null && node.depth > hiddenBelow) continue;
    hiddenBelow = null;
    visible.push(node);
    if (collapsed.has(node.id) && node.childIds.length > 0)
      hiddenBelow = node.depth;
  }
  return visible;
}

/** Nodes with children below the top level start collapsed. */
export function initiallyCollapsed(nodes: ImportPlanNode[]): Set<string> {
  return new Set(
    nodes
      .filter((node) => node.depth > 0 && node.childIds.length > 0)
      .map((node) => node.id)
  );
}

/** The node and everything below it. */
function subtree(nodes: ImportPlanNode[], id: string): string[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const out: string[] = [];
  const visit = (current: string) => {
    const node = byId.get(current);
    if (!node || out.includes(current)) return;
    out.push(current);
    for (const child of node.childIds) visit(child);
  };
  visit(id);
  return out;
}

/**
 * Leaves an object (and the written objects below it) out of the import, or
 * brings them back. Objects that are never written are not recorded.
 */
export function setExcluded(
  draft: ImportDraft,
  nodes: ImportPlanNode[],
  id: string,
  excluded: boolean
): ImportDraft {
  const written = new Set(
    nodes.filter((node) => isWritten(node.decision)).map((node) => node.id)
  );
  const affected = subtree(nodes, id).filter((entry) => written.has(entry));
  const next = draft.excluded.filter((entry) => !affected.includes(entry));
  return {
    source: 'notion',
    excluded: excluded ? [...next, ...affected] : next,
  };
}

/** Objects the import will write once approved. */
export function importCount(
  entries: ImportPlanEntry[],
  excluded: readonly string[]
): number {
  return entries.filter(
    (entry) => isWritten(entry.decision) && !excluded.includes(entry.id)
  ).length;
}

/** What approving the plan writes, in real numbers: every row is counted. */
export type ImportVolume = {
  documents: number;
  databases: number;
  rows: number;
  taskLists: number;
  tasks: number;
};

/** The volume the plan writes, leaving out `excluded` entries. */
export function importVolume(
  entries: ImportPlanEntry[],
  excluded: readonly string[]
): ImportVolume {
  const volume: ImportVolume = {
    documents: 0,
    databases: 0,
    rows: 0,
    taskLists: 0,
    tasks: 0,
  };
  for (const entry of entries) {
    if (excluded.includes(entry.id)) continue;
    match(entry.decision)
      .with('copy', () => {
        if (entry.kind === 'database') {
          volume.databases += 1;
          volume.rows += entry.rows ?? 0;
        } else {
          volume.documents += 1;
        }
      })
      .with('tasks', () => {
        volume.taskLists += 1;
        volume.tasks += entry.rows ?? 0;
      })
      .with('skip', 'hand', () => {})
      .exhaustive();
  }
  return volume;
}

/** e.g. "54 pages, 18 databases (405 rows), 33 tasks". */
export function volumeLabel(volume: ImportVolume): string {
  const parts = [
    volume.documents > 0 ? plural(volume.documents, 'page', 'pages') : '',
    volume.databases > 0
      ? `${plural(volume.databases, 'database', 'databases')} (${plural(volume.rows, 'row', 'rows')})`
      : '',
    volume.taskLists > 0 ? plural(volume.tasks, 'task', 'tasks') : '',
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : 'nothing';
}

export function planCounts(entries: ImportPlanEntry[]): ImportPlanCounts {
  const counts: ImportPlanCounts = {
    pages: 0,
    databases: 0,
    copy: 0,
    tasks: 0,
    skip: 0,
    hand: 0,
  };
  for (const entry of entries) {
    if (entry.kind === 'database') counts.databases += 1;
    else counts.pages += 1;
    counts[entry.decision] += 1;
  }
  return counts;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * e.g. "Notion shared 56 pages and 24 databases — importing 54 pages,
 * 18 databases (405 rows), 33 tasks · 6 skipped, 1 needs you".
 */
export function planSummary(
  counts: ImportPlanCounts,
  volume: ImportVolume
): string {
  const shared = [
    counts.pages > 0 ? plural(counts.pages, 'page', 'pages') : '',
    counts.databases > 0
      ? plural(counts.databases, 'database', 'databases')
      : '',
  ]
    .filter(Boolean)
    .join(' and ');
  const left = [
    counts.skip > 0 ? `${counts.skip} skipped` : '',
    counts.hand > 0
      ? `${counts.hand} ${counts.hand === 1 ? 'needs' : 'need'} you`
      : '',
  ]
    .filter(Boolean)
    .join(', ');
  return [
    shared ? `Notion shared ${shared}` : '',
    `importing ${volumeLabel(volume)}`,
  ]
    .filter(Boolean)
    .join(' — ')
    .concat(left ? ` · ${left}` : '');
}

/** Progress counted from the plan rows, when the run reports another review. */
export function progressFromEntries(
  reviewId: string,
  entries: ImportPlanEntry[]
): ImportProgress {
  const pending = entries.filter(
    (entry) => entry.status === 'staged' && isWritten(entry.decision)
  );
  return {
    reviewId,
    status: null,
    error: null,
    counts: planCounts(entries),
    imported: entries.filter((entry) => entry.status === 'imported').length,
    waiting: pending.length,
    writing: entries.filter((entry) => entry.status === 'importing').length,
    failures: pending
      .filter((entry) => entry.error)
      .map((entry) => ({
        id: entry.id,
        title: entry.title,
        reason: entry.error ?? '',
      })),
  };
}

/**
 * The review item decides whether the plan was approved; once it was, the
 * run's status says how the write is going.
 */
export function importReviewPhase(
  review: Pick<Review, 'presentedAt'>,
  item: Pick<ReviewItem, 'status' | 'error'> | undefined,
  progress: ImportProgress | undefined
): ImportReviewPhase {
  if (review.presentedAt == null || !item) return { kind: 'preparing' };
  return match(item.status)
    .returnType<ImportReviewPhase>()
    .with('pending', () => ({ kind: 'plan' }))
    .with('submitting', () => ({ kind: 'starting' }))
    .with('dismissed', () => ({ kind: 'dismissed' }))
    .with('unknown', () => ({ kind: 'unknown', error: item.error ?? null }))
    .with('completed', () =>
      match(progress?.status ?? null)
        .returnType<ImportReviewPhase>()
        .with('completed', () => ({ kind: 'completed' }))
        .with('dismissed', () => ({ kind: 'stopped' }))
        .with('failed', () => ({
          kind: 'failed',
          error: progress?.error ?? 'The import failed.',
        }))
        .with('importing', 'running', 'ready', () => ({ kind: 'importing' }))
        // Progress without a run status was counted from the rows because a
        // newer run replaced this one, so this run has finished.
        .with(null, () =>
          progress ? { kind: 'completed' } : { kind: 'importing' }
        )
        .exhaustive()
    )
    .exhaustive();
}
