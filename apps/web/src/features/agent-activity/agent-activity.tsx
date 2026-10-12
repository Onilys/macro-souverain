import { useOptionalMessage } from '@app/features/channel/Message/context';
import type { AgentActivityData } from '@macro-inc/lexical-core';
import { createMemo, createSignal, lazy, Show, Suspense } from 'solid-js';
import {
  ActivityRows,
  type ActivityRowView,
  RunSummary,
} from './components/activity-rows';
import { isViewCard, type RunCard, runCards, runDuration } from './core/cards';
import { replyToTurn, segmentRows } from './core/live-reply';
import { createLiveSession } from './queries/live-session';

const ActivityCards = lazy(() => import('./components/activity-cards'));

/**
 * The steps of an agent's reply inside a channel message, and what they
 * produced.
 *
 * Live while the run of steps is still open, from the session's own fold, so
 * a step ticks from running to done where it was posted and its card
 * appears under it as soon as it finishes. Once the run seals, or for a
 * viewer who cannot read the session, the snapshot the server wrote into the
 * message keeps each step's status and label, and its card. Raw commands and
 * tool-input details are available only in the authorized live session view.
 */
export function AgentActivity(props: AgentActivityData) {
  return (
    <div class="min-w-0 max-w-full" data-agent-activity={props.agentSessionId}>
      <Show when={!props.sealed} fallback={<Run rows={props.rows} sealed />}>
        <LiveActivity {...props} />
      </Show>
    </div>
  );
}

function LiveActivity(props: AgentActivityData) {
  const live = createLiveSession(() => props.agentSessionId);
  const rows = () => {
    const reply = replyToTurn(live.messages(), props.turn);
    return (reply && segmentRows(reply, props.segment)) ?? props.rows;
  };
  return <Run rows={rows()} sealed={false} />;
}

/**
 * A run's steps and what they produced. While it runs, each step shows as
 * it goes, with its card under it. Once it is over, the steps fold into one
 * line - how long it worked, and for how many steps - and the cards stay:
 * they are what the work was for. A run where a step failed stays open, so
 * the failure is never folded away. A view the agent composed replaces its
 * own step: showing it is the step.
 */
function Run(props: {
  rows: readonly (ActivityRowView & { card?: unknown })[];
  sealed: boolean;
}) {
  const message = useOptionalMessage();
  const cards = createMemo(() => runCards(props.rows));
  const steps = () => props.rows.filter((row) => !isViewCard(row.card));
  const failed = () =>
    steps().some(
      (row) => row.status === 'failed' || row.status === 'interrupted'
    );
  const foldable = () => props.sealed && steps().length > 1 && !failed();
  const [open, setOpen] = createSignal(false);
  const duration = () => {
    const posted = message?.();
    return posted
      ? runDuration(posted.created_at, posted.updated_at)
      : undefined;
  };
  const cardsOf = (rowId: string) =>
    cards().filter((card) => card.rowId === rowId);

  return (
    <Show
      when={foldable() && !open()}
      fallback={
        <>
          <Show when={foldable()}>
            <RunSummary
              steps={steps().length}
              duration={duration()}
              open
              onToggle={() => setOpen(false)}
            />
          </Show>
          <ActivityRows
            rows={props.rows}
            all={foldable()}
            inPlace={(row) => isViewCard(row.card)}
            after={(id) => <Cards cards={cardsOf(id)} />}
          />
        </>
      }
    >
      <RunSummary
        steps={steps().length}
        duration={duration()}
        open={false}
        onToggle={() => setOpen(true)}
      />
      <Cards cards={cards()} />
    </Show>
  );
}

/** Cards, loaded only when a run has any. */
function Cards(props: { cards: readonly RunCard[] }) {
  return (
    <Show when={props.cards.length > 0}>
      <Suspense>
        <ActivityCards cards={props.cards} />
      </Suspense>
    </Show>
  );
}
