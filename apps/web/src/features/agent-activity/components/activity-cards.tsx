import { DataCard } from '@app/features/agent-cards/components/data-card';
import { ItemCard } from '@app/features/agent-cards/components/item-card';
import {
  type SourceRef,
  Sources,
} from '@app/features/agent-cards/components/sources';
import { DashboardToolView } from '@app/features/dynamic-ui/DashboardToolView.lazy';
import { Key } from '@solid-primitives/keyed';
import { Match, Suspense, Switch } from 'solid-js';
import type { RunCard } from '../core/cards';

const asItem = (card: RunCard) => (card.kind === 'item' ? card : undefined);
const asView = (card: RunCard) => (card.kind === 'view' ? card : undefined);
const asData = (card: RunCard) => (card.kind === 'data' ? card : undefined);
const asSources = (card: RunCard) =>
  card.kind === 'sources' ? card : undefined;

/**
 * What steps produced: the items the agent created, changed or sent, the
 * views it composed for the user, the database answers it asked to show,
 * and what its searches found. Loaded on its own, so a conversation without
 * cards never loads what they render with.
 *
 * Cards are kept by key: a live run works its cards out again on every
 * paint, and a card that is still there must stay mounted - its entrance
 * plays once, its data stays subscribed, and a list it opened stays open.
 */
export default function ActivityCards(props: { cards: readonly RunCard[] }) {
  return (
    <div class="my-1.5 flex min-w-0 flex-col gap-2">
      <Key each={props.cards} by="key">
        {(entry) => (
          <Switch>
            <Match when={asItem(entry())}>
              {(item) => (
                <ItemCard
                  item={item().item}
                  action={item().action}
                  title={item().title}
                  summary={item().summary}
                />
              )}
            </Match>
            <Match when={asView(entry())}>
              {(view) => <AgentView view={view().view} />}
            </Match>
            <Match when={asData(entry())}>
              {(data) => (
                <DataCard
                  sql={data().sql}
                  databaseId={data().databaseId}
                  display={data().display}
                />
              )}
            </Match>
            <Match when={asSources(entry())}>
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
      </Key>
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
