import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { createSignal, For } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPager, Pager, PagerSwipeGestures } from './index';

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(320);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
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
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mountPager(animationDuration?: number) {
  const [active, setActive] = createSignal(1);
  const changed = vi.fn(setActive);
  let navigation: Promise<boolean> | undefined;
  const { container } = render(() => {
    const pager = createPager({
      activePage: active,
      pageOrder: () => [0, 1, 2],
      onPageChange: changed,
      animationDuration,
    });
    return (
      <Pager.Root controller={pager}>
        <button
          onClick={() => {
            navigation = pager.previous();
          }}
        >
          Previous
        </button>
        <button
          onClick={() => {
            navigation = pager.next();
          }}
        >
          Next
        </button>
        <button
          onClick={() => {
            navigation = pager.goTo(2);
          }}
        >
          Last page
        </button>
        <Pager.Viewport aria-label="Pages">
          <For each={[0, 1, 2]}>
            {(id) => (
              <Pager.Page id={id}>
                <h2>Page {id}</h2>
              </Pager.Page>
            )}
          </For>
        </Pager.Viewport>
        <PagerSwipeGestures edgeInset={40} />
      </Pager.Root>
    );
  });
  const viewport = screen.getByLabelText('Pages');
  const rail = container.querySelector<HTMLElement>('.pager-rail');
  if (!rail) throw new Error('Pager rail did not mount');
  vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 320, 600)
  );
  return { active, changed, viewport, rail, navigation: () => navigation };
}

function touch(
  viewport: HTMLElement,
  type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel',
  x: number,
  y: number,
  timeStamp: number
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    touches: {
      value:
        type === 'touchend' || type === 'touchcancel'
          ? []
          : [{ clientX: x, clientY: y }],
    },
    changedTouches: { value: [{ clientX: x, clientY: y }] },
    timeStamp: { value: timeStamp },
  });
  fireEvent(viewport, event);
  return event;
}

