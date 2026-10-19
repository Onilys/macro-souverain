import { DiffCounts } from '@app/components/diff-view';
import GitBranchIcon from '@phosphor/git-branch.svg';
import { Button } from '@ui';
import { describeFileCount } from '../core/changeset';

/** Composer-row chip that opens and closes the Changes pane. */
export function ChangesReadyChip(props: {
  fileCount: number;
  additions: number;
  deletions: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label="Review changes"
      aria-pressed={props.open}
      tooltip={props.open ? 'Hide the changes pane' : 'Review changes'}
      // Matches the model pill beside it.
      class="h-6 min-w-0 gap-1.5 rounded-full border-transparent bg-ink/5 px-2 text-sm text-ink-subtle hover:bg-ink/10 aria-pressed:bg-accent/15 aria-pressed:text-accent aria-pressed:[--color-active:transparent]"
      onClick={() => props.onToggle()}
    >
      <GitBranchIcon class="size-3.5 shrink-0" />
      <span class="truncate">{describeFileCount(props.fileCount)}</span>
      <DiffCounts additions={props.additions} deletions={props.deletions} />
    </Button>
  );
}
