import type {
  CardAction,
  CardItem,
} from '@app/features/agent-cards/core/types';
import {
  type AgentActivityCard,
  isAgentActivityCard,
} from '@macro-inc/lexical-core';

/**
 * A card as a run of steps shows it, once per item, attached to the step
 * that first touched the item.
 */
export type RunCard =
  | {
      kind: 'item';
      key: string;
      /** The step the card sits under. */
      rowId: string;
      item: CardItem;
      action: CardAction;
      title?: string | null;
      summary?: string | null;
    }
  | { kind: 'view'; key: string; rowId: string; view: unknown };

// Which of two things done to one item a receipt says: making or removing
// an item says more than sending it, and sending more than editing.
const STRENGTH: Record<CardAction, number> = {
  created: 9,
  deleted: 8,
  sent: 7,
  shared: 6,
  moved: 5,
  renamed: 4,
  edited: 3,
  updated: 3,
  commented: 2,
  failed: 1,
};

/** Whether a row's card is a view the agent composed for the user. */
export function isViewCard(card: unknown): boolean {
  return isAgentActivityCard(card) && card.kind === 'view';
}

/**
 * The cards a run of steps produced, in the order the steps produced them.
 * An item the run touched more than once is one card, under the step that
 * first touched it, saying the most significant thing done to it. A card
 * this version cannot read is left out; the step's row still says what it
 * did.
 */
export function runCards(
  rows: readonly { id: string; card?: unknown }[]
): RunCard[] {
  const cards: RunCard[] = [];
  const items = new Map<string, Extract<RunCard, { kind: 'item' }>>();
  for (const row of rows) {
    const card: unknown = row.card;
    if (!isAgentActivityCard(card)) continue;
    if (card.kind === 'view') {
      cards.push({ kind: 'view', key: row.id, rowId: row.id, view: card.view });
      continue;
    }
    const key = `${card.itemType}:${card.itemId}`;
    const seen = items.get(key);
    if (seen) {
      if (STRENGTH[card.action] > STRENGTH[seen.action]) {
        seen.action = card.action;
        seen.summary = card.summary;
      } else if (card.action === seen.action && card.summary !== seen.summary) {
        // Neither of two edits' summaries says what both did.
        seen.summary = null;
      }
      seen.title ??= card.title;
      continue;
    }
    const entry = itemCard(key, row.id, card);
    items.set(key, entry);
    cards.push(entry);
  }
  return cards;
}

function itemCard(
  key: string,
  rowId: string,
  card: Extract<AgentActivityCard, { kind: 'item' }>
): Extract<RunCard, { kind: 'item' }> {
  return {
    kind: 'item',
    key,
    rowId,
    item: { type: card.itemType, id: card.itemId, fileType: card.fileType },
    action: card.action,
    title: card.title,
    summary: card.summary,
  };
}

/**
 * How long a finished run took, from when its message was first posted to
 * when it last changed, worded like a stopwatch: `18s`, `1m 12s`. Nothing
 * for a run too short to be worth saying.
 */
export function runDuration(
  postedAt: string | undefined,
  changedAt: string | undefined
): string | undefined {
  if (!postedAt || !changedAt) return undefined;
  const seconds = Math.round(
    (new Date(changedAt).getTime() - new Date(postedAt).getTime()) / 1000
  );
  if (!Number.isFinite(seconds) || seconds < 2) return undefined;
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}
