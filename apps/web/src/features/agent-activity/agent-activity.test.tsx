import type { AgentActivityRow } from '@macro-inc/lexical-core';
import type {
  ActivityRow,
  FoldedMessage,
} from '@service-agent-fold/generated/types';
import { cleanup, render } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';

const live = vi.hoisted(() => ({ acquired: [] as (string | undefined)[] }));
const [messages, setMessages] = createSignal<FoldedMessage[]>([]);
vi.mock('./queries/live-session', () => ({
  createLiveSession: (id: () => string | undefined) => {
    live.acquired.push(id());
    return { messages };
  },
}));
vi.mock('@app/features/block-agent/ui', () => ({
  TextShimmer: (props: { text: string }) => <>{props.text}</>,
}));
vi.mock('./components/activity-cards', () => ({
  default: (props: { cards: { key: string; rowId: string }[] }) => (
    <aside aria-label="Cards">
      {props.cards.map((card) => `${card.rowId}:${card.key}`).join(',')}
    </aside>
  ),
}));

import { AgentActivity } from './agent-activity';

afterEach(() => {
  cleanup();
  live.acquired.length = 0;
  setMessages([]);
});

const snapshot: AgentActivityRow[] = [
  { id: 't1', label: 'Running', detail: 'cargo', status: 'running' },
];

function reply(rows: ActivityRow[]): FoldedMessage {
  return {
    agentSessionId: 'session',
    turn: 2,
    author: { kind: 'agent' },
    requestId: null,
    parts: [],
    stop: null,
    pending: false,
    segments: [
      { index: 0, kind: 'prose', start: 0, end: 1, sealed: true, rows: [] },
      { index: 1, kind: 'activity', start: 1, end: 3, sealed: false, rows },
    ],
    phase: 'working',
    postedAt: null,
  };
}

const steps = (view: ReturnType<typeof render>) =>
  view
    .getAllByRole('listitem')
    .map((item) => [item.textContent, item.dataset.status]);

it('shows a sealed run as the snapshot the message carries, without the session', () => {
  const view = render(() => (
    <AgentActivity
      agentSessionId="session"
      turn={2}
      segment={1}
      rows={[{ id: 't1', label: 'Ran', detail: 'cargo', status: 'completed' }]}
      sealed
    />
  ));
  expect(steps(view)).toEqual([['Rancargo', 'completed']]);
  expect(live.acquired).toEqual([]);
});

it('ticks an open run live from the session, keeping the snapshot until it loads', () => {
  const view = render(() => (
    <AgentActivity
      agentSessionId="session"
      turn={2}
      segment={1}
      rows={snapshot}
      sealed={false}
    />
  ));
  expect(live.acquired).toEqual(['session']);
  expect(steps(view)).toEqual([['Runningcargo', 'running']]);

  setMessages([
    reply([
      { id: 't1', label: 'Ran', detail: 'cargo', status: 'completed' },
      { id: 't2', label: 'Reading', detail: 'lib.rs', status: 'running' },
    ]),
  ]);
  expect(steps(view)).toEqual([
    ['Rancargo', 'completed'],
    ['Readinglib.rs', 'running'],
  ]);
});

it('keeps a long live run on its latest steps, folding the earlier ones behind a count', () => {
  const rows = Array.from({ length: 8 }, (_, index) => ({
    id: `t${index}`,
    label: `Step ${index}`,
    status: 'completed' as const,
  }));
  const view = render(() => (
    <AgentActivity
      agentSessionId="session"
      turn={2}
      segment={1}
      rows={rows}
      sealed={false}
    />
  ));
  expect(view.getByRole('button', { name: '2 earlier steps' })).toBeTruthy();
  expect(view.queryByText('Step 1')).toBeNull();
  view.getByRole('button', { name: '2 earlier steps' }).click();
  expect(view.getByText('Step 1')).toBeTruthy();
});

it('folds a finished run into one line that opens to every step', () => {
  const rows = Array.from({ length: 8 }, (_, index) => ({
    id: `t${index}`,
    label: `Step ${index}`,
    status: 'completed' as const,
  }));
  const view = render(() => (
    <AgentActivity
      agentSessionId="session"
      turn={2}
      segment={1}
      rows={rows}
      sealed
    />
  ));
  const summary = view.getByRole('button', { name: /Worked · 8 steps/ });
  expect(view.queryByText('Step 0')).toBeNull();
  summary.click();
  expect(view.getByText('Step 0')).toBeTruthy();
  expect(view.getByText('Step 7')).toBeTruthy();
});

