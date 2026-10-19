import { debounce } from '@solid-primitives/scheduled';
import {
  type Accessor,
  createEffect,
  createSignal,
  on,
  onCleanup,
} from 'solid-js';
import type { TaskComposerDraft } from '../util/taskComposerStorage';

/** Flush on every kind of dismissal; submission owns its retry snapshot. */
export function createTaskDraftPersistence(args: {
  draft: Accessor<Omit<TaskComposerDraft, 'timestamp'>>;
  save(draft: Omit<TaskComposerDraft, 'timestamp'>): void;
}) {
  const [submitted, setSubmitted] = createSignal(false);
  const save = debounce(args.save, 300);
  createEffect(
    on([args.draft, submitted], ([draft, submitted]) => {
      save.clear();
      if (!submitted) save(draft);
    })
  );
  onCleanup(() => {
    save.clear();
    if (!submitted()) args.save(args.draft());
  });
  return {
    active: () => !submitted(),
    beginSubmission() {
      save.clear();
      setSubmitted(true);
    },
    startNewDraft() {
      setSubmitted(false);
    },
  };
}
