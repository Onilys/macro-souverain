/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
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
  vi.stubGlobal('CSS', { escape: (value: string) => value });
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

it('selects a named depth without dismissing the menu', () => {
  const change = setup();
  const high = screen.getByRole('radio', { name: 'High' });
  fireEvent.click(high);
  expect(change).toHaveBeenLastCalledWith('high');
  expect((high as HTMLInputElement).checked).toBe(true);
  expect(screen.getByRole('menu')).toBeTruthy();
  expect(
    screen.getByText('Take extra care with harder problems.', { exact: false })
  ).toBeTruthy();
});

it('previews a hovered level without changing the selected depth', () => {
  const change = setup();
  const high = screen.getByRole('radio', { name: 'High' });
  fireEvent.pointerEnter(
    high.closest('[data-kb-radio-group-item]') ?? high.parentElement!
  );
  expect(
    screen.getByText('Take extra care with harder problems.', { exact: false })
  ).toBeTruthy();
  expect(change).not.toHaveBeenCalled();
  expect(
    (screen.getByRole('radio', { name: 'Low' }) as HTMLInputElement).checked
  ).toBe(true);
  fireEvent.pointerLeave(
    screen.getByRole('radiogroup', { name: 'Thinking depth' })
  );
  expect(
    screen.getByText('A little thought for straightforward tasks.', {
      exact: false,
    })
  ).toBeTruthy();
});

it('changes depth with arrow keys while keeping menu focus in the control', async () => {
  const user = userEvent.setup();
  const change = setup();
  const low = screen.getByRole('radio', { name: 'Low' });
  await user.click(low);
  await user.keyboard('{ArrowRight}');
  expect(change).toHaveBeenLastCalledWith('high');
  expect(document.activeElement).toBe(
    screen.getByRole('radio', { name: 'High' })
  );
  expect(screen.getByRole('menu')).toBeTruthy();
});

it('opens the catalog, returns to effort, and dismisses with Escape', async () => {
  setup();
  fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Choose model' }), {
    key: 'Enter',
  });
  expect(screen.getByRole('menuitem', { name: 'Other model' })).toBeTruthy();
  expect(
    screen.queryByRole('radiogroup', { name: 'Thinking depth' })
  ).toBeNull();
  fireEvent.keyDown(
    screen.getByRole('menuitem', { name: 'Model and effort' }),
    { key: 'Enter' }
  );
  const depth = screen.getByRole('radio', { name: 'Low' });
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole('menuitem', { name: 'Choose model' })
    )
  );
  fireEvent.keyDown(depth, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
});

it('does not change a disabled effort control', () => {
  const change = setup(true);
  fireEvent.keyDown(screen.getByRole('radio', { name: 'Low' }), {
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
  expect(screen.queryByRole('radiogroup')).toBeNull();
});
