import { cleanup, render } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import type { RunCard } from '../core/cards';

const mounts = vi.hoisted(() => ({ item: 0, view: 0 }));
vi.mock('@app/features/agent-cards/components/item-card', () => ({
  ItemCard: (props: { item: { id: string }; summary?: string | null }) => {
    mounts.item += 1;
    return (
      <p>
        {props.item.id} · {props.summary ?? 'nothing'}
      </p>
    );
  },
}));
vi.mock('@app/features/dynamic-ui/DashboardToolView.lazy', () => ({
  DashboardToolView: () => {
    mounts.view += 1;
    return <section aria-label="View" />;
  },
}));
vi.mock('@app/features/agent-cards/components/data-card', () => ({
  DataCard: () => null,
}));
vi.mock('@app/features/agent-cards/components/sources', () => ({
  Sources: () => null,
}));

import ActivityCards from './activity-cards';

afterEach(() => {
  cleanup();
  mounts.item = 0;
  mounts.view = 0;
});

function cards(summary: string): RunCard[] {
  return [
    {
      kind: 'item',
      key: 'document:doc-1',
      rowId: 't1',
      item: { type: 'document', id: 'doc-1' },
      action: 'edited',
      summary,
    },
    { kind: 'view', key: 't2', rowId: 't2', view: { widgets: [] } },
  ];
}

it('keeps each card mounted while a live run works its cards out again', async () => {
  const [current, setCurrent] = createSignal(cards('2 changes'));
  const view = render(() => <ActivityCards cards={current()} />);
  await view.findByRole('region', { name: 'View' });
  // Every paint of a live run builds new card objects under the same keys.
  setCurrent(cards('3 changes'));
  setCurrent(cards('3 changes'));
  expect(view.getByText('doc-1 · 3 changes')).toBeTruthy();
  expect(mounts).toEqual({ item: 1, view: 1 });
});