describe('pager motion', () => {
  it.each([
    ['Previous', 0],
    ['Next', 2],
    ['Last page', 2],
  ])(
    'keeps %s navigation at 140ms and finishes without transitionend',
    async (name, destination) => {
      const pager = mountPager();
      fireEvent.click(screen.getByRole('button', { name }));

      expect(pager.rail.style.transition).toContain('140ms');
      vi.advanceTimersByTime(189);
      expect(pager.active()).toBe(1);
      vi.advanceTimersByTime(1);
      expect(await pager.navigation()).toBe(true);
      expect(pager.active()).toBe(destination);
      expect(pager.changed).toHaveBeenCalledOnce();
      expect(pager.viewport.dataset.phase).toBe('idle');
    }
  );

  it.each([
    [0, 300],
    [1, 260],
    [4, 150],
  ])(
    'settles a swipe at %s px/ms with its own fallback deadline',
    (velocity, duration) => {
      const pager = mountPager();
      touch(pager.viewport, 'touchstart', 200, 100, 0);
      touch(pager.viewport, 'touchmove', 140, 100, 20);
      const distance = velocity * 20;
      touch(pager.viewport, 'touchmove', 140 + distance, 100, 100);
      touch(pager.viewport, 'touchmove', 140, 100, 120);
      touch(pager.viewport, 'touchend', 140, 100, 120);

      expect(pager.rail.style.transition).toContain(`${duration}ms`);
      vi.advanceTimersByTime(duration + 49);
      expect(pager.active()).toBe(1);
      vi.advanceTimersByTime(1);
      expect(pager.active()).toBe(2);
      expect(pager.viewport.dataset.phase).toBe('idle');
    }
  );

  it('tracks the finger immediately and commits a short flick', () => {
    const pager = mountPager();
    touch(pager.viewport, 'touchstart', 200, 100, 0);
    touch(pager.viewport, 'touchmove', 190, 100, 20);
    expect(pager.rail.style.transform).toBe('translate3d(-10px, 0, 0)');
    touch(pager.viewport, 'touchmove', 180, 100, 40);
    expect(pager.rail.style.transform).toBe('translate3d(-20px, 0, 0)');
    touch(pager.viewport, 'touchend', 180, 100, 60);
    vi.runAllTimers();

    expect(pager.active()).toBe(2);
    expect(pager.changed).toHaveBeenCalledOnce();
  });

  it('does not treat a short drag followed by a pause as a flick', () => {
    const pager = mountPager();
    touch(pager.viewport, 'touchstart', 200, 100, 0);
    touch(pager.viewport, 'touchmove', 190, 100, 20);
    touch(pager.viewport, 'touchmove', 180, 100, 40);
    touch(pager.viewport, 'touchend', 180, 100, 90);
    vi.runAllTimers();

    expect(pager.active()).toBe(1);
    expect(pager.changed).not.toHaveBeenCalled();
    expect(pager.viewport.dataset.phase).toBe('idle');
  });

  it('finishes a quick rejected swipe using its shorter settle duration', () => {
    const pager = mountPager();
    touch(pager.viewport, 'touchstart', 200, 100, 0);
    touch(pager.viewport, 'touchmove', 190, 100, 20);
    touch(pager.viewport, 'touchend', 190, 100, 20);
    expect(pager.rail.style.transition).toContain('150ms');
    vi.advanceTimersByTime(200);

    expect(pager.viewport.dataset.phase).toBe('idle');
    expect(pager.active()).toBe(1);
    expect(pager.changed).not.toHaveBeenCalled();
    touch(pager.viewport, 'touchstart', 200, 100, 300);
    touch(pager.viewport, 'touchmove', 140, 100, 320);
    expect(pager.viewport.dataset.phase).toBe('dragging');
  });

  it.each([0, 80])(
    'respects a custom %sms duration below the swipe minimum',
    (duration) => {
      const pager = mountPager(duration);
      touch(pager.viewport, 'touchstart', 200, 100, 0);
      touch(pager.viewport, 'touchmove', 140, 100, 20);
      touch(pager.viewport, 'touchend', 140, 100, 20);
      if (duration > 0) {
        expect(pager.rail.style.transition).toContain(`${duration}ms`);
        vi.advanceTimersByTime(duration + 50);
      }

      expect(pager.active()).toBe(2);
      expect(pager.viewport.dataset.phase).toBe('idle');
    }
  );

  it('finishes immediately with reduced motion', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const pager = mountPager();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(await pager.navigation()).toBe(true);
    expect(pager.active()).toBe(2);
    expect(pager.rail.style.transition).toBe('');
    expect(pager.viewport.dataset.phase).toBe('idle');
  });

  it('leaves vertical scrolling and edge gestures alone', () => {
    const pager = mountPager();
    touch(pager.viewport, 'touchstart', 200, 100, 0);
    const vertical = touch(pager.viewport, 'touchmove', 195, 140, 20);
    touch(pager.viewport, 'touchend', 195, 140, 40);
    touch(pager.viewport, 'touchstart', 20, 100, 100);
    const edge = touch(pager.viewport, 'touchmove', 120, 100, 120);
    touch(pager.viewport, 'touchend', 120, 100, 140);
    vi.runAllTimers();

    expect(vertical.defaultPrevented).toBe(false);
    expect(edge.defaultPrevented).toBe(false);
    expect(pager.active()).toBe(1);
    expect(pager.viewport.dataset.phase).toBe('idle');
  });

  it('cancels an interrupted swipe without changing pages', () => {
    const pager = mountPager();
    touch(pager.viewport, 'touchstart', 200, 100, 0);
    touch(pager.viewport, 'touchmove', 100, 100, 20);
    touch(pager.viewport, 'touchcancel', 100, 100, 30);
    vi.runAllTimers();

    expect(pager.active()).toBe(1);
    expect(pager.changed).not.toHaveBeenCalled();
    expect(pager.viewport.dataset.phase).toBe('idle');
  });
});
