import { cleanup, render } from '@solidjs/testing-library';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createTimeline } from './create-timeline';

let clock = 0;
let nextId = 0;
let hidden = false;
const frames = new Map<number, FrameRequestCallback>();
const media = new EventTarget() as EventTarget & { matches: boolean };
media.matches = false;
beforeEach(() => {
  clock = 0;
  nextId = 0;
  hidden = false;
  media.matches = false;
  frames.clear();
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  vi.stubGlobal('matchMedia', () => media);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextId, callback);
    return nextId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function tick(at: number) {
  clock = at;
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((callback) => callback(clock));
}
function setup(loop = false, duration = 1000) {
  let timeline!: ReturnType<typeof createTimeline>;
  const view = render(() => {
    timeline = createTimeline(
      () => duration,
      () => loop
    );
    return null;
  });
  return { timeline, view };
}
it.each([60, 120, 144])(
  'limits SDF updates to 30 fps on a %i Hz display without changing duration',
  (hz) => {
    const { timeline } = setup();
    timeline.toggle();
    let changes = 0;
    let previous = timeline.time();
    for (let i = 1; i <= hz; i++) {
      tick((i * 1000) / hz);
      if (timeline.time() !== previous) changes++;
      expect(timeline.time()).toBeGreaterThanOrEqual(previous);
      previous = timeline.time();
      expect(frames.size).toBeLessThanOrEqual(1);
    }
    expect(changes).toBe(30);
    expect(timeline.time()).toBeCloseTo(1);
    // A final sub-millisecond floating-point remainder may need one more paint.
    tick(1040);
    expect(timeline.playing()).toBe(false);
    expect(frames.size).toBe(0);
  }
);
it('pauses without hidden-time catchup and stops clocks for reduced motion and disposal', () => {
  const { timeline, view } = setup(true);
  timeline.toggle();
  tick(40);
  expect(timeline.time()).toBeCloseTo(0.04);
  hidden = true;
  document.dispatchEvent(new Event('visibilitychange'));
  expect(frames.size).toBe(0);
  clock = 3600040;
  hidden = false;
  document.dispatchEvent(new Event('visibilitychange'));
  tick(clock + 40);
  expect(timeline.time()).toBeCloseTo(0.08);
  media.matches = true;
  media.dispatchEvent(new Event('change'));
  expect(frames.size).toBe(0);
  media.matches = false;
  media.dispatchEvent(new Event('change'));
  expect(frames.size).toBe(1);
  view.unmount();
  expect(frames.size).toBe(0);
});
it('supports pause/resume, reverse endpoints and idle wrap without duplicate clocks', () => {
  const { timeline } = setup(true);
  timeline.seek(0.98);
  timeline.toggle();
  tick(40);
  expect(timeline.time()).toBeCloseTo(0.02);
  timeline.pause();
  expect(frames.size).toBe(0);
  clock = 1000;
  timeline.toggle();
  tick(1040);
  expect(timeline.time()).toBeCloseTo(0.06);
  timeline.flip();
  expect(timeline.time()).toBe(1);
  timeline.toggle();
  tick(1080);
  expect(timeline.time()).toBeCloseTo(0.96);
});
