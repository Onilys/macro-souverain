import type { EntityItem } from '@core/context/quickAccess';
import { cleanup, fireEvent, render } from '@solidjs/testing-library';
import { type Accessor, createSignal, For, type JSX } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { CanvasAssetPicker } from './asset-picker';

const mocks = vi.hoisted(() => ({
  useEntityMention: vi.fn(),
  loadMore: vi.fn(async () => {}),
}));
vi.mock(
  '@core/component/LexicalMarkdown/component/menu/MentionsMenu/hooks/useEntityMention',
  () => ({ useEntityMention: mocks.useEntityMention })
);
vi.mock('@core/constant/allBlocks', () => ({
  fileTypeToBlockName: (type: string) => (type === 'png' ? 'image' : type),
}));
vi.mock(
  '@core/component/LexicalMarkdown/component/menu/MentionsMenu/components/MentionsMenuItem',
  () => ({
    MentionsMenuItem: (props: {
      item: EntityItem;
      itemAction: (item: EntityItem) => void;
    }) => (
      <button onClick={() => props.itemAction(props.item)}>
        {props.item.data.name}
      </button>
    ),
  })
);
vi.mock('virtua/solid', () => ({
  VList: (props: {
    data: EntityItem[];
    children: (item: EntityItem, index: Accessor<number>) => JSX.Element;
  }) => <For each={props.data}>{props.children}</For>,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function item(id: string, fileType: string): EntityItem {
  return {
    kind: 'entity',
    id,
    bucket: 'document',
    data: { type: 'document', id, name: id, fileType },
  } as EntityItem;
}
function source(items: Accessor<EntityItem[]>, more = false) {
  mocks.useEntityMention.mockReturnValue({
    entities: items,
    totalCount: () => items().length,
    hasMore: () => more,
    isLoading: () => false,
    isLoadingMore: () => false,
    loadMore: mocks.loadMore,
  });
}

it('filters media and selects by keyboard without letting canvas shortcuts handle the event', () => {
  source(() => [
    item('Note', 'md'),
    item('Photo', 'png'),
    item('Other photo', 'png'),
  ]);
  const select = vi.fn();
  const key = vi.fn();
  const view = render(() => (
    <div onKeyDown={key}>
      <CanvasAssetPicker
        mode="media"
        onSelect={select}
        onFiles={() => {}}
        onClose={() => {}}
      />
    </div>
  ));
  expect(view.queryByText('Note')).toBeNull();
  const input = view.getByRole('combobox');
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(select).toHaveBeenCalledWith({
    id: 'Other photo',
    name: 'Other photo',
    fileType: 'png',
  });
  expect(key).not.toHaveBeenCalled();
});

it('pages past ineligible media results', () => {
  const [items, setItems] = createSignal([
    item('Canvas', 'canvas'),
    item('PDF', 'pdf'),
  ]);
  source(items, true);
  const view = render(() => (
    <CanvasAssetPicker
      mode="media"
      onSelect={() => {}}
      onFiles={() => {}}
      onClose={() => {}}
    />
  ));
  expect(view.queryAllByRole('option')).toHaveLength(0);
  expect(mocks.loadMore).toHaveBeenCalledTimes(1);
  setItems([...items(), item('Photo', 'png')]);
  expect(view.getAllByRole('option')).toHaveLength(1);
  expect(mocks.loadMore).toHaveBeenCalledTimes(2);
});

it('keeps Escape local to the picker', () => {
  source(() => []);
  const close = vi.fn();
  const view = render(() => (
    <CanvasAssetPicker
      mode="reference"
      onSelect={() => {}}
      onFiles={() => {}}
      onClose={close}
    />
  ));
  expect(view.getByText('No matching files')).toBeTruthy();
  fireEvent.keyDown(view.getByRole('combobox'), { key: 'Escape' });
  expect(close).toHaveBeenCalledOnce();
});

it.each(['media', 'reference'] as const)(
  'supports Ctrl+J/K and wraparound in the %s picker',
  (mode) => {
    const fileType = mode === 'media' ? 'png' : 'md';
    source(() => [
      item('First', fileType),
      item('Second', fileType),
      item('Third', fileType),
    ]);
    const select = vi.fn();
    const view = render(() => (
      <CanvasAssetPicker
        mode={mode}
        onSelect={select}
        onFiles={() => {}}
        onClose={() => {}}
      />
    ));
    const input = view.getByRole('combobox');
    fireEvent.keyDown(input, { key: 'j', ctrlKey: true });
    expect(view.getByRole('option', { selected: true }).textContent).toBe(
      'Second'
    );
    fireEvent.keyDown(input, { key: 'k', ctrlKey: true });
    expect(view.getByRole('option', { selected: true }).textContent).toBe(
      'First'
    );
    fireEvent.keyDown(input, { key: 'k', ctrlKey: true });
    expect(view.getByRole('option', { selected: true }).textContent).toBe(
      'Third'
    );
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(select).toHaveBeenCalledWith({
      id: 'Third',
      name: 'Third',
      fileType,
    });
  }
);
