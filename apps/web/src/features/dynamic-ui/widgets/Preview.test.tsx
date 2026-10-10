/**
 * @vitest-environment jsdom
 */
import { cleanup, render } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

const [item, setItem] = createSignal<Record<string, unknown>>({
  loading: true,
});

vi.mock('@core/component/ItemPreview', () => ({
  useItemPreviewData: () => ({ item, name: () => item().name }),
}));
vi.mock(
  '@core/component/LexicalMarkdown/component/decorator/DocumentCard',
  () => ({
    DocumentCard: (props: { documentName: string; blockName: string }) => (
      <div data-embed={props.blockName}>{props.documentName}</div>
    ),
  })
);
vi.mock('@core/constant/allBlocks', () => ({
  itemToBlockName: (item: { fileType?: string }) => item.fileType ?? 'md',
}));
vi.mock('@app/features/agent-cards/components/reference-card', () => ({
  ReferenceCard: (props: { id: string }) => <div>reference {props.id}</div>,
}));

import { Preview } from './Preview';

afterEach(() => {
  cleanup();
  setItem({ loading: true });
});

describe('a preview', () => {
  it('embeds the document live once the viewer can open it', () => {
    setItem({
      loading: false,
      access: 'access',
      id: 'doc-1',
      type: 'document',
      fileType: 'pdf',
      name: 'Globex MSA',
    });
    const view = render(() => (
      <Preview item={{ type: 'document', id: 'doc-1' }} />
    ));
    expect(view.getByText('Globex MSA').getAttribute('data-embed')).toBe('pdf');
  });

  it('is the reference card while it loads and for a viewer without access', () => {
    const view = render(() => (
      <Preview item={{ type: 'document', id: 'doc-1' }} />
    ));
    expect(view.getByText('reference doc-1')).toBeTruthy();
    setItem({ loading: false, access: 'no_access', id: 'doc-1' });
    expect(view.getByText('reference doc-1')).toBeTruthy();
  });
});
