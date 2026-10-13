# Inline task experiences

The app-facing entry point, `inline-tasks.ts`, selects one task experience for
each document/task editor. The shared Lexical shell accepts presentation slots;
it does not read the rollout flag or import this feature.

## Standard experience

The standard experience supplies no mention override, no extra slash actions,
and no editor extension. The existing task icon, underlined/clickable name,
trailing status/priority/assignee badges, composer, and keyboard behavior remain
in the shared shell. Other editor hosts also use this experience.

## Inline experience

The inline experience supplies the task preview, static fallback, and trigger
components together with the ghost-draft extension and `/task` override. Its views
own status/title editing, draft UI, and badges. Its primitives own task navigation
and draft commands. Shared previews, permission checks, hover cards, task APIs,
and document serialization remain shared.

Ghost titles and pending request state belong to the editor, not to document
nodes. Persisted content continues to use ordinary paragraphs and task mentions.

## Rollout and lifecycle

- PostHog key: `enable-inline-tasks`.
- Local override: `VITE_ENABLE_INLINE_TASKS=true` or `false`; restart Vite after
  changing its environment.
- The remote default is omitted. Unknown or pending flags use the standard
  experience. Configure the PostHog flag as disabled before rollout; no PostHog
  project settings were changed by this implementation.
- The selected experience is immutable for an open editor. If flags are pending
  at selection time, that editor stays standard even after flags load.
- Refreshed flags apply to the next editor opened. The SDK can initially serve
  cached flag values; this is not an immediate kill switch for open editors.
- A flag refresh does not unmount a dirty title, discard a ghost, or interrupt
  pending creation. Closing the editor still has the experiment's existing
  limitation: a completed creation can lack a mention after disposal.
- The flag controls frontend behavior, not access or data visibility. Disabling
  it does not delete tasks or undo edits.

No checks, builds, tests, formatting, lint, probes, or browser verification ran.
