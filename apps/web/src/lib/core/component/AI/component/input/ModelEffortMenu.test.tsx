/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@solidjs/testing-library';
import { Dropdown } from '@ui';
import { createSignal } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { type ModelEffortConfig, ModelEffortMenu } from './ModelEffortMenu';

const config: ModelEffortConfig = {
  id: 'runtime-effort',
  name: 'Power',
  category: 'thought_level',
  type: 'select',
  description: null,
  currentValue: 'low',
  options: [
    { name: 'Low', value: 'low', group: null, description: null },
    { name: 'High', value: 'high', group: null, description: null },
    { name: 'Max', value: 'max', group: null, description: null },
  ],
};
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.stubGlobal('scrollTo', vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setup(disabled = false) {
  const change = vi.fn();
  const [value, setValue] = createSignal('low');
  render(() => (
    <>
      <style>
        {'[role="menu"] { animation-name: none; transition-duration: 0s; }'}
      </style>
      <Dropdown>
        <Dropdown.Trigger>Model settings</Dropdown.Trigger>
        <Dropdown.Content>
          <ModelEffortMenu
            model="gpt-5"
            label="GPT-5"
            config={config}
            value={value()}
            disabled={disabled}
            onChange={(next) => {
              change(next);
              setValue(next);
            }}
          >
            <Dropdown.Item onSelect={() => change('other-model')}>
              Other model
            </Dropdown.Item>
          </ModelEffortMenu>
        </Dropdown.Content>
      </Dropdown>
    </>
  ));
  fireEvent.keyDown(screen.getByRole('button', { name: 'Model settings' }), {
    key: 'Enter',
  });
  return change;
}

it('adjusts named effort stops with the keyboard without dismissing the menu', async () => {
  const change = setup();
  const slider = await screen.findByRole('slider', {
    name: 'Reasoning effort',
  });
  slider.focus();
  expect(slider.getAttribute('aria-valuetext')).toBe('Low');
  fireEvent.keyDown(slider, { key: 'ArrowRight' });
  expect(change).toHaveBeenLastCalledWith('high');
  expect(slider.getAttribute('aria-valuetext')).toBe('High');
  expect(screen.getByRole('menu')).toBeTruthy();
  fireEvent.keyDown(slider, { key: 'ArrowRight' });
  expect(change).toHaveBeenLastCalledWith('max');
  fireEvent.keyDown(slider, { key: 'ArrowRight' });
  expect(change).toHaveBeenLastCalledWith('max');
  fireEvent.keyDown(slider, { key: 'ArrowLeft' });
  fireEvent.keyDown(slider, { key: 'ArrowLeft' });
  expect(change).toHaveBeenLastCalledWith('low');
});

it('opens the catalog, returns to effort, and dismisses with Escape', async () => {
  setup();
  fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Choose model' }), {
    key: 'Enter',
  });
  expect(screen.getByRole('menuitem', { name: 'Other model' })).toBeTruthy();
  expect(screen.queryByRole('slider', { name: 'Reasoning effort' })).toBeNull();
  fireEvent.keyDown(
    screen.getByRole('menuitem', { name: 'Model and effort' }),
    { key: 'Enter' }
  );
  const slider = screen.getByRole('slider', { name: 'Reasoning effort' });
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole('menuitem', { name: 'Choose model' })
    )
  );
  fireEvent.keyDown(slider, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
});

it('does not change a disabled effort control', () => {
  const change = setup(true);
  fireEvent.keyDown(screen.getByRole('slider', { name: 'Reasoning effort' }), {
    key: 'ArrowRight',
  });
  expect(change).not.toHaveBeenCalled();
});

it('shows the catalog directly for a model with no effort configuration', () => {
  render(() => (
    <Dropdown>
      <Dropdown.Trigger>Model settings</Dropdown.Trigger>
      <Dropdown.Content>
        <ModelEffortMenu label="Basic model">
          <Dropdown.Item>Basic model</Dropdown.Item>
        </ModelEffortMenu>
      </Dropdown.Content>
    </Dropdown>
  ));
  fireEvent.keyDown(screen.getByRole('button', { name: 'Model settings' }), {
    key: 'Enter',
  });
  expect(screen.getByRole('menuitem', { name: 'Basic model' })).toBeTruthy();
  expect(screen.queryByRole('slider')).toBeNull();
});
