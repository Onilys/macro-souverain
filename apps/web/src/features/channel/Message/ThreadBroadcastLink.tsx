import ArrowBendUpLeftIcon from '@phosphor/arrow-bend-up-left.svg';
import { cn } from '@ui';
import { Show } from 'solid-js';
import { useMessage } from './context';

type ThreadBroadcastLinkProps = {
  class?: string;
  onNavigateToThread?: (threadRootId: string) => void;
};

/**
 * Shows "Replied to a thread" indicator when the message is a broadcast copy
 * of a thread reply. Clicking it navigates to the original thread.
 */
export function ThreadBroadcastLink(props: ThreadBroadcastLinkProps) {
  const message = useMessage();
  const broadcastFrom = () => message().broadcast_from_thread ?? undefined;

  const handleClick = (event: MouseEvent) => {
    event.stopPropagation();
    const threadRootId = broadcastFrom();
    if (threadRootId) {
      props.onNavigateToThread?.(threadRootId);
    }
  };

  return (
    <Show when={broadcastFrom()}>
      <button
        type="button"
        class={cn(
          'inline-flex items-center gap-1 text-xs text-ink-muted hover:text-accent',
          props.class
        )}
        title="Go to thread"
        onClick={handleClick}
      >
        <ArrowBendUpLeftIcon class="size-3" aria-hidden />
        <span>Replied to a thread</span>
      </button>
    </Show>
  );
}
