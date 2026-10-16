import { createSignal, onCleanup } from 'solid-js';
import { parseProject, validateProject } from '../core/project';
import type { Project } from '../core/types';

const STORAGE_KEY = 'macro:mascot:variant:v2';
export function createProjectHistory(
  initial: Project,
  storage?: Pick<Storage, 'getItem' | 'setItem'>
) {
  let start = initial;
  let initialError: string | undefined;
  try {
    const saved = storage?.getItem(STORAGE_KEY);
    if (saved) start = parseProject(saved);
  } catch (error) {
    initialError =
      error instanceof Error ? error.message : 'Local project unavailable';
  }
  const [project, setProject] = createSignal(start);
  const [error, setError] = createSignal(initialError);
  const [saved, setSaved] = createSignal(true);
  const [undoStack, setUndoStack] = createSignal<Project[]>([]);
  const [redoStack, setRedoStack] = createSignal<Project[]>([]);
  let before: Project | undefined;
  const [pending, setPending] = createSignal(false);
  let changed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const persist = () => {
    clearTimeout(timer);
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(project()));
      setSaved(true);
    } catch {
      setError(
        'Local saving is unavailable. Download JSON to keep your changes.'
      );
    }
  };
  const scheduleSave = () => {
    changed = true;
    setSaved(false);
    clearTimeout(timer);
    timer = setTimeout(persist, 200);
  };
  const begin = () => {
    before ??= structuredClone(project());
    setPending(true);
  };
  const finish = () => {
    if (before && JSON.stringify(before) !== JSON.stringify(project())) {
      setUndoStack((stack) => [...stack.slice(-39), before!]);
      setRedoStack([]);
    }
    before = undefined;
    setPending(false);
  };
  const cancel = () => {
    if (before) {
      setProject(before);
      scheduleSave();
    }
    before = undefined;
    setPending(false);
  };
  const edit = (change: (draft: Project) => void) => {
    begin();
    const draft = structuredClone(project());
    change(draft);
    setProject(draft);
    scheduleSave();
  };
  const transaction = (change: (draft: Project) => void) => {
    finish();
    edit(change);
    finish();
  };
  const undo = () => {
    finish();
    const stack = undoStack();
    const last = stack.at(-1);
    if (!last) return;
    setRedoStack((stack) => [...stack, project()]);
    setUndoStack(stack.slice(0, -1));
    setProject(last);
    scheduleSave();
  };
  const redo = () => {
    finish();
    const stack = redoStack();
    const last = stack.at(-1);
    if (!last) return;
    setUndoStack((stack) => [...stack, project()]);
    setRedoStack(stack.slice(0, -1));
    setProject(last);
    scheduleSave();
  };
  const replace = (value: unknown) => {
    const next = validateProject(value);
    finish();
    begin();
    setProject(next);
    finish();
    setError(undefined);
    scheduleSave();
  };
  onCleanup(() => {
    clearTimeout(timer);
    if (changed) persist();
  });
  return {
    project,
    error,
    setError,
    saved,
    begin,
    edit,
    finish,
    cancel,
    transaction,
    undo,
    redo,
    replace,
    canUndo: () => pending() || undoStack().length > 0,
    canRedo: () => redoStack().length > 0,
  };
}
export type ProjectHistory = ReturnType<typeof createProjectHistory>;
