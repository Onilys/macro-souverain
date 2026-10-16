import { cleanup, render, waitFor } from '@solidjs/testing-library';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import manifest from '../fixtures/manifest.json';
import { MascotPlayer } from '../views/mascot-player';
import { StateMachinePlayer } from './player.js';

let clock = 0,
  serial = 0,
  hidden = false;
let frames: Map<number, FrameRequestCallback>;
let observerCallback: IntersectionObserverCallback;
const disconnect = vi.fn(),
  close = vi.fn(),
  draw = vi.fn();
const motion = {
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};
const players: StateMachinePlayer[] = [];
const canvas = () => document.createElement('canvas');
const make = () => {
  const p = new StateMachinePlayer(canvas());
  players.push(p);
  return p;
};
const step = (ms: number) => {
  clock += ms;
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((fn) => fn(clock));
};
beforeEach(() => {
  clock = 0;
  serial = 0;
  hidden = false;
  frames = new Map();
  close.mockClear();
  draw.mockClear();
  disconnect.mockClear();
  motion.matches = false;
  motion.addEventListener.mockClear();
  motion.removeEventListener.mockClear();
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () =>
      ({
        clearRect: vi.fn(),
        drawImage: draw,
      }) as unknown as CanvasRenderingContext2D
  );
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
    frames.set(++serial, fn);
    return serial;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.stubGlobal('matchMedia', () => motion);
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        observerCallback = callback;
      }
      observe() {}
      disconnect() {
        disconnect();
      }
    }
  );
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 2048, height: 1792, close }))
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL) => ({
      ok: true,
      json: async () => manifest,
      blob: async () => new Blob([String(url)]),
    }))
  );
});
afterEach(() => {
  cleanup();
  players.splice(0).forEach((p) => p.destroy());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('shares one decode and releases only after the final owner', async () => {
  const a = make(),
    b = make();
  await Promise.all([
    a.load('https://test/shared.json'),
    b.load('https://test/shared.json'),
  ]);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(createImageBitmap).toHaveBeenCalledTimes(1);
  a.destroy();
  await Promise.resolve();
  expect(close).not.toHaveBeenCalled();
  b.destroy();
  await Promise.resolve();
  expect(close).toHaveBeenCalledTimes(1);
  expect(frames.size).toBe(0);
});
it('holds without RAF, ignores repeated requests, suspends offscreen/hidden and follows live reduced motion', async () => {
  const p = make();
  await p.load('https://test/lifecycle.json');
  expect(frames.size).toBe(0);
  p.request('thinking');
  step(100);
  const requests = serial;
  p.request('thinking');
  expect(serial).toBe(requests);
  hidden = true;
  document.dispatchEvent(new Event('visibilitychange'));
  expect(frames.size).toBe(0);
  clock += 3600000;
  hidden = false;
  document.dispatchEvent(new Event('visibilitychange'));
  step(16);
  expect(p.machine!.state.kind).toBe('transition');
  if (p.machine!.state.kind === 'transition')
    expect(p.machine!.state.time).toBe(116);
  observerCallback(
    [{ isIntersecting: false }] as IntersectionObserverEntry[],
    {} as IntersectionObserver
  );
  expect(frames.size).toBe(0);
  observerCallback(
    [{ isIntersecting: true }] as IntersectionObserverEntry[],
    {} as IntersectionObserver
  );
  for (let i = 0; i < 20; i++) step(100);
  expect(p.machine!.state.kind).toBe('hold');
  expect(frames.size).toBe(0);
  const count = draw.mock.calls.length;
  p.request('thinking');
  expect(draw).toHaveBeenCalledTimes(count);
  p.request('idle');
  motion.matches = true;
  motion.addEventListener.mock.calls[0][1]();
  expect(p.machine!.state.kind).toBe('idle');
  expect(frames.size).toBe(0);
  p.destroy();
  expect(disconnect).toHaveBeenCalledTimes(1);
  expect(motion.removeEventListener).toHaveBeenCalledTimes(1);
});
it('guards a decode resolving after Solid unmount', async () => {
  let resolve!: (value: unknown) => void;
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(
      () =>
        new Promise((r) => {
          resolve = r;
        })
    )
  );
  const ready = vi.fn();
  const view = render(() => (
    <MascotPlayer
      target="idle"
      manifestUrl="https://test/pending.json"
      onReady={ready}
    />
  ));
  await waitFor(() => expect(createImageBitmap).toHaveBeenCalledTimes(1));
  view.unmount();
  resolve({ width: 2048, height: 1792, close });
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(ready).not.toHaveBeenCalled();
  expect(frames.size).toBe(0);
});
it('shows a fixed-size fallback and removes observers/listeners on asset failure', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: false }))
  );
  const ready = vi.fn();
  const view = render(() => (
    <MascotPlayer
      target="idle"
      size={48}
      manifestUrl="https://test/fail.json"
      onReady={ready}
    />
  ));
  await waitFor(() => expect(disconnect).toHaveBeenCalledTimes(1));
  expect(ready).not.toHaveBeenCalled();
  expect(
    view.container.querySelector('canvas')?.classList.contains('invisible')
  ).toBe(true);
  expect(view.container.querySelector('span')?.style.width).toBe('48px');
  expect(motion.removeEventListener).toHaveBeenCalledTimes(1);
});
it('falls back to PNG on bad WebP dimensions', async () => {
  vi.stubGlobal(
    'createImageBitmap',
    vi
      .fn()
      .mockResolvedValueOnce({ width: 2, height: 2, close })
      .mockResolvedValueOnce({ width: 2048, height: 1792, close })
  );
  const p = make();
  await p.load('https://test/fallback.json');
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(close).toHaveBeenCalledTimes(1);
  expect(p.machine).toBeDefined();
});
