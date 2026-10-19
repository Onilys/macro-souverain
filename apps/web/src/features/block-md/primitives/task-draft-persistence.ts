import { debounce } from '@solid-primitives/scheduled';
import { type Accessor, createEffect, on, onCleanup } from 'solid-js';
import type { TaskComposerDraft } from '../util/taskComposerStorage';

/** Flush on every kind of dismissal; submission owns its retry snapshot. */
export function createTaskDraftPersistence(args: {
  draft: Accessor<Omit<TaskComposerDraft, 'timestamp'>>;
  submitting: Accessor<boolean>;
  save(draft: Omit<TaskComposerDraft, 'timestamp'>): void;
}) {
  const save = debounce(args.save, 300);
  createEffect(
    on([args.draft, args.submitting], ([draft, submitting]) => {
      save.clear();
      if (!submitting) save(draft);
    })
  );
  onCleanup(() => {
    save.clear();
    if (!args.submitting()) args.save(args.draft());
  });
}
