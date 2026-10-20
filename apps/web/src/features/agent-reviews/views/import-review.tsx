import { queryReadyGate } from '@queries/gate';
import {
  useCancelNotionImportMutation,
  useImportQuery,
  useNotionImportReportQuery,
} from '@queries/import';
import { ResultAsync } from 'neverthrow';
import { ImportPlanCard } from '../components/import-plan-card';
import type { Review, ReviewActions } from '../core/review';
import { createImportReview } from '../primitives/import-review';
import {
  decodeImportProgress,
  decodePlanEntries,
} from '../queries/import-plan';

/** An import review shows its plan, then the run it started. */
export function ImportReview(props: {
  review: Review;
  canAct: boolean;
  actions: ReviewActions;
}) {
  const state = useImportQuery();
  const report = useNotionImportReportQuery();
  const cancel = useCancelNotionImportMutation();
  const review = createImportReview({
    review: () => props.review,
    actions: props.actions,
    entries: () =>
      queryReadyGate(state)
        ? decodePlanEntries(state.data.entities, props.review.id)
        : [],
    report: () =>
      queryReadyGate(report) ? decodeImportProgress(report.data) : undefined,
    canAct: () => props.canAct,
    stop: async () =>
      (
        await ResultAsync.fromPromise(cancel.mutateAsync(), () => ({
          kind: 'cancel-failed' as const,
        }))
      ).isOk(),
  });
  const alert = () =>
    review.error() ??
    review.validation() ??
    (review.stopFailed()
      ? 'The import could not be stopped. Try again.'
      : undefined) ??
    (review.stale()
      ? 'This review changed elsewhere. Reload it to see the saved plan.'
      : undefined);
  return (
    <section aria-label={review.title()} class="min-w-0">
      <ImportPlanCard
        title={review.title()}
        summary={review.summary()}
        phase={review.phase()}
        progress={review.progress()}
        nodes={review.nodes()}
        hasPlan={review.hasPlan() || state.isPlaceholderData}
        isCollapsed={review.isCollapsed}
        isExcluded={review.isExcluded}
        canAct={props.canAct}
        editable={review.editable()}
        working={review.working()}
        stopping={review.stopping()}
        count={review.count()}
        volume={review.volume()}
        alert={alert()}
        onReload={
          review.error() || review.stale()
            ? () => void review.reload()
            : undefined
        }
        onToggleExpanded={review.toggleExpanded}
        onIncludedChange={review.setIncluded}
        onApprove={() => void review.approve()}
        onDismiss={() => void review.dismiss()}
        onStop={() => void review.stop()}
      />
    </section>
  );
}