it('updates a live row in place as the run paints, rather than redrawing it', () => {
  const view = render(() => (
    <AgentActivity
      agentSessionId="session"
      turn={2}
      segment={1}
      rows={snapshot}
      sealed={false}
    />
  ));
  setMessages([
    reply([{ id: 't1', label: 'Running', detail: 'cargo', status: 'running' }]),
  ]);
  const row = view.getByRole('listitem');

  // Every paint carries the run as new objects.
  setMessages([
    reply([{ id: 't1', label: 'Running', detail: 'cargo', status: 'running' }]),
  ]);
  expect(view.getByRole('listitem')).toBe(row);

  setMessages([
    reply([
      { id: 't1', label: 'Ran', detail: 'cargo', status: 'completed' },
      { id: 't2', label: 'Reading', detail: 'lib.rs', status: 'running' },
    ]),
  ]);
  expect(view.getAllByRole('listitem')[0]).toBe(row);
  expect(steps(view)).toEqual([
    ['Rancargo', 'completed'],
    ['Readinglib.rs', 'running'],
  ]);
});

it('keeps snapshots free of tool details while authorized live rows retain them', () => {
  const safe = [{ id: 't1', label: 'Ran', status: 'completed' as const }];
  const snapshotView = render(() => (
    <AgentActivity
      agentSessionId="private-session"
      turn={2}
      segment={1}
      rows={safe}
      sealed
    />
  ));
  expect(snapshotView.getByRole('listitem').textContent).toBe('Ran');
  expect(live.acquired).toEqual([]);
  snapshotView.unmount();
  const liveView = render(() => (
    <AgentActivity
      agentSessionId="private-session"
      turn={2}
      segment={1}
      rows={safe}
      sealed={false}
    />
  ));
  expect(liveView.getByRole('listitem').textContent).toBe('Ran');
  setMessages([
    reply([{ ...safe[0], detail: 'TOKEN=private-value run-report' }]),
  ]);
  expect(liveView.getByRole('listitem').textContent).toBe(
    'RanTOKEN=private-value run-report'
  );
});

it('keeps a finished run open when a step failed', () => {
  const view = render(() => (
    <AgentActivity
      agentSessionId="session"
      turn={2}
      segment={1}
      rows={[
        { id: 't1', label: 'Searched', status: 'completed' },
        { id: 't2', label: 'Posted', status: 'failed' },
      ]}
      sealed
    />
  ));
  expect(view.queryByRole('button', { name: /Worked/ })).toBeNull();
  expect(steps(view)).toEqual([
    ['Searched', 'completed'],
    ['Posted', 'failed'],
  ]);
});

it('shows what a step produced under it, and a composed view in place of its step', async () => {
  const view = render(() => (
    <AgentActivity
      agentSessionId="session"
      turn={2}
      segment={1}
      rows={[
        {
          id: 't1',
          label: 'Create document',
          detail: 'Launch FAQ',
          status: 'completed',
          card: {
            kind: 'item',
            itemType: 'document',
            itemId: 'doc-1',
            action: 'created',
          },
        },
        {
          id: 't2',
          label: 'Display results',
          status: 'completed',
          card: { kind: 'view', view: { widgets: [] } },
        },
      ]}
      sealed
    />
  ));
  const cards = await view.findAllByRole('complementary', { name: 'Cards' });
  expect(cards.map((card) => card.textContent)).toEqual([
    't1:document:doc-1',
    't2:t2',
  ]);
  expect(view.getByText('Create document')).toBeTruthy();
  expect(view.queryByText('Display results')).toBeNull();
  expect(live.acquired).toEqual([]);
});

it('loads no cards for a run that produced none', () => {
  const view = render(() => (
    <AgentActivity
      agentSessionId="session"
      turn={2}
      segment={1}
      rows={snapshot}
      sealed
    />
  ));
  expect(view.queryByRole('complementary', { name: 'Cards' })).toBeNull();
});
