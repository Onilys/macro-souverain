import {
  $getPinnedProperties,
  pinnedPropertiesPlugin,
} from '@core/component/LexicalMarkdown/plugins/pinned-properties/pinnedPropertiesPlugin';
import {
  PropertiesProvider,
  usePropertiesContext,
} from '@property/context/PropertiesContext';
import type { openPropertyEditor } from '@property/editor/state/propertyEditor';
import type {
  Property,
  PropertyApiValues,
  PropertyDefinitionDomain,
} from '@property/types';
import type { PropertyDefinition } from '@service-properties/generated/schemas/propertyDefinition';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@solidjs/testing-library';
import {
  $createParagraphNode,
  $getRoot,
  createEditor,
  type LexicalEditor,
} from 'lexical';
import { createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { InlineTaskProperties } from './InlineTaskProperties';
import { TaskComposerPropertyEditor } from './TaskComposerPropertyEditor';

const mocks = vi.hoisted(() => ({
  editor: undefined as LexicalEditor | undefined,
  properties: () => [] as Property[],
  add: vi.fn(),
  open: vi.fn<typeof openPropertyEditor>(),
  kind: 'document' as 'document' | 'task',
  projectsEnabled: false,
}));
const entityWrite = vi.fn();

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});

vi.mock('@service-storage/websocket', () => ({
  storageWS: { reconnectIfDisconnected: vi.fn() },
  createWebSocketJob: vi.fn(),
}));
vi.mock('@service-connection/websocket', () => ({
  ws: { addEventListener: vi.fn(), send: vi.fn() },
  createConnectionWebsocketEffect: vi.fn(),
}));
vi.mock('@app/lib/analytics/posthog', () => ({
  useFeatureFlag: () => () => ({ enabled: mocks.projectsEnabled }),
}));
vi.mock('@entity', () => ({
  InlineEntity: () => null,
  isTaskEntity: () => false,
}));
vi.mock('@entity/extractors-property', () => ({
  buildTaskProjectDefaultProperty: () => ({
    propertyId: 'pending:project',
    propertyDefinitionId: '00000001-0000-0000-0000-000000000014',
    displayName: 'Project',
    valueType: 'ENTITY',
    value: null,
    isMultiSelect: false,
    owner: { scope: 'system' },
    createdAt: '1970-01-01',
    updatedAt: '1970-01-01',
  }),
}));
vi.mock('@property/editor/state/propertyEditor', () => ({
  openPropertyEditor: mocks.open,
}));
vi.mock('@property/component/modal', () => ({ Modals: () => null }));
vi.mock('@property/component/modal/CreatePropertyModal', () => ({
  CreatePropertyModal: (props: {
    initialName: string;
    autoPinOnCreate: boolean;
    onPropertyCreated: (id: string, definition: PropertyDefinition) => void;
  }) => (
    <button
      onClick={() =>
        props.onPropertyCreated('created-notes', {
          id: 'created-notes',
          display_name: props.initialName,
          data_type: 'STRING',
          is_multi_select: false,
          is_metadata: false,
          is_system: false,
          owner: { scope: 'system' },
          specific_entity_type: null,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        })
      }
    >
      Create {props.initialName}
    </button>
  ),
}));
vi.mock('@property/hooks', async () => ({
  usePropertySelection: (await import('@property/hooks/usePropertySelection'))
    .usePropertySelection,
  useEntityProperties: () => ({
    properties: () => mocks.properties(),
    refetch: vi.fn(),
    addProperty: mocks.add,
    removeProperty: vi.fn(),
  }),
}));
vi.mock('@property/tags', () => ({ InlineFetchedEntityTagsPill: () => null }));
vi.mock('@queries/properties/definitions', () => ({
  useListPropertiesQuery: () => ({ isSuccess: false }),
  fetchPropertyDefinitionWithOptions: vi.fn(async () => null),
}));
vi.mock('@queries/properties/tags', () => ({
  useTagsQuery: () => ({ isSuccess: true, data: [] }),
}));
vi.mock('@queries/properties/entity', () => ({
  useBulkSaveEntityPropertiesMutation: () => ({ mutateAsync: entityWrite }),
  useEntityPropertiesQuery: () => ({ data: [] }),
}));
vi.mock('@core/component/LexicalMarkdown/component/status/Progress', () => ({
  ProgressChip: () => null,
}));
vi.mock('./MarkdownNameProvider', () => ({
  useMarkdownName: () => ({ displayName: () => 'Document' }),
}));
vi.mock('../context/markdown-document-context', () => ({
  useMarkdownDocument: () => ({
    documentId: () => 'doc',
    kind: () => mocks.kind,
    permissions: { canEdit: () => true },
    state: { editor: { md: { editor: mocks.editor } } },
  }),
}));
vi.mock('./InlinePropertyValue', () => ({
  InlinePropertyValue: (props: { property: Property }) => {
    const context = usePropertiesContext();
    return (
      <button
        onClick={() => context.onPropertyUnpinned?.(props.property.propertyId)}
      >
        Unpin {props.property.displayName}
      </button>
    );
  },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  mocks.kind = 'document';
  mocks.projectsEnabled = false;
});

const property: Property = {
  propertyId: 'assignment',
  propertyDefinitionId: 'definition',
  displayName: 'Review notes',
  valueType: 'STRING',
  value: 'Keep this value',
  isMultiSelect: false,
  owner: { scope: 'system' },
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

const draftDefinition: PropertyDefinitionDomain = {
  id: 'draft-notes',
  displayName: 'Draft notes',
  valueType: 'STRING',
  isMultiSelect: false,
  isMetadata: false,
  isSystem: false,
  owner: { scope: 'system' },
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

function setup(initial: Property[] = []) {
  const editor = createEditor({
    onError: (error) => {
      throw error;
    },
  });
  editor.update(() => $getRoot().append($createParagraphNode()), {
    discrete: true,
  });
  pinnedPropertiesPlugin()(editor);
  mocks.editor = editor;
  render(() => {
    const [properties, setProperties] = createSignal(initial);
    mocks.properties = properties;
    mocks.add.mockImplementation(async () => setProperties([property]));
    return <InlineTaskProperties />;
  });
  return editor;
}

it('pins a newly assigned property and unpins without deleting its value', async () => {
  const editor = setup();
  await fireEvent.click(screen.getByRole('button', { name: 'Add property' }));
  await mocks.open.mock.lastCall?.[3]?.onPropertyAdded?.(['definition']);
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Unpin Review notes' })
    ).toBeTruthy()
  );
  expect(mocks.add).toHaveBeenCalledWith('definition');
  expect(editor.getEditorState().read($getPinnedProperties)).toEqual([
    'assignment',
  ]);
  await fireEvent.click(
    screen.getByRole('button', { name: 'Unpin Review notes' })
  );
  await waitFor(() =>
    expect(
      screen.queryByRole('button', { name: 'Unpin Review notes' })
    ).toBeNull()
  );
  expect(editor.getEditorState().read($getPinnedProperties)).toEqual([]);
  expect(mocks.properties()[0].value).toBe('Keep this value');
});

it('repins an existing property without assigning it a second time', async () => {
  setup([property]);
  await fireEvent.click(screen.getByRole('button', { name: 'Add property' }));
  await mocks.open.mock.lastCall?.[3]?.onPropertyAdded?.(['definition']);
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Unpin Review notes' })
    ).toBeTruthy()
  );
  expect(mocks.add).not.toHaveBeenCalled();
});

