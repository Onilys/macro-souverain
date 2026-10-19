import { Button } from '@ui';

/** Toggles the changes pane; totals live beside the pane's branch range. */
export function ChangesToggleButton(props: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      variant={props.open ? 'accent' : 'ghost'}
      size="sm"
      aria-pressed={props.open}
      tooltip={props.open ? 'Hide the changes pane' : 'Show the changes pane'}
      // Sits beside the `h-7` pull request label; the `sm` frame is 4px shorter.
      // Preserve pressed semantics without stacking a foreground overlay on the tint.
      class="h-7 aria-pressed:[--color-active:transparent]"
      onClick={() => props.onToggle()}
    >
      Changes
    </Button>
  );
}
