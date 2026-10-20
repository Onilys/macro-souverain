import { Button } from '@ui/components/Button';
import { Card } from '@ui/components/Card';
import { ConfirmDialog } from '@ui/components/ConfirmDialog';
import { createMemo, createSignal, For, type JSX, Show } from 'solid-js';
import { match } from 'ts-pattern';
import {
  type ImportPlanNode,
  type ImportProgress,
  type ImportReviewPhase,
  type ImportVolume,
  volumeLabel,
} from '../core/import-plan';
import { ImportPlanRow } from './import-plan-row';

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function ProgressBar(props: { done: number; total: number }) {
  const percent = () =>
    props.total > 0 ? Math.round((props.done / props.total) * 100) : 0;
  return (
    <div
      role="progressbar"
      aria-label="Import progress"
      aria-valuemin={0}
      aria-valuemax={props.total}
      aria-valuenow={props.done}
      class="h-1.5 w-full overflow-hidden rounded-full bg-edge-muted"
    >
      <div
        class="h-full rounded-full bg-accent transition-[width]"
        style={{ width: `${percent()}%` }}
      />
    </div>
  );
}

function PhaseStatus(props: {
  phase: ImportReviewPhase;
  progress: ImportProgress | undefined;
}) {
  const imported = () => props.progress?.imported ?? 0;
  const total = () =>
    imported() +
    (props.progress?.waiting ?? 0) +
    (props.progress?.writing ?? 0);
  // Rebuild only when the phase changes, not on every progress tick.
  const kind = createMemo(() => props.phase.kind);
  const error = () =>
    props.phase.kind === 'failed' || props.phase.kind === 'unknown'
      ? props.phase.error
      : null;
  return (
    <>
      {match(kind())
        .returnType<JSX.Element>()
        .with('preparing', () => (
          <p role="status" class="text-xs text-ink-muted">
            Preparing the import plan…
          </p>
        ))
        .with('plan', () => null)
        .with('starting', () => (
          <p role="status" class="text-xs text-ink-muted">
            Starting the import…
          </p>
        ))
        .with('importing', () => (
          <div class="flex flex-col gap-1.5">
            <ProgressBar done={imported()} total={total()} />
            <p role="status" class="text-xs text-ink-muted">
              {imported()} of {total()} imported
              <Show when={(props.progress?.writing ?? 0) > 0}>
                {' '}
                · {props.progress?.writing} writing
              </Show>
            </p>
          </div>
        ))
        .with('completed', () => (
          <p role="status" class="text-sm text-ink">
            Imported {plural(imported(), 'object')}
            <Show when={props.progress?.error}>
              {(error) => <span class="text-failure"> — {error()}</span>}
            </Show>
          </p>
        ))
        .with('stopped', () => (
          <p role="status" class="text-sm text-ink">
            Import stopped — {plural(imported(), 'imported object')}{' '}
            {imported() === 1 ? 'stays' : 'stay'}
          </p>
        ))
        .with('failed', () => (
          <p role="alert" class="text-sm text-failure">
            {error()}
          </p>
        ))
        .with('dismissed', () => (
          <p role="status" class="text-sm text-ink-muted">
            Dismissed — nothing was imported
          </p>
        ))
        .with('unknown', () => (
          <p role="alert" class="text-sm text-failure">
            {error() ??
              'The import may not have started. Check Macro before trying again.'}
          </p>
        ))
        .exhaustive()}
    </>
  );
}

