import { describe, expect, it } from 'vitest';
import {
  buildPlanTree,
  type ImportPlanEntry,
  type ImportProgress,
  importCount,
  importReviewPhase,
  importVolume,
  initiallyCollapsed,
  planCounts,
  planSummary,
  setExcluded,
  visiblePlanNodes,
  volumeLabel,
} from './import-plan';

const entries: ImportPlanEntry[] = [
  {
    id: 'wiki',
    parentId: null,
    kind: 'page',
    title: 'Wiki',
    decision: 'copy',
    reason: null,
    rows: null,
    status: 'staged',
    error: null,
  },
  {
    id: 'roadmap',
    parentId: 'wiki',
    kind: 'database',
    title: 'Roadmap',
    decision: 'tasks',
    reason: 'Rows have a status and an owner',
    rows: 40,
    status: 'staged',
    error: null,
  },
  {
    id: 'q3',
    parentId: 'roadmap',
    kind: 'page',
    title: 'Q3',
    decision: 'copy',
    reason: null,
    rows: null,
    status: 'staged',
    error: null,
  },
  {
    id: 'scratch',
    parentId: 'wiki',
    kind: 'page',
    title: 'Scratch',
    decision: 'skip',
    reason: 'Empty page',
    rows: null,
    status: 'staged',
    error: null,
  },
  {
    id: 'billing',
    parentId: 'gone',
    kind: 'page',
    title: 'Billing',
    decision: 'hand',
    reason: 'Holds credentials',
    rows: null,
    status: 'staged',
    error: null,
  },
];

describe('buildPlanTree', () => {
  it('orders entries depth-first and treats a missing parent as a root', () => {
    const nodes = buildPlanTree(entries);
    expect(nodes.map((node) => [node.id, node.depth, node.childIds])).toEqual([
      ['wiki', 0, ['roadmap', 'scratch']],
      ['roadmap', 1, ['q3']],
      ['q3', 2, []],
      ['scratch', 1, []],
      ['billing', 0, []],
    ]);
  });

  it('places every entry of a parent cycle exactly once', () => {
    const nodes = buildPlanTree([
      { ...entries[0], id: 'a', parentId: 'b' },
      { ...entries[0], id: 'b', parentId: 'a' },
    ]);
    expect(nodes.map((node) => [node.id, node.depth])).toEqual([
      ['a', 0],
      ['b', 1],
    ]);
  });
});

describe('visiblePlanNodes', () => {
  it('hides everything under a collapsed node', () => {
    const nodes = buildPlanTree(entries);
    expect(
      visiblePlanNodes(nodes, new Set(['wiki'])).map((node) => node.id)
    ).toEqual(['wiki', 'billing']);
    expect(
      visiblePlanNodes(nodes, initiallyCollapsed(nodes)).map((node) => node.id)
    ).toEqual(['wiki', 'roadmap', 'scratch', 'billing']);
  });
});

describe('setExcluded', () => {
  it('leaves out the written objects below a node and brings them back', () => {
    const nodes = buildPlanTree(entries);
    const out = setExcluded(
      { source: 'notion', excluded: [] },
      nodes,
      'wiki',
      true
    );
    expect(out).toEqual({
      source: 'notion',
      excluded: ['wiki', 'roadmap', 'q3'],
    });
    expect(importCount(entries, out.excluded)).toBe(0);
    const back = setExcluded(out, nodes, 'roadmap', false);
    expect(back).toEqual({ source: 'notion', excluded: ['wiki'] });
    expect(importCount(entries, back.excluded)).toBe(2);
  });
});

describe('planSummary', () => {
  it('reads the plan size and decisions', () => {
    expect(planSummary(planCounts(entries), importVolume(entries, []))).toBe(
      'Notion shared 4 pages and 1 database — importing 2 pages, 40 tasks · 1 skipped, 1 needs you'
    );
  });
});

describe('importVolume', () => {
  it('counts every row a database or task list writes, without what was left out', () => {
    const database: ImportPlanEntry = {
      id: 'bugs',
      parentId: null,
      kind: 'database',
      title: 'Bugs',
      decision: 'copy',
      reason: null,
      rows: 405,
      status: 'staged',
      error: null,
    };
    const all = [...entries, database];
    expect(importVolume(all, [])).toEqual({
      documents: 2,
      databases: 1,
      rows: 405,
      taskLists: 1,
      tasks: 40,
    });
    expect(volumeLabel(importVolume(all, []))).toBe(
      '2 pages, 1 database (405 rows), 40 tasks'
    );
    expect(volumeLabel(importVolume(all, ['roadmap', 'bugs']))).toBe('2 pages');
    expect(volumeLabel(importVolume([], []))).toBe('nothing');
  });
});

describe('importReviewPhase', () => {
  const progress: ImportProgress = {
    reviewId: 'review',
    status: 'importing',
    error: null,
    counts: planCounts(entries),
    imported: 1,
    waiting: 1,
    writing: 1,
    failures: [],
  };

  it('follows the review item until the plan is approved', () => {
    expect(
      importReviewPhase({ presentedAt: null }, undefined, undefined)
    ).toEqual({ kind: 'preparing' });
    expect(
      importReviewPhase({ presentedAt: 1 }, { status: 'pending' }, progress)
    ).toEqual({ kind: 'plan' });
    expect(
      importReviewPhase({ presentedAt: 1 }, { status: 'dismissed' }, undefined)
    ).toEqual({ kind: 'dismissed' });
  });

  it('follows the run once the plan is approved', () => {
    const completed = { status: 'completed' as const };
    expect(importReviewPhase({ presentedAt: 1 }, completed, progress)).toEqual({
      kind: 'importing',
    });
    expect(
      importReviewPhase({ presentedAt: 1 }, completed, {
        ...progress,
        status: 'dismissed',
        error: 'Cancelled',
      })
    ).toEqual({ kind: 'stopped' });
    expect(
      importReviewPhase({ presentedAt: 1 }, completed, {
        ...progress,
        status: 'failed',
        error: 'Notion is unreachable',
      })
    ).toEqual({ kind: 'failed', error: 'Notion is unreachable' });
    expect(
      importReviewPhase({ presentedAt: 1 }, completed, {
        ...progress,
        status: null,
      })
    ).toEqual({ kind: 'completed' });
    expect(importReviewPhase({ presentedAt: 1 }, completed, undefined)).toEqual(
      { kind: 'importing' }
    );
  });
});
