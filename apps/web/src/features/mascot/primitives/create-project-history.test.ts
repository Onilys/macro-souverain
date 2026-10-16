import { createRoot } from 'solid-js';
import { expect, it, vi } from 'vitest';
import { validateProject } from '../core/project';
import fixture from '../fixtures/project.json';
import { createProjectHistory } from './create-project-history';

it('groups repeated edits, supports focused undo, invalidates redo and saves on disposal', () => {
  const storage = { getItem: () => null, setItem: vi.fn() };
  createRoot((dispose) => {
    const h = createProjectHistory(validateProject(fixture), storage);
    h.begin();
    h.edit((p) => {
      p.name = 'a';
    });
    h.edit((p) => {
      p.name = 'b';
    });
    h.undo();
    expect(h.project().name).toBe(fixture.name);
    h.redo();
    expect(h.project().name).toBe('b');
    h.transaction((p) => {
      p.name = 'c';
    });
    expect(h.canRedo()).toBe(false);
    h.undo();
    expect(h.project().name).toBe('b');
    dispose();
    expect(JSON.parse(storage.setItem.mock.calls.at(-1)![1]).name).toBe('b');
  });
});
