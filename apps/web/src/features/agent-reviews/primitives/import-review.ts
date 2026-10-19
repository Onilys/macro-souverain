import { type Accessor, createMemo, createSignal } from 'solid-js';
import {
  buildPlanTree,
  type ImportDraft,
  type ImportPlanEntry,
  type ImportProgress,
  importCount,
  importReviewPhase,
  initiallyCollapsed,
  planCounts,
  planSummary,
  progressFromEntries,
  setExcluded,
  visiblePlanNodes,
} from '../core/import-plan';
import type { Review, ReviewActions } from '../core/review';
import { decodeImportDraft } from '../queries/import-plan';
import { createReviewController } from './review-controller';
import { validateReviewDraft } from './review-draft-validation';

export type ImportReviewSources = {
  review: Accessor<Review>;
  actions: ReviewActions;
  /** The plan rows this review presents. */
  entries: Accessor<ImportPlanEntry[]>;
  /** The run's latest report; `undefined` until it has loaded. */
  report: Accessor<ImportProgress | undefined>;
  canAct: Accessor<boolean>;
  /** Stops the run; resolves `false` when the request failed. */
  stop: () => Promise<boolean>;
};

/**
 * One import review: the plan the owner trims and approves, then the run's
 * progress. Edits go through the review controller, which serializes saves.
 */
export function createImportReview(sources: ImportReviewSources) {
  const controller = createReviewController(
    sources.review,
    sources.actions,
    validateReviewDraft
  );
  const record = controller.record;
  const item = () => record().items[0];
  // Shown until the review is reloaded; the controller saves it in order.
  const [editedDraft, setEditedDraft] = createSignal<ImportDraft>();
  const draft = (): ImportDraft =>
    editedDraft() ??
    decodeImportDraft(item()?.draft) ?? { source: 'notion', excluded: [] };
  const nodes = createMemo(() => buildPlanTree(sources.entries()));
  const [collapsed, setCollapsed] = createSignal<ReadonlySet<string>>();
  const collapsedIds = () => collapsed() ?? initiallyCollapsed(nodes());
  const [stopping, setStopping] = createSignal(false);
  const [stopFailed, setStopFailed] = createSignal(false);

  const progress = (): ImportProgress | undefined => {
    const report = sources.report();
    if (!report) return undefined;
    if (report.reviewId === record().id) return report;
    // A newer run replaced this one; its rows still say how it ended.
    return item()?.status === 'completed'
      ? progressFromEntries(record().id, sources.entries())
      : undefined;
  };
  const phase = () => importReviewPhase(record(), item(), progress());
  const locked = () =>
    !sources.canAct() ||
    controller.busy() ||
    Boolean(controller.error()) ||
    controller.stale() ||
    record().presentedAt == null ||
    Boolean(record().notificationId);
  const editable = () => !locked() && phase().kind === 'plan';
  const count = () => importCount(sources.entries(), draft().excluded);

  function setIncluded(id: string, included: boolean) {
    const current = item();
    if (!current || !editable()) return;
    const next = setExcluded(draft(), nodes(), id, !included);
    setEditedDraft(next);
    controller.edit(current.id, next);
  }
  function toggleExpanded(id: string) {
    const next = new Set(collapsedIds());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCollapsed(next);
  }
  async function approve(): Promise<boolean> {
    if (!editable() || count() === 0) return false;
    return controller.decide('submit', []);
  }
  async function dismiss(): Promise<boolean> {
    if (!editable()) return false;
    return controller.decide('dismiss', []);
  }
  async function stop(): Promise<boolean> {
    if (!sources.canAct() || stopping()) return false;
    setStopping(true);
    setStopFailed(false);
    try {
      const stopped = await sources.stop();
      setStopFailed(!stopped);
      return stopped;
    } finally {
      setStopping(false);
    }
  }
  async function reload(): Promise<boolean> {
    const reloaded = await controller.reload();
    if (reloaded) setEditedDraft(undefined);
    return reloaded;
  }

  return {
    title: () => record().title,
    phase,
    progress,
    summary: () =>
      planSummary(progress()?.counts ?? planCounts(sources.entries())),
    nodes: () => visiblePlanNodes(nodes(), collapsedIds()),
    hasPlan: () => sources.entries().length > 0,
    isCollapsed: (id: string) => collapsedIds().has(id),
    isExcluded: (id: string) => draft().excluded.includes(id),
    count,
    editable,
    working: controller.busy,
    stopping,
    stopFailed,
    error: controller.error,
    validation: () => controller.validation()?.message,
    stale: controller.stale,
    setIncluded,
    toggleExpanded,
    approve,
    dismiss,
    stop,
    reload,
  };
}