/** A Notion workspace import plan: trimmed and approved, then its progress. */
export function ImportPlanCard(props: {
  title: string;
  summary: string;
  phase: ImportReviewPhase;
  progress: ImportProgress | undefined;
  nodes: ImportPlanNode[];
  hasPlan: boolean;
  isCollapsed: (id: string) => boolean;
  isExcluded: (id: string) => boolean;
  /** The viewer may trim, approve, and stop this import. */
  canAct: boolean;
  /** Trimming and approving are open. */
  editable: boolean;
  working: boolean;
  stopping: boolean;
  count: number;
  volume: ImportVolume;
  alert?: string;
  onReload?: () => void;
  onToggleExpanded: (id: string) => void;
  onIncludedChange: (id: string, included: boolean) => void;
  onApprove: () => void;
  onDismiss: () => void;
  onStop: () => void;
}) {
  const [confirming, setConfirming] = createSignal(false);
  const planning = () => props.phase.kind === 'plan';
  const running = () =>
    props.phase.kind === 'starting' || props.phase.kind === 'importing';
  const failures = () => props.progress?.failures ?? [];
  return (
    <Card class="my-3 flex min-w-0 flex-col gap-3 p-3">
      <header class="flex min-w-0 flex-col gap-0.5">
        <h3 class="text-sm font-semibold text-ink">{props.title}</h3>
        <Show when={props.summary}>
          <p class="text-xs text-ink-muted">{props.summary}</p>
        </Show>
      </header>
      <Show when={props.alert}>
        <div class="flex flex-wrap items-center gap-2">
          <p role="alert" class="text-sm text-failure">
            {props.alert}
          </p>
          <Show when={props.onReload}>
            {(reload) => (
              <Button
                variant="outline"
                size="sm"
                disabled={props.working}
                onClick={() => reload()()}
              >
                Reload saved review
              </Button>
            )}
          </Show>
        </div>
      </Show>
      <PhaseStatus phase={props.phase} progress={props.progress} />
      <Show
        when={props.hasPlan}
        fallback={
          <p class="text-xs text-ink-muted">The plan has no objects to show.</p>
        }
      >
        <ul
          aria-label="Import plan"
          class="max-h-80 min-w-0 overflow-y-auto overflow-x-hidden"
        >
          <For each={props.nodes}>
            {(node) => (
              <ImportPlanRow
                node={node}
                collapsed={props.isCollapsed(node.id)}
                excluded={props.isExcluded(node.id)}
                choosing={planning() && props.canAct}
                disabled={!props.editable}
                showStatus={!planning() && props.phase.kind !== 'preparing'}
                onToggleExpanded={() => props.onToggleExpanded(node.id)}
                onIncludedChange={(included) =>
                  props.onIncludedChange(node.id, included)
                }
              />
            )}
          </For>
        </ul>
      </Show>
      <Show when={failures().length > 0}>
        <section aria-label="Failures" class="flex flex-col gap-1">
          <h4 class="text-xs font-medium text-ink-muted">
            {plural(failures().length, 'object')} couldn't be imported
          </h4>
          <ul class="flex flex-col gap-0.5">
            <For each={failures()}>
              {(failure) => (
                <li class="min-w-0 text-xs text-ink-muted wrap-break-word">
                  <span class="text-ink">{failure.title || 'Untitled'}</span>
                  <Show when={failure.reason}> — {failure.reason}</Show>
                </li>
              )}
            </For>
          </ul>
        </section>
      </Show>
      <Show when={props.canAct && planning()}>
        <footer class="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={!props.editable}
            onClick={() => props.onDismiss()}
          >
            Dismiss
          </Button>
          <Button
            variant="cta"
            size="sm"
            disabled={!props.editable || props.count === 0}
            onClick={() => setConfirming(true)}
          >
            Import {volumeLabel(props.volume)}
          </Button>
        </footer>
        <ConfirmDialog
          open={confirming()}
          onOpenChange={setConfirming}
          title={`Import ${volumeLabel(props.volume)}?`}
          body="Pages become documents and databases are copied into Macro. You can stop the import while it runs; anything already imported stays."
          confirmLabel="Import"
          onConfirm={() => {
            if (!confirming()) return;
            setConfirming(false);
            props.onApprove();
          }}
        />
      </Show>
      <Show when={props.canAct && running()}>
        <footer class="flex justify-end">
          <Button
            variant="danger"
            size="sm"
            disabled={props.stopping}
            onClick={() => props.onStop()}
          >
            {props.stopping ? 'Stopping…' : 'Stop'}
          </Button>
        </footer>
      </Show>
    </Card>
  );
}
