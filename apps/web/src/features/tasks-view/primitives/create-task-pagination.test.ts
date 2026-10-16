import { createRoot, createSignal } from 'solid-js';
import { expect, it, vi } from 'vitest';
import { createTaskPagination } from './create-task-pagination';

it('coalesces demand per column while allowing visible columns to load independently', async () => {
  let finish!: () => void;
  const response = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const load = vi.fn(() => response);
  const state = createRoot((dispose) => ({
    dispose,
    pagination: createTaskPagination({
      identity: () => 'view',
      error: () => undefined,
      load,
    }),
  }));
  const a = state.pagination.load('a');
  await state.pagination.load('a');
  const b = state.pagination.load('b');
  expect(load.mock.calls).toEqual([
    ['a', false],
    ['b', false],
  ]);
  expect(state.pagination.isLoading('a')).toBe(true);
  finish();
  await Promise.all([a, b]);
  expect(state.pagination.isLoading('a')).toBe(false);
  state.dispose();
});

it('pauses failed column and global demands until retry without blocking another column', async () => {
  const load = vi.fn(async (): Promise<void> => {
    throw new Error('unavailable');
  });
  const state = createRoot((dispose) => ({
    dispose,
    pagination: createTaskPagination({
      identity: () => 'view',
      error: () => undefined,
      load,
    }),
  }));
  await state.pagination.load('a');
  await state.pagination.load('a');
  await state.pagination.load();
  await state.pagination.load();
  expect(load).toHaveBeenCalledTimes(2);
  expect(state.pagination.error('a')).toBe(true);
  await state.pagination.load('b');
  expect(load).toHaveBeenCalledTimes(3);
  load.mockImplementation(async () => undefined);
  await state.pagination.load('a', true);
  await state.pagination.load(undefined, true);
  expect(state.pagination.error('a')).toBe(false);
  expect(state.pagination.error()).toBe(false);
  state.dispose();
});

it('ignores old request failures after changing filters or disposing the board', async () => {
  let reject!: (error: Error) => void;
  const response = new Promise<void>((_, fail) => {
    reject = fail;
  });
  const [identity, setIdentity] = createSignal('old');
  const load = vi.fn(() => response);
  const state = createRoot((dispose) => ({
    dispose,
    pagination: createTaskPagination({
      identity,
      error: () => undefined,
      load,
    }),
  }));
  const old = state.pagination.load('a');
  setIdentity('new');
  load.mockImplementation(async () => undefined);
  await state.pagination.load('a');
  reject(new Error('old failure'));
  await old;
  expect(state.pagination.error('a')).toBe(false);
  expect(state.pagination.isLoading('a')).toBe(false);
  state.dispose();
  await state.pagination.load('b');
  expect(load).toHaveBeenCalledTimes(2);
});

it('resets demand when returning to a previous filter while its old request is still pending', async () => {
  let finish!: () => void;
  const response = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const [identity, setIdentity] = createSignal('a');
  const load = vi.fn(() => response);
  const state = createRoot((dispose) => ({
    dispose,
    pagination: createTaskPagination({
      identity,
      error: () => undefined,
      load,
    }),
  }));
  const old = state.pagination.load('group');
  setIdentity('b');
  setIdentity('a');
  expect(state.pagination.isLoading('group')).toBe(false);
  load.mockImplementation(async () => undefined);
  await state.pagination.load('group');
  expect(load).toHaveBeenCalledTimes(2);
  finish();
  await old;
  expect(state.pagination.isLoading('group')).toBe(false);
  state.dispose();
});
