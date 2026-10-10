import { DataCard } from '@app/features/agent-cards/components/data-card';
import { ItemCard } from '@app/features/agent-cards/components/item-card';
import {
  type SourceRef,
  Sources,
} from '@app/features/agent-cards/components/sources';
import { DashboardToolView } from '@app/features/dynamic-ui/DashboardToolView.lazy';
import { For, Match, Suspense, Switch } from 'solid-js';
import type { RunCard } from '../core/cards';

/**
 * What steps produced: the items the agent created, changed or sent, the
 * views it composed for the user, the database answers it asked to show,
 * and what its searches found. Loaded on its own, so a conversation without
 * cards never loads what they render with.
 */
export default function ActivityCards(props: { cards: readonly RunCard[] }) {
  return (
    <div class="my-1.5 flex min-w-0 flex-col gap-2">
      <For each={props.cards}>
        {(card) => (
          <Switch>
            <Match when={card.kind === 'item' && card}>
              {(item) => (
                <ItemCard
                  item={item().item}
                  action={item().action}
                  title={item().title}
                  summary={item().summary}
                />
              )}
            </Match>
            <Match when={card.kind === 'view' && card}>
              {(view) => <AgentView view={view().view} />}
            </Match>
            <Match when={card.kind === 'data' && card}>
              {(data) => (
                <DataCard
                  sql={data().sql}
                  databaseId={data().databaseId}
                  display={data().display}
                />
              )}
            </Match>
            <Match when={card.kind === 'sources' && card}>
              {(found) => (
                <Sources
                  queries={found().queries}
                  sources={found().sources.flatMap((source) =>
                    source.kind === 'item' &&
                    source.itemType === 'calendar_event'
                      ? []
                      : [source as SourceRef]
                  )}
                  total={found().total}
                />
              )}
            </Match>
          </Switch>
        )}
      </For>
    </div>
  );
}

/**
 * A view the agent composed for the user. Its widgets are cards and prose
 * in their own right, so the view itself is not boxed: a box around cards
 * would put cards in a card.
 */
function AgentView(props: { view: unknown }) {
  return (
    <div
      class="w-full max-w-2xl min-w-0 transition-opacity duration-300 starting:opacity-0"
      data-agent-view
    >
      <Suspense
        fallback={<div class="h-16 animate-pulse rounded-xl bg-hover" />}
      >
        <DashboardToolView view={props.view} pending={false} />
      </Suspense>
    </div>
  );
}
