/** @vitest-environment jsdom */

import { isTouchDevice } from '@core/mobile/isTouchDevice';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SelectSessionConfigOption } from '../state/session-config';
import { EffortSelector } from './EffortSelector';

vi.mock('@core/mobile/isTouchDevice', () => ({
  isTouchDevice: vi.fn(() => false),
}));

const config: SelectSessionConfigOption = {
  id: 'effort',
  name: 'Effort',
  category: 'thought_level',
  description: null,
  type: 'select',
  currentValue: 'low',
  options: [
    { name: 'Low', value: 'low', group: null, description: null },
    { name: 'High', value: 'high', group: null, description: null },
  ],
};
const originalScrollTo = HTMLElement.prototype.scrollTo;
let motionStyles: HTMLStyleElement;
beforeEach(() => {
  motionStyles = document.createElement('style');
  motionStyles.textContent =
    '[role="menu"] { animation-name: none; transition-duration: 0s; }';
  document.head.append(motionStyles);
  vi.mocked(isTouchDevice).mockReturnValue(false);
  HTMLElement.prototype.scrollTo = vi.fn();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});
afterEach(() => {
  cleanup();
  motionStyles.remove();
  HTMLElement.prototype.scrollTo = originalScrollTo;
  vi.unstubAllGlobals();
});
it('keeps named mobile effort choices and closes after selecting', async () => {
  vi.mocked(isTouchDevice).mockReturnValue(true);
  const change = vi.fn();
  const openChange = vi.fn();
  render(() => (
    <EffortSelector
      config={config}
      onChange={change}
      onOpenChange={openChange}
    />
  ));
  fireEvent.click(screen.getByRole('button', { name: 'Effort: Low' }));
  const high = await screen.findByRole('button', { name: 'High' });
  expect(screen.queryByRole('slider')).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Low' }).getAttribute('aria-pressed')
  ).toBe('true');
  expect(high.getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(high);
  expect(openChange).toHaveBeenLastCalledWith(false);
  expect(change).toHaveBeenCalledExactlyOnceWith({
    configId: 'effort',
    value: 'high',
    name: 'High',
  });
});
it('hides unsupported effort', () => {
  render(() => <EffortSelector onChange={vi.fn()} />);
  expect(screen.queryByRole('button')).toBeNull();
});
it('does not open while configuration is disabled', () => {
  render(() => <EffortSelector config={config} disabled onChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Effort: Low' }));
  expect(screen.queryByRole('group', { name: 'Reasoning effort' })).toBeNull();
});

it('returns focus to the composer when the mobile chooser closes', async () => {
  vi.mocked(isTouchDevice).mockReturnValue(true);
  let input!: HTMLTextAreaElement;
  render(() => (
    <>
      <style>{`[data-corvu-drawer-content] { transition-duration: 0s; }`}</style>
      <textarea ref={input} aria-label="Message" />
      <EffortSelector
        config={config}
        onChange={vi.fn()}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          input.focus();
        }}
      />
    </>
  ));
  fireEvent.click(screen.getByRole('button', { name: 'Effort: Low' }));
  const low = await screen.findByRole('button', { name: 'Low' });
  await waitFor(() => expect(document.activeElement).toBe(low));
  fireEvent.keyDown(low, { key: 'Escape' });
  await waitFor(() => expect(document.activeElement).toBe(input));
});

it('focuses the desktop slider and applies named levels without closing', async () => {
  const change = vi.fn();
  const [value, setValue] = createSignal('low');
  render(() => (
    <EffortSelector
      config={config}
      value={value()}
      onChange={(choice) => {
        change(choice);
        setValue(choice.value);
      }}
    />
  ));
  const trigger = screen.getByRole('button', { name: 'Effort: Low' });
  fireEvent.keyDown(trigger, { key: 'Enter' });
  const slider = await screen.findByRole('slider', {
    name: 'Reasoning effort',
  });
  await waitFor(() => expect(document.activeElement).toBe(slider));
  fireEvent.keyDown(slider, { key: 'ArrowRight' });
  expect(change).toHaveBeenLastCalledWith({
    configId: 'effort',
    value: 'high',
    name: 'High',
  });
  expect(slider.getAttribute('aria-valuetext')).toBe('High');
  expect(screen.getByRole('menu')).toBeTruthy();
  fireEvent.keyDown(slider, { key: 'ArrowLeft' });
  expect(change).toHaveBeenLastCalledWith({
    configId: 'effort',
    value: 'low',
    name: 'Low',
  });
  fireEvent.keyDown(slider, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
});
