import { fireEvent, render } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { TaskPredictionHighlight } from './TaskPredictionHighlight';

const originalAnimate = Object.getOwnPropertyDescriptor(
  Element.prototype,
  'animate'
);

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalAnimate)
    Object.defineProperty(Element.prototype, 'animate', originalAnimate);
  else Reflect.deleteProperty(Element.prototype, 'animate');
});

it.each([false, true])(
  'highlights only AI changes and preserves the control (reduced motion: %s)',
  (reducedMotion) => {
    vi.stubGlobal('matchMedia', () => ({ matches: reducedMotion }));
    const cancel = vi.fn();
    const animate = vi.fn(() => ({ cancel }));
    Object.defineProperty(Element.prototype, 'animate', {
      configurable: true,
      value: animate,
    });
    const rendered = render(() => {
      const [property, setProperty] = createSignal({
        version: 0,
        label: 'Low',
      });
      return (
        <>
          <button
            onClick={() =>
              setProperty((p) => ({ version: p.version + 1, label: 'Urgent' }))
            }
          >
            Predict priority
          </button>
          <TaskPredictionHighlight version={property().version}>
            <button
              data-slot="property-pill"
              onClick={() => setProperty((p) => ({ ...p, label: 'High' }))}
            >
              {property().label}
            </button>
          </TaskPredictionHighlight>
        </>
      );
    });
    const control = rendered.getByRole('button', { name: 'Low' });
    expect(animate).not.toHaveBeenCalled();
    fireEvent.click(rendered.getByRole('button', { name: 'Predict priority' }));
    expect(rendered.getByRole('button', { name: 'Urgent' })).toBe(control);
    expect(animate).toHaveBeenCalledTimes(reducedMotion ? 0 : 1);
    if (!reducedMotion) expect(animate.mock.contexts[0]).toBe(control);
    control.focus();
    fireEvent.click(control);
    expect(rendered.getByRole('button', { name: 'High' })).toBe(control);
    expect(document.activeElement).toBe(control);
    expect(animate).toHaveBeenCalledTimes(reducedMotion ? 0 : 1);
    expect(cancel).not.toHaveBeenCalled();
    fireEvent.click(rendered.getByRole('button', { name: 'Predict priority' }));
    expect(animate).toHaveBeenCalledTimes(reducedMotion ? 0 : 2);
    rendered.unmount();
    expect(cancel).toHaveBeenCalledTimes(reducedMotion ? 0 : 2);
  }
);
