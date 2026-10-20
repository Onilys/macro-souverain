/** @vitest-environment jsdom */
import type { ImportEntity, NotionImportReport } from '@queries/import';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Review, ReviewDecision, ReviewItem } from '../core/review';
import { ImportReview } from './import-review';

const imports = vi.hoisted(() => ({
  entities: [] as ImportEntity[],
  report: undefined as NotionImportReport | undefined,
  cancel: vi.fn(),
}));
vi.mock('@core/mobile/isMobile', () => ({ isMobile: () => false }));
// The real icon table loads every block, which opens app connections.
vi.mock('@core/component/EntityIcon', () => ({
  EntityIcon: (props: { targetType: string }) => (
    <span data-icon={props.targetType} />
  ),
}));
vi.mock('@queries/import', () => ({
  useImportQuery: () => ({
    isPending: false,
    isPlaceholderData: false,
    data: { runs: [], entities: imports.entities },
  }),
  useNotionImportReportQuery: () => ({
    get isPending() {
      return imports.report === undefined;
    },
    get data() {
      return imports.report;
    },
  }),
  useCancelNotionImportMutation: () => ({ mutateAsync: imports.cancel }),
}));

function entity(
  id: string,
  parentId: string | null,
  title: string,
  plan: { decision: string; reason?: string; rows?: number },
  overrides: Partial<ImportEntity> = {}
): ImportEntity {
  return {
    id,
    user_id: 'owner',
    source: 'notion',
    kind: plan.rows === undefined ? 'page' : 'data_source',
    foreign_id: `notion-${id}`,
    parent_id: parentId,
    review_id: 'review',
    status: 'staged',
    initiator: 'chat',
    metadata: {
      title,
      url: `https://notion.so/${id}`,
      plan: { path: [], ...plan },
    },
    created_at: '2026-10-19T00:00:00Z',
    updated_at: '2026-10-19T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  imports.entities = [
    entity('wiki', null, 'Wiki', { decision: 'copy' }),
    entity('roadmap', 'wiki', 'Roadmap', {
      decision: 'tasks',
      reason: 'Rows have a status and an owner',
      rows: 40,
    }),
    entity('scratch', 'wiki', 'Scratch', {
      decision: 'skip',
      reason: 'Empty',
    }),
    entity('billing', null, 'Billing', {
      decision: 'hand',
      reason: 'Holds credentials',
    }),
    entity(
      'other',
      null,
      'Other review',
      { decision: 'copy' },
      {
        review_id: 'older-review',
      }
    ),
  ];
  imports.report = undefined;
  imports.cancel.mockReset();
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setup(options: { item?: Partial<ReviewItem>; canAct?: boolean } = {}) {
  let record: Review = {
    id: 'review',
    sessionId: 'session',
    kind: 'import',
    title: 'Import from Notion',
    revision: 0,
    updatedAt: 0,
    presentedAt: 1,
    items: [
      {
        id: 'plan',
        status: 'pending',
        draft: { source: 'notion' },
        ...options.item,
      },
    ],
  };
  const decide = vi.fn(async (decision: ReviewDecision) => {
    if (decision.revision !== record.revision) throw new Error('conflict');
    record = {
      ...record,
      revision: record.revision + 1,
      items: record.items.map((item) =>
        decision.action === 'edit'
          ? { ...item, draft: decision.draft }
          : {
              ...item,
              status: decision.action === 'submit' ? 'submitting' : 'dismissed',
            }
      ),
    };
    return record;
  });
  render(() => (
    <ImportReview
      review={record}
      canAct={options.canAct ?? true}
      actions={{ decide, reload: async () => record }}
    />
  ));
  return decide;
}

describe('import review', () => {
  it('saves what the owner leaves out and imports the rest', async () => {
    const decide = setup();
    expect(
      screen.getByText(
        'Notion shared 3 pages and 1 database — importing 1 page, 40 tasks · 1 skipped, 1 needs you'
      )
    ).toBeTruthy();
    expect(screen.queryByText('Other review')).toBeNull();
    expect(screen.getByText('Holds credentials')).toBeTruthy();
    expect(
      screen.getByRole<HTMLInputElement>('checkbox', { name: 'Import Scratch' })
        .disabled
    ).toBe(true);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Import Roadmap' }));
    expect(screen.getByRole('button', { name: 'Import 1 page' })).toBeTruthy();
    await waitFor(() =>
      expect(decide).toHaveBeenCalledWith({
        action: 'edit',
        revision: 0,
        item: 'plan',
        draft: { source: 'notion', excluded: ['roadmap'] },
      })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Import 1 page' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Import' }));
    await waitFor(() =>
      expect(decide).toHaveBeenLastCalledWith({
        action: 'submit',
        revision: 1,
        items: [],
      })
    );
    expect(await screen.findByText('Starting the import…')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('dismisses the plan without importing', async () => {
    const decide = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() =>
      expect(decide).toHaveBeenCalledWith({
        action: 'dismiss',
        revision: 0,
        items: [],
      })
    );
  });

  it('hides the choices from viewers who cannot act', () => {
    setup({ canAct: false });
    expect(screen.getByText('Roadmap')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /Import \d/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
  });

  it('shows progress and failures once approved, and stops the run', async () => {
    imports.report = {
      status: 'importing',
      pages: 3,
      dataSources: 1,
      copy: 1,
      tasks: 1,
      skip: 1,
      hand: 1,
      imported: 1,
      waiting: 2,
      writing: 1,
      reviewId: 'review',
      handItems: [],
      failures: [
        {
          importId: 'roadmap',
          title: 'Roadmap',
          kind: 'data_source',
          reason: 'Notion rate limited the request',
        },
      ],
    };
    imports.cancel.mockResolvedValue({
      ...imports.report,
      status: 'dismissed',
    });
    setup({ item: { status: 'completed' } });

    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe(
      '1'
    );
    expect(screen.getByText(/1 of 4 imported/)).toBeTruthy();
    expect(screen.getByText(/1 writing/)).toBeTruthy();
    expect(screen.getByText(/Notion rate limited the request/)).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await waitFor(() => expect(imports.cancel).toHaveBeenCalledTimes(1));
  });

  it('says what stays after the run was stopped', () => {
    imports.report = {
      status: 'dismissed',
      error: 'Cancelled',
      pages: 3,
      dataSources: 1,
      copy: 1,
      tasks: 1,
      skip: 1,
      hand: 1,
      imported: 2,
      waiting: 1,
      writing: 0,
      reviewId: 'review',
      handItems: [],
      failures: [],
    };
    setup({ item: { status: 'completed' } });
    expect(
      screen.getByText('Import stopped — 2 imported objects stay')
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
  });
});
