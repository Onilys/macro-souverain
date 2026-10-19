import { CreateMenuItem } from '@app/components/view-shell/CreateMenuItem';
import { SidebarCreateAction } from '@app/components/view-shell/SidebarCreateAction';
import { createTaskWithProperties } from '@app/features/block-md/util/taskComposerProperties';
import { useSplitLayout } from '@components/app/split-layout/layout';
import { toast } from '@core/component/Toast/Toast';
import TaskIcon from '@icon/system/regular/check-square.svg';
import ProjectIcon from '@icon/system/regular/folder.svg';
import TagIcon from '@icon/system/regular/tag-simple.svg';
import SubtaskIcon from '@icon/system/regular/tree-structure.svg';
import { SYSTEM_PROPERTY_IDS } from '@property/constants';
import { PropertyEntitySelector } from '@property/editors/selectors/PropertyEntitySelector';
import { TagEditorDialog } from '@property/tags/TagEditorDialog';
import { fetchEntityProperties } from '@queries/properties/entity';
import { useCurrentTeamQuery } from '@queries/team/teams';
import { EntityType } from '@service-properties/generated/schemas/entityType';
import { Dialog, Dropdown } from '@ui';
import { createSignal } from 'solid-js';

export function TasksCreateMenu(props: {
  projectsEnabled: boolean;
  onCreateTask: () => void;
}) {
  const layout = useSplitLayout();
  const team = useCurrentTeamQuery();
  const [parentPickerOpen, setParentPickerOpen] = createSignal(false);
  const [tagEditorOpen, setTagEditorOpen] = createSignal(false);
  const createSubtask = (parentId: string) => {
    setParentPickerOpen(false);
    const create: typeof createTaskWithProperties = async (
      title,
      content,
      values,
      definitions,
      history,
      options
    ) => {
      const created = await createTaskWithProperties(
        title,
        content,
        [
          ...values.filter(([id]) => id !== SYSTEM_PROPERTY_IDS.PARENT_TASK),
          [
            SYSTEM_PROPERTY_IDS.PARENT_TASK,
            {
              valueType: 'ENTITY',
              refs: [{ entity_id: parentId, entity_type: EntityType.TASK }],
            },
          ],
        ],
        definitions,
        history,
        options
      );
      if (created) {
        const properties = await fetchEntityProperties(
          'TASK',
          created.documentId
        ).catch(() => undefined);
        const parent = properties?.find(
          (property) =>
            property.propertyDefinitionId === SYSTEM_PROPERTY_IDS.PARENT_TASK
        );
        const linked =
          parent?.valueType === 'ENTITY' &&
          parent.value?.some(
            (ref) =>
              ref.entity_id === parentId && ref.entity_type === EntityType.TASK
          );
        if (!linked)
          toast.failure(
            'Task created, but its parent could not be confirmed. Open the task to set its parent; do not create it again.'
          );
      }
      return created;
    };
    layout.popoverSplit({
      type: 'component',
      id: 'task-compose',
      params: { createTask: create },
    });
  };
  return (
    <>
      <Dropdown placement="bottom-start">
        <Dropdown.Trigger
          as={SidebarCreateAction}
          aria-label="Create task, subtask, project, or tag"
        >
          New
        </Dropdown.Trigger>
        <Dropdown.Content
          class="w-80 max-w-[calc(100vw-2rem)]"
          onCloseAutoFocus={(event) => {
            if (parentPickerOpen() || tagEditorOpen()) event.preventDefault();
          }}
        >
          <Dropdown.Group>
            <CreateMenuItem
              icon={TaskIcon}
              title="New Task"
              description="Track a standalone piece of work."
              onSelect={props.onCreateTask}
            />
            <CreateMenuItem
              icon={SubtaskIcon}
              title="New Subtask"
              description="Choose a parent task and break its work into a smaller step."
              onSelect={() => setParentPickerOpen(true)}
            />
            <CreateMenuItem
              icon={ProjectIcon}
              title="New Project"
              description="Group related tasks around a shared goal."
              disabled={!props.projectsEnabled}
              onSelect={() =>
                layout.popoverSplit({
                  type: 'component',
                  id: 'project-compose',
                })
              }
            />
            <CreateMenuItem
              icon={TagIcon}
              title="New Tag"
              description="Label work so you can organize and filter it across projects."
              onSelect={() => setTagEditorOpen(true)}
            />
          </Dropdown.Group>
        </Dropdown.Content>
      </Dropdown>
      <Dialog
        open={parentPickerOpen()}
        onOpenChange={setParentPickerOpen}
        class="w-96 max-w-[calc(100vw-2rem)] p-4"
      >
        <Dialog.Title class="mb-3 text-base font-semibold">
          Choose a parent task
        </Dialog.Title>
        <PropertyEntitySelector
          config={{
            isMultiSelect: false,
            specificEntityType: EntityType.TASK,
            placeholder: 'Search tasks',
          }}
          onClose={() => setParentPickerOpen(false)}
          selectedOptions={() => new Set<string>()}
          setSelectedOptions={(ids) => {
            const id = ids.values().next().value;
            if (id) createSubtask(id);
          }}
        />
      </Dialog>
      <TagEditorDialog
        open={tagEditorOpen()}
        mode={{ type: 'create', initialScope: 'user' }}
        teamAvailable={team.isSuccess && Boolean(team.data?.team)}
        onClose={() => setTagEditorOpen(false)}
      />
    </>
  );
}