it("shows a task's Project with the other task properties, through the same pill", async () => {
  mocks.kind = 'task';
  mocks.projectsEnabled = true;
  setup();
  // A task without a project still gets the standard pill, from a placeholder.
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Unpin Project' })).toBeTruthy()
  );

  cleanup();
  mocks.projectsEnabled = false;
  setup();
  expect(screen.queryByRole('button', { name: 'Unpin Project' })).toBeNull();
});

it('selects a shared property and edits its draft value without an entity write', async () => {
  const onAdd = vi.fn(async () => {});
  const [values, setValues] = createStore<Record<string, PropertyApiValues>>(
    {}
  );
  render(() => (
    <PropertiesProvider
      entityType="TASK"
      canEdit
      properties={() => []}
      onRefresh={() => {}}
      onPropertyAdded={() => {}}
      onPropertyDeleted={() => {}}
      saveHandler={{ saveProperty: async () => {}, saveDate: async () => {} }}
    >
      <TaskComposerPropertyEditor
        name="New task"
        definitions={[draftDefinition]}
        properties={[]}
        onAdd={onAdd}
        onSave={(id, value) => setValues(id, value)}
      />
    </PropertiesProvider>
  ));

  await fireEvent.click(screen.getByRole('button', { name: 'Add property' }));
  await fireEvent.click(screen.getByText('Draft notes'));
  await waitFor(() => expect(onAdd).toHaveBeenCalledWith('draft-notes'));
  await fireEvent.input(screen.getByPlaceholderText('Enter Draft notes'), {
    target: { value: 'Remember this' },
  });
  await fireEvent.click(screen.getByText('Set Draft notes', { exact: false }));
  await waitFor(() =>
    expect(screen.queryByPlaceholderText('Enter Draft notes')).toBeNull()
  );
  expect(values['draft-notes']).toEqual({
    valueType: 'STRING',
    value: 'Remember this',
  });
  expect(entityWrite).not.toHaveBeenCalled();

  await fireEvent.click(screen.getByRole('button', { name: 'Add property' }));
  await fireEvent.click(screen.getByText('Draft notes'));
  await fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() =>
    expect(screen.queryByPlaceholderText('Enter Draft notes')).toBeNull()
  );
  await fireEvent.click(screen.getByRole('button', { name: 'Add property' }));
  expect(screen.getByText('Draft notes')).toBeTruthy();
  expect(values['draft-notes']).toEqual({
    valueType: 'STRING',
    value: 'Remember this',
  });
  expect(entityWrite).not.toHaveBeenCalled();
});

