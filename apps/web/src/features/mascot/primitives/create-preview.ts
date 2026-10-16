import {
  type Accessor,
  createEffect,
  createSignal,
  on,
  onCleanup,
  onMount,
} from 'solid-js';
import { Renderer } from '../authoring/renderer.js';
import { evaluate } from '../core/model.js';
import type { Pose, Project } from '../core/types';
export function createPreview(
  canvas: () => HTMLCanvasElement,
  project: Accessor<Project>,
  pose: Accessor<Pose>,
  transparent: Accessor<boolean>
) {
  const [renderer, setRenderer] = createSignal<Renderer>(),
    [error, setError] = createSignal<string>();
  onMount(() => {
    try {
      setRenderer(new Renderer(canvas()));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'WebGL2 unavailable');
    }
  });
  createEffect(
    on(
      [renderer, project, pose, transparent],
      ([renderer, project, pose, transparent]) => {
        if (!renderer) return;
        try {
          const result = evaluate(project, pose);
          result.state.size = 512;
          result.state.antialias = 2;
          result.state.transparent = transparent;
          renderer.draw(result.state, result.poses);
        } catch (error) {
          setError(error instanceof Error ? error.message : 'Preview failed');
        }
      }
    )
  );
  onCleanup(() => renderer()?.destroy());
  return { error };
}
