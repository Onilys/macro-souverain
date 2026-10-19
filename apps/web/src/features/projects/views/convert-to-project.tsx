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
  const context = useProjectsContext();
  const commands = context.createCommands();
  const { replaceOrInsertSplit } = useSplitLayout();
  const [error, setError] = createSignal<string>();
  const [pending, setPending] = createSignal(false);

  const convert = async () => {
    if (pending()) return;
    setPending(true);
    setError(undefined);

    try {
      const project = await commands.create({
        name: props.taskName || 'Untitled project',
        description: '',
        shareWithTeam: true,
        properties: [],
      });

      await commands.assignTasks(project.id, [props.taskId]);

      toast.success('Converted to project');
      props.onClose();

      replaceOrInsertSplit(
        {
          type: 'component',
          id: projectRouteId({ id: project.id, section: 'tasks' }),
        },
        'entity-actions-menu'
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not convert to project');
      setPending(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending()) props.onClose();
      }}
      class="max-w-md"
    >
      <div class="flex flex-col gap-4 p-4">
        <Dialog.Title>Convert to project</Dialog.Title>
        <p class="text-sm text-ink-muted">
          This will create a new project named "{props.taskName || 'Untitled'}"
          and add this task to it.
        </p>
        <Show when={error()}>
          {(err) => (
            <p role="alert" class="text-sm text-failure">
              {err()}
            </p>
          )}
        </Show>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" disabled={pending()} onClick={props.onClose}>
            Cancel
          </Button>
          <Button
            variant="cta"
            disabled={pending()}
            onClick={() => fireAndForget(convert(), 'projects')}
          >
            {pending() ? 'Converting…' : 'Convert'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
