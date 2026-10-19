/**
 * Host-composed opener, changes-ready chip, and optional agent notes dock.
 * Each renders nothing without a controller or when the host cannot have changes.
 * Agent-only actions require the explicit note-sending capability.
 */

import { createSignal, Show } from 'solid-js';
import { ChangesReadyChip } from '../components/ChangesReadyChip';
import { ChangesToggleButton } from '../components/ChangesToggleButton';
import { ReviewNotesChip } from '../components/ReviewNotesChip';
import { useOptionalChanges } from '../context/changes-controller';

export function ChangesToggle() {
  const controller = useOptionalChanges();
  if (!controller) return null;
  const { available, layout } = controller;
  return (
    <Show when={available()}>
      <ChangesToggleButton
        open={layout.changesVisible()}
        onToggle={layout.toggle}
      />
    </Show>
  );
}

/** Shown while the changeset has files; toggles the pane. */
export function ChangesHandoff() {
  const controller = useOptionalChanges();
  if (!controller) return null;
  const { available, layout, model, review } = controller;
  return (
    <Show when={available() && model.files().length > 0}>
      <ChangesReadyChip
        fileCount={model.files().length}
        additions={controller.changeCounts()?.additions ?? 0}
        deletions={controller.changeCounts()?.deletions ?? 0}
        open={layout.changesVisible()}
        onToggle={() => {
          if (layout.changesVisible()) {
            layout.close();
            return;
          }
          const first = model.files()[0];
          layout.open();
          if (first) review.activate(first.path);
        }}
      />
    </Show>
  );
}

export function ReviewNotesDock() {
  const controller = useOptionalChanges();
  const [expanded, setExpanded] = createSignal(false);
  if (!controller) return null;
  const { available, review, context, layout } = controller;
  return (
    <Show
      when={available() && context.host.agent && review.queued().length > 0}
    >
      <ReviewNotesChip
        notes={review.queued()}
        expanded={expanded()}
        disabled={!context.host.agent?.canSend()}
        onToggleExpanded={() => setExpanded((open) => !open)}
        onUpdate={review.updateNote}
        onRemove={review.removeNote}
        onSend={controller.sendQueuedNotes}
        onOpenNote={(note) => {
          layout.open();
          review.activate(note.path);
        }}
      />
    </Show>
  );
}
