import LightningIcon from '@phosphor/lightning.svg';
import LightningFillIcon from '@phosphor-fill/lightning-fill.svg';
import { Button, cn } from '@ui';
import { Show } from 'solid-js';
import { useHomeView } from '../home-view-context';

/** Switches desktop Home between its sidebar list and the full-width inbox. */
export function HomeInboxModeToggle() {
  const { inboxMode, setInboxMode } = useHomeView();
  const label = () => (inboxMode() ? 'Exit inbox mode' : 'Inbox mode');

  return (
    <Button
      variant="ghost"
      size="sm"
      square
      label={label()}
      aria-pressed={inboxMode()}
      class={cn('shrink-0', inboxMode() && 'bg-accent/10 text-accent')}
      onClick={() => setInboxMode(!inboxMode())}
    >
      <Show when={inboxMode()} fallback={<LightningIcon class="size-4" />}>
        <LightningFillIcon class="size-4" />
      </Show>
    </Button>
  );
}
