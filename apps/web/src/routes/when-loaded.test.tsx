import { cleanup, render, screen } from '@solidjs/testing-library';
import { type Component, createSignal, lazy, Show, Suspense } from 'solid-js';
import { afterEach, expect, it } from 'vitest';
import { whenLoaded } from './when-loaded';

afterEach(cleanup);

/** A lazy view whose code arrives when the test calls `load`. */
function deferredView() {
  let resolve: ((module: { default: Component }) => void) | undefined;
  const View = lazy(
    () =>
      new Promise<{ default: Component }>((done) => {
        resolve = done;
      })
  );
  return { View, load: () => resolve?.({ default: () => <p>Thread</p> }) };
}

/** Mounts `Thread` under a Suspense that counts how often it showed loading. */
function renderRemountable(Thread: Component) {
  let loadingViews = 0;
  function Loading() {
    loadingViews += 1;
    return <p>Loading</p>;
  }
  const [open, setOpen] = createSignal(true);
  render(() => (
    <Suspense fallback={<Loading />}>
      <Show when={open()}>
        <Thread />
      </Show>
    </Suspense>
  ));
  return {
    loadingViews: () => loadingViews,
    remount: () => {
      setOpen(false);
      setOpen(true);
    },
  };
}

it('waits for its code, then never suspends when it mounts again', async () => {
  const { View, load } = deferredView();
  const view = renderRemountable(whenLoaded(View));
  expect(screen.getByText('Loading')).toBeTruthy();

  load();
  expect(await screen.findByText('Thread')).toBeTruthy();
  view.remount();

  expect(screen.getByText('Thread')).toBeTruthy();
  expect(view.loadingViews()).toBe(1);
});

it('renders directly once warmed through its preload', async () => {
  const { View, load } = deferredView();
  const Thread = whenLoaded(View);
  const warmed = Thread.preload();
  load();
  await warmed;

  const view = renderRemountable(Thread);

  expect(screen.getByText('Thread')).toBeTruthy();
  expect(view.loadingViews()).toBe(0);
});
