import { EntityIcon } from '@core/component/EntityIcon';
import CaretDown from '@phosphor/caret-down.svg';
import { Badge } from '@ui/components/Badge';
import { Checkbox } from '@ui/components/Checkbox';
import { Tooltip } from '@ui/components/Tooltip';
import { cn } from '@ui/utils/classname';
import { Show } from 'solid-js';
import { match } from 'ts-pattern';
import {
  type ImportPlanDecision,
  type ImportPlanNode,
  isWritten,
} from '../core/import-plan';

/** Deeper levels share the last indent so rows fit a phone-width transcript. */
const MAX_INDENT_LEVEL = 4;

function decisionLabel(decision: ImportPlanDecision): string {
  return match(decision)
    .with('copy', () => 'Copy')
    .with('tasks', () => 'Tasks')
    .with('skip', () => 'Skip')
    .with('hand', () => 'Needs you')
    .exhaustive();
}

function DecisionBadge(props: {
  decision: ImportPlanDecision;
  reason: string | null;
}) {
  const badge = () => (
    <Badge
      size="xs"
      variant="outline"
      class={cn(
        props.decision === 'tasks' && 'text-accent',
        props.decision === 'hand' && 'text-warning',
        props.decision === 'skip' && 'text-ink-extra-muted'
      )}
    >
      {decisionLabel(props.decision)}
    </Badge>
  );
  return (
    <Show when={props.reason} fallback={badge()}>
      {(reason) => (
        <Tooltip label={reason()} as="span" tabIndex={0}>
          {badge()}
        </Tooltip>
      )}
    </Show>
  );
}

function RowStatus(props: { node: ImportPlanNode; excluded: boolean }) {
  return (
    <Show
      when={props.node.error}
      fallback={
        <span class="shrink-0 text-xs text-ink-muted">
          {match(props.node.status)
            .with('imported', () => 'Imported')
            .with('importing', () => 'Writing…')
            .with('discarded', () => 'Left out')
            .with('staged', () =>
              props.node.decision === 'hand'
                ? 'Left for the agent'
                : isWritten(props.node.decision) && !props.excluded
                  ? 'Waiting'
                  : ''
            )
            .exhaustive()}
        </span>
      }
    >
      <span class="shrink-0 text-xs text-failure">Failed</span>
    </Show>
  );
}

/** One Notion object in the plan tree. */
export function ImportPlanRow(props: {
  node: ImportPlanNode;
  collapsed: boolean;
  excluded: boolean;
  /** Show the checkbox that leaves the object out. */
  choosing: boolean;
  disabled: boolean;
  /** Show how the write went instead of the plan. */
  showStatus: boolean;
  onToggleExpanded: () => void;
  onIncludedChange: (included: boolean) => void;
}) {
  const written = () => isWritten(props.node.decision);
  const included = () => written() && !props.excluded;
  return (
    <li
      class={cn(
        'flex min-w-0 items-center gap-1.5 py-1 pr-1 touch:min-h-[44px]',
        !included() && !props.showStatus && 'text-ink-muted',
        props.showStatus && props.node.status === 'discarded' && 'opacity-60'
      )}
      style={{
        'padding-left': `${Math.min(props.node.depth, MAX_INDENT_LEVEL) * 12}px`,
      }}
    >
      <Show
        when={props.node.childIds.length > 0}
        fallback={
          <span class="size-4 shrink-0 touch:size-8" aria-hidden="true" />
        }
      >
        <button
          type="button"
          class="flex size-4 shrink-0 items-center justify-center rounded-sm text-ink-muted touch:size-8 not-touch:hover:text-ink"
          aria-expanded={!props.collapsed}
          aria-label={`${props.collapsed ? 'Show' : 'Hide'} what is inside ${props.node.title}`}
          onClick={() => props.onToggleExpanded()}
        >
          <CaretDown
            class={cn(
              'size-3 transition-transform',
              props.collapsed && '-rotate-90'
            )}
          />
        </button>
      </Show>
      <Show when={props.choosing}>
        <Checkbox
          checked={included()}
          disabled={props.disabled || !written()}
          onChange={(checked) => props.onIncludedChange(checked)}
        >
          <Checkbox.Control />
          <Checkbox.Label class="sr-only">
            Import {props.node.title}
          </Checkbox.Label>
        </Checkbox>
      </Show>
      <EntityIcon
        targetType={props.node.kind === 'database' ? 'database' : 'md'}
        size="xs"
      />
      <span class="flex min-w-0 flex-1 flex-col">
        <span class="truncate text-sm" title={props.node.title}>
          {props.node.title || 'Untitled'}
        </span>
        {/* The agent picks these up, so their reason is worth reading. */}
        <Show when={props.node.decision === 'hand' && props.node.reason}>
          <span class="truncate text-xs text-ink-muted">
            {props.node.reason}
          </span>
        </Show>
      </span>
      <Show when={props.node.kind === 'database' && props.node.rows !== null}>
        <span class="shrink-0 text-xs text-ink-muted">
          {props.node.rows}
          {props.node.moreRows ? '+' : ''} rows
        </span>
      </Show>
      <Show
        when={props.showStatus}
        fallback={
          <DecisionBadge
            decision={props.node.decision}
            reason={props.node.reason}
          />
        }
      >
        <RowStatus node={props.node} excluded={props.excluded} />
      </Show>
    </li>
  );
}
