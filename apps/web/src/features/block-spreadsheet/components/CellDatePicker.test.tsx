import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CellDatePicker } from './CellDatePicker';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 16, 9, 30));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function setup() {
  const editor = document.createElement('div');
  editor.tabIndex = 0;
  document.body.append(editor);
  editor.focus();
  const onPick = vi.fn();
  const onClose = vi.fn();
  render(() => (
    <CellDatePicker anchor={editor} onPick={onPick} onClose={onClose} />
  ));
  return { editor, onPick, onClose };
}

it('picks a clicked day without taking focus from the editor', () => {
  const { editor, onPick } = setup();
  const day = screen.getByText('20', { selector: '[role=gridcell]' });
  expect(fireEvent.pointerDown(day)).toBe(false);
  expect(fireEvent.mouseDown(day)).toBe(false);
  fireEvent.click(day);
  expect(onPick).toHaveBeenCalledWith(new Date(2026, 9, 20));
  expect(document.activeElement).toBe(editor);
});

it('picks today when it is clicked, though it starts highlighted', () => {
  const { onPick } = setup();
  fireEvent.click(screen.getByText('16', { selector: '[role=gridcell]' }));
  expect(onPick).toHaveBeenCalledWith(new Date(2026, 9, 16));
});

it('moves through days and months from the keyboard, then picks with Enter', () => {
  const { editor, onPick } = setup();
  expect(screen.getByText('October 2026')).toBeTruthy();
  fireEvent.keyDown(editor, { key: 'PageDown' });
  expect(screen.getByText('November 2026')).toBeTruthy();
  fireEvent.keyDown(editor, { key: 'ArrowUp' });
  fireEvent.keyDown(editor, { key: 'ArrowUp' });
  expect(screen.getByText('November 2026')).toBeTruthy();
  fireEvent.keyDown(editor, { key: 'ArrowUp' });
  fireEvent.keyDown(editor, { key: 'ArrowRight' });
  expect(screen.getByText('October 2026')).toBeTruthy();
  const enter = fireEvent.keyDown(editor, { key: 'Enter' });
  expect(enter).toBe(false);
  expect(onPick).toHaveBeenCalledWith(new Date(2026, 9, 27));
});

it('closes on Escape and leaves other keys to the editor', () => {
  const { editor, onPick, onClose } = setup();
  expect(fireEvent.keyDown(editor, { key: 'a' })).toBe(true);
  fireEvent.keyDown(editor, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onPick).not.toHaveBeenCalled();
});
