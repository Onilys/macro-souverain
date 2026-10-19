import { useSplitLayout } from '@components/app/split-layout/layout';
import { toast } from '@core/component/Toast/Toast';
import { fireAndForget } from '@core/util/fireAndForget';
import { Button, Dialog } from '@ui';
import { createSignal, Show } from 'solid-js';
import { useProjectsContext } from '../context/projects-context';
import { projectRouteId } from '../core/route';

export function ConvertToProject(props: {
  taskId: string;
  taskName: string;
  onClose(): void;
}) {
  const commands = useProjectsContext().createCommands();
  const { replaceOrInsertSplit } = useSplitLayout();
  const [error, setError] = createSignal<string>();

  const convert = async () => {
    if (commands.pending()) return;
    setError(undefined);
    try {
      const project = await commands.convertTask(props.taskId);
      toast.success('Converted to project');
      props.onClose();
      replaceOrInsertSplit(
        {
          type: 'component',
          id: projectRouteId({ id: project.id, section: 'overview' }),
        },
        'entity-actions-menu'
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not convert to project');
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !commands.pending()) props.onClose();
      }}
      class="max-w-md"
    >
      <div class="flex flex-col gap-4 p-4">
        <Dialog.Title>Convert to project</Dialog.Title>
        <p class="text-sm text-ink-muted">
          "{props.taskName || 'Untitled'}" becomes a project. Its description,
          properties and comments move to the project, its subtasks join it, and
          the task moves to the trash. A project can't be turned back into a
          task.
        </p>
        <Show when={error()}>
          {(err) => (
            <p role="alert" class="text-sm text-failure">
              {err()}
            </p>
          )}
        </Show>
        <div class="flex justify-end gap-2">
          <Button
            variant="ghost"
            disabled={commands.pending()}
            onClick={props.onClose}
          >
            Cancel
          </Button>
          <Button
            variant="cta"
            disabled={commands.pending()}
            onClick={() => fireAndForget(convert(), 'projects')}
          >
            {commands.pending() ? 'Converting…' : 'Convert'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
