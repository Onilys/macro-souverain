import { fireEvent, render } from '@solidjs/testing-library';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  item: {
    id: 'db',
    type: 'database',
    loading: false,
    access: 'access',
    name: 'Trial cancellations',
    rawName: 'Trial cancellations',
  } as Record<string, unknown>,
  open: vi.fn(),
}));

vi.mock('@app/lib/analytics/posthog', () => ({
  useFeatureFlag: () => () => ({ enabled: true }),
}));
vi.mock('@core/component/ItemPreview', () => ({
  useItemPreviewData: () => ({
    item: () => mocks.item,
    ItemEntityIcon: () => null,
    documentProperties: () => undefined,
  }),
}));
vi.mock('../core/BlockLink', () => ({
  openDocument: (...args: unknown[]) => mocks.open(...args),
}));
vi.mock('@core/component/DocumentPreview', () => ({
  getMentionsIcon: () => null,
  mentionsAccessories: () => undefined,
  PopupPreview: () => null,
}));
vi.mock('@core/component/HoverCard', () => ({
  HoverCard: (props: { trigger: import('solid-js').JSX.Element }) =>
    props.trigger,
}));
vi.mock('../../plugins', () => ({
  autoRegister: vi.fn(),
  UPDATE_DOCUMENT_NAME_COMMAND: 'UPDATE_DOCUMENT_NAME',
}));

import { DocumentMention } from './DocumentMention';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.item = {
    id: 'db',
    type: 'database',
    loading: false,
    access: 'access',
    name: 'Trial cancellations',
    rawName: 'Trial cancellations',
  };
});

describe('database mention chip', () => {
  it('shows the database name when the viewer can open it', () => {
    const view = render(() => (
      <DocumentMention
        documentId="db"
        documentName="Stale name"
        blockName="database"
        key="node"
        theme={{}}
      />
    ));
    expect(view.container.textContent).toContain('Trial cancellations');
    expect(view.container.textContent).not.toContain('Database unavailable');
    expect(view.container.textContent).not.toContain('No Access');
    fireEvent.click(view.getByRole('link'));
    expect(mocks.open).toHaveBeenCalledWith(
      'database',
      'db',
      undefined,
      expect.anything()
    );
  });

  it('shows No Access and does not open when the viewer has no grant', () => {
    mocks.item = {
      id: 'db',
      type: 'database',
      loading: false,
      access: 'no_access',
    };
    const view = render(() => (
      <DocumentMention
        documentId="db"
        documentName="Trial cancellations"
        blockName="database"
        key="node"
        theme={{}}
      />
    ));
    expect(view.container.textContent).toBe('No Access');
    expect(view.container.textContent).not.toContain('Database unavailable');
    expect(view.container.textContent).not.toContain('Trial cancellations');
    fireEvent.click(view.getByRole('link'));
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it('shows Deleted when the database is gone', () => {
    mocks.item = {
      id: 'db',
      type: 'database',
      loading: false,
      access: 'does_not_exist',
    };
    const view = render(() => (
      <DocumentMention
        documentId="db"
        documentName="Trial cancellations"
        blockName="database"
        key="node"
        theme={{}}
      />
    ));
    expect(view.container.textContent).toBe('Deleted');
    fireEvent.click(view.getByRole('link'));
    expect(mocks.open).not.toHaveBeenCalled();
  });
});
