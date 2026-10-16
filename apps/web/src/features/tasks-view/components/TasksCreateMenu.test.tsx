import { SYSTEM_PROPERTY_IDS } from '@property/constants';
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { type ParentProps, Show } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TasksCreateMenu } from './TasksCreateMenu';

const mocks = vi.hoisted(() => ({
  popover: vi.fn(),
  create: vi.fn(),
  properties: vi.fn(),
  failure: vi.fn(),
}));
vi.mock('@queries/properties/entity', () => ({
  fetchEntityProperties: mocks.properties,
}));
vi.mock('@core/component/Toast/Toast', () => ({
  toast: { failure: mocks.failure },
}));
vi.mock('@components/app/split-layout/layout', () => ({
  useSplitLayout: () => ({ popoverSplit: mocks.popover }),
}));
vi.mock('@app/features/block-md/util/taskComposerProperties', () => ({
  createTaskWithProperties: mocks.create,
}));
vi.mock('@queries/team/teams', () => ({
  useCurrentTeamQuery: () => ({ isSuccess: true, data: { team: {} } }),
}));
vi.mock('@app/components/view-shell/SidebarCreateAction', () => ({
  SidebarCreateAction: (props: ParentProps) => (
    <button {...props}>{props.children}</button>
  ),
}));
vi.mock('@property/editors/selectors/PropertyEntitySelector', () => ({
  PropertyEntitySelector: (props: {
    setSelectedOptions: (ids: Set<string>) => void;
  }) => (
    <button onClick={() => props.setSelectedOptions(new Set(['parent-1']))}>
      Choose parent
    </button>
  ),
}));
vi.mock('@property/tags/TagEditorDialog', () => ({
  TagEditorDialog: (props: { open: boolean }) => (
    <Show when={props.open}>
      <div role="dialog" aria-label="New tag" />
    </Show>
  ),
}));
vi.mock('@ui', async () => {
  const Dialog = Object.assign(
    (props: ParentProps<{ open: boolean }>) => (
      <Show when={props.open}>
        <div role="dialog">{props.children}</div>
      </Show>
    ),
    { Title: (props: ParentProps) => <h2>{props.children}</h2> }
  );
  return {
    ...(await import('../../../components/ui/components/Dropdown')),
    ...(await import('../../../components/ui/components/Layer')),
    ...(await import('../../../components/ui/utils/classname')),
    Dialog,
  };
});
vi.mock('../../../components/ui/components/Tooltip', () => ({
  Tooltip: (props: ParentProps) => props.children,
}));
vi.mock('@core/mobile/isTouchDevice', () => ({ isTouchDevice: () => false }));
beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('offers four described actions and opens the tag editor', async () => {
  render(() => <TasksCreateMenu projectsEnabled onCreateTask={vi.fn()} />);
  fireEvent.keyDown(
    screen.getByRole('button', {
      name: 'Create task, subtask, project, or tag',
    }),
    { key: 'Enter' }
  );
  for (const name of ['New Task', 'New Subtask', 'New Project', 'New Tag']) {
    expect(
      await screen.findByRole('menuitem', { name: new RegExp(name) })
    ).toBeTruthy();
  }
  fireEvent.keyDown(screen.getByRole('menuitem', { name: /New Tag/ }), {
    key: 'Enter',
  });
  expect(await screen.findByRole('dialog', { name: 'New tag' })).toBeTruthy();
});

it('creates a subtask through the composer with its selected parent', async () => {
  render(() => <TasksCreateMenu projectsEnabled onCreateTask={vi.fn()} />);
  fireEvent.keyDown(
    screen.getByRole('button', {
      name: 'Create task, subtask, project, or tag',
    }),
    { key: 'Enter' }
  );
  fireEvent.keyDown(
    await screen.findByRole('menuitem', { name: /New Subtask/ }),
    { key: 'Enter' }
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Choose parent' }));
  const request = mocks.popover.mock.calls[0][0];
  expect(request.id).toBe('task-compose');
  const definitions = new Map();
  const history = vi.fn();
  mocks.create.mockResolvedValue({ documentId: 'child-1' });
  mocks.properties.mockResolvedValue([]);
  await request.params.createTask('Step', 'Details', [], definitions, history);
  expect(mocks.failure).toHaveBeenCalledWith(
    expect.stringContaining('Task created')
  );
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(mocks.create).toHaveBeenCalledWith(
    'Step',
    'Details',
    [
      [
        SYSTEM_PROPERTY_IDS.PARENT_TASK,
        {
          valueType: 'ENTITY',
          refs: [{ entity_id: 'parent-1', entity_type: 'TASK' }],
        },
      ],
    ],
    definitions,
    history,
    undefined
  );
  mocks.failure.mockClear();
  mocks.properties.mockResolvedValue([
    {
      propertyDefinitionId: SYSTEM_PROPERTY_IDS.PARENT_TASK,
      valueType: 'ENTITY',
      value: [{ entity_id: 'parent-1', entity_type: 'TASK' }],
    },
  ]);
  await request.params.createTask('Step', 'Details', [], definitions, history);
  expect(mocks.failure).not.toHaveBeenCalled();
});

it('keeps project creation disabled when projects are unavailable', async () => {
  render(() => (
    <TasksCreateMenu projectsEnabled={false} onCreateTask={vi.fn()} />
  ));
  fireEvent.keyDown(
    screen.getByRole('button', {
      name: 'Create task, subtask, project, or tag',
    }),
    { key: 'Enter' }
  );
  const project = await screen.findByRole('menuitem', { name: /New Project/ });
  expect(project.getAttribute('aria-disabled')).toBe('true');
  fireEvent.keyDown(project, { key: 'Enter' });
  expect(mocks.popover).not.toHaveBeenCalled();
});
