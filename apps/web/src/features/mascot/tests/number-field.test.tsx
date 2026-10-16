import { cleanup, fireEvent, render } from '@solidjs/testing-library';
import { afterEach, expect, it, vi } from 'vitest';
import { NumberField } from '../components/number-field';
import { validateProject } from '../core/project';
import fixture from '../fixtures/project.json';
import {
  createProjectHistory,
  type ProjectHistory,
} from '../primitives/create-project-history';

afterEach(cleanup);
function setup() {
  let history!: ProjectHistory;
  const view = render(() => {
    const initial = validateProject(fixture);
    initial.settings.lookGaze = 1;
    history = createProjectHistory(initial);
    return (
      <NumberField
        label="Travel"
        value={history.project().settings.lookGaze}
        min={0}
        max={4}
        step={0.1}
        onStart={history.begin}
        onFinish={history.finish}
        onCancel={history.cancel}
        onInput={(value) =>
          history.edit((p) => {
            p.settings.lookGaze = value;
          })
        }
      />
    );
  });
  const input = view.getByLabelText('Travel') as HTMLInputElement;
  const handle = view.getByRole('button', { name: 'Adjust Travel' });
  handle.setPointerCapture = vi.fn();
  handle.hasPointerCapture = () => false;
  handle.releasePointerCapture = vi.fn();
  const pointer = (type: string, clientX: number, shiftKey = false) => {
    const event = new Event(type, { bubbles: true });
    Object.assign(event, { pointerId: 1, button: 0, clientX, shiftKey });
    fireEvent(handle, event);
  };
  return {
    view,
    history,
    input,
    handle,
    pointer,
    value: () => history.project().settings.lookGaze,
  };
}

it('commits typed values on change, clamps bounds and rejects invalid text', () => {
  const { input, value, history } = setup();
  fireEvent.input(input, { target: { value: '2.3' } });
  expect(value()).toBe(1);
  fireEvent.blur(input);
  expect(value()).toBeCloseTo(2.3);
  history.undo();
  expect(value()).toBe(1);
  fireEvent.change(input, { target: { value: 'invalid' } });
  expect(value()).toBe(1);
  expect(input.value).toBe('1');
  fireEvent.change(input, { target: { value: '5' } });
  expect(value()).toBe(4);
  fireEvent.click(input);
  expect(input.selectionStart).toBe(0);
  expect(input.selectionEnd).toBe(input.value.length);
});

it('uses arrow steps and Shift for ten-times steps on input and handle', () => {
  const { input, handle, value } = setup();
  fireEvent.keyDown(input, { key: 'ArrowUp' });
  expect(value()).toBeCloseTo(1.1);
  fireEvent.keyDown(input, { key: 'ArrowUp', shiftKey: true });
  expect(value()).toBeCloseTo(2.1);
  fireEvent.keyDown(handle, { key: 'ArrowLeft', shiftKey: true });
  expect(value()).toBeCloseTo(1.1);
});

it('previews pointer drags and commits exactly one undo step', () => {
  const { pointer, value, history } = setup();
  pointer('pointerdown', 100);
  pointer('pointermove', 102);
  expect(value()).toBeCloseTo(1.2);
  pointer('pointermove', 103);
  pointer('pointerup', 103);
  expect(value()).toBeCloseTo(1.3);
  history.undo();
  expect(value()).toBe(1);
  expect(history.canUndo()).toBe(false);
  history.redo();
  expect(value()).toBeCloseTo(1.3);
  pointer('pointerdown', 100);
  pointer('pointermove', 101, true);
  expect(value()).toBeCloseTo(2.3);
  pointer('pointerup', 101, true);
});

it.each(['Escape', 'pointercancel', 'lostpointercapture', 'blur', 'unmount'])(
  'restores a canceled drag on %s without destroying redo history',
  (reason) => {
    const { pointer, input, handle, value, history, view } = setup();
    fireEvent.change(input, { target: { value: '2' } });
    history.undo();
    pointer('pointerdown', 100);
    pointer('pointermove', 103);
    if (reason === 'Escape') fireEvent.keyDown(handle, { key: 'Escape' });
    else if (reason === 'blur') fireEvent(window, new Event('blur'));
    else if (reason === 'unmount') view.unmount();
    else pointer(reason, 103);
    expect(value()).toBe(1);
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(true);
  }
);