it('creates a property through the shared dialog and saves its value into the draft', async () => {
  const onAdd = vi.fn(async () => {});
  const [values, setValues] = createStore<Record<string, PropertyApiValues>>(
    {}
  );
  render(() => (
    <PropertiesProvider
      entityType="TASK"
      canEdit
      properties={() => []}
      onRefresh={() => {}}
      onPropertyAdded={() => {}}
      onPropertyDeleted={() => {}}
      saveHandler={{ saveProperty: async () => {}, saveDate: async () => {} }}
    >
      <TaskComposerPropertyEditor
        name="New task"
        definitions={[]}
        properties={[]}
        onAdd={onAdd}
        onSave={(id, value) => setValues(id, value)}
      />
    </PropertiesProvider>
  ));

  await fireEvent.click(screen.getByRole('button', { name: 'Add property' }));
  await fireEvent.input(screen.getByPlaceholderText('Choose a property...'), {
    target: { value: 'New notes' },
  });
  await fireEvent.click(screen.getByText('Create property "New notes"'));
  await fireEvent.click(
    screen.getByRole('button', { name: 'Create New notes' })
  );
  await waitFor(() =>
    expect(onAdd).toHaveBeenCalledWith(
      'created-notes',
      expect.objectContaining({
        definition: expect.objectContaining({
          id: 'created-notes',
          is_multi_select: false,
        }),
        property_options: [],
      })
    )
  );
  await fireEvent.input(await screen.findByPlaceholderText('Enter New notes'), {
    target: { value: 'Created value' },
  });
  await fireEvent.click(screen.getByText('Set New notes', { exact: false }));
  expect(values['created-notes']).toEqual({
    valueType: 'STRING',
    value: 'Created value',
  });
  expect(entityWrite).not.toHaveBeenCalled();
});
