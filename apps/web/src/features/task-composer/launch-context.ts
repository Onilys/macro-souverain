import { globalSplitManager } from '@app/signal/splitLayout';
import type { SplitManager } from '@components/app/split-layout/layoutManager';
import { type Accessor, untrack } from 'solid-js';
import type { TaskComposerContext } from './core/context';

type Registration = { source: Accessor<TaskComposerContext | undefined> };

// Registrations live only as long as their pane owners and never enter history.
const registries = new WeakMap<SplitManager, Map<string, Registration[]>>();

/** Register a live preset for a pane. Dispose on unmount to restore its parent. */
export function registerTaskComposerContext(
  manager: SplitManager,
  paneId: string,
  source: Accessor<TaskComposerContext | undefined>
): () => void {
  let panes = registries.get(manager);
  if (!panes) {
    panes = new Map();
    registries.set(manager, panes);
  }
  let registrations = panes.get(paneId);
  if (!registrations) {
    registrations = [];
    panes.set(paneId, registrations);
  }
  const registration = { source };
  registrations.push(registration);
  return () => {
    const index = registrations.indexOf(registration);
    if (index === -1) return;
    registrations.splice(index, 1);
    if (registrations.length === 0) panes.delete(paneId);
    if (panes.size === 0) registries.delete(manager);
  };
}

/** Read plain preset data once, before opening the composer moves focus. */
export function snapshotTaskComposerContext(
  paneId?: string
): TaskComposerContext | undefined {
  const manager = globalSplitManager();
  if (!manager) return;
  const id = paneId ?? manager.activeSplit()?.id;
  if (!id) return;
  const registration = registries.get(manager)?.get(id)?.at(-1);
  if (!registration) return;
  const context = untrack(registration.source);
  return context ? structuredClone(context) : undefined;
}
