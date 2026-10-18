import { type Component, createResource, Show } from 'solid-js';

type LazyView = Component & { preload: () => Promise<unknown> };

/**
 * Wraps a lazy view so it first renders only once its code has loaded. A lazy
 * component that renders before its code arrives forgets the code again when
 * it unmounts, so it would suspend on every later mount; waiting on
 * `preload()` keeps it. Once loaded, the view renders directly. Warm it
 * through the wrapper's `preload`, which the router also calls.
 */
export function whenLoaded(View: LazyView) {
  let loaded = false;
  const preload = async () => {
    const module = await View.preload();
    loaded = true;
    return module;
  };
  const Loaded = () => {
    if (loaded) return <View />;
    const [ready] = createResource(async () => {
      await preload();
      return true;
    });
    return (
      <Show when={ready()}>
        <View />
      </Show>
    );
  };
  return Object.assign(Loaded, { preload });
}
