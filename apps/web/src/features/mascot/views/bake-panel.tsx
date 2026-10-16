import { Button } from '@ui/components/Button';
import { createSignal, For, onCleanup, Show } from 'solid-js';
import { type BakeResult, bake } from '../authoring/export.js';
import type { PlannedFrame, Project } from '../core/types';
export function BakePanel(props: { project: Project }) {
  const [inspected, setInspected] = createSignal<PlannedFrame>();
  const [busy, setBusy] = createSignal(false),
    [progress, setProgress] = createSignal(0),
    [status, setStatus] = createSignal('256 px cells · 2048 × 1792 sheet'),
    [fit, setFit] = createSignal(true),
    [result, setResult] = createSignal<BakeResult>(),
    [links, setLinks] = createSignal<{ name: string; url: string }[]>([]);
  let controller: AbortController | undefined,
    disposed = false;
  const release = () => {
    for (const link of links()) URL.revokeObjectURL(link.url);
    const old = result();
    if (old) old.atlas.width = old.atlas.height = 1;
  };
  onCleanup(() => {
    disposed = true;
    controller?.abort();
    release();
  });
  const run = async () => {
    if (busy()) return;
    release();
    setResult(undefined);
    setInspected(undefined);
    setLinks([]);
    setBusy(true);
    setProgress(0);
    controller = new AbortController();
    const project = structuredClone(props.project);
    try {
      const baked = await bake(project, 'variant', {
        signal: controller.signal,
        fit: fit(),
        onProgress: (value, label) => {
          if (!disposed) {
            setProgress(value);
            setStatus(label);
          }
        },
      });
      if (disposed) return;
      setResult(baked);
      setStatus(
        `Baked ${baked.plan.frames.length} frames · ${(baked.webp.size / 1024).toFixed(0)} KiB WebP`
      );
      const downloads: [string, Blob][] = [
        ['mascot.zip', baked.archive],
        ['mascot.webp', baked.webp],
        ['mascot.png', baked.png],
        ['manifest.json', new Blob([baked.json], { type: 'application/json' })],
        [
          'project.json',
          new Blob([JSON.stringify(project, null, 2)], {
            type: 'application/json',
          }),
        ],
      ];
      setLinks(
        downloads.map(([name, blob]) => ({
          name,
          url: URL.createObjectURL(blob),
        }))
      );
    } catch (error) {
      if (!disposed)
        setStatus(
          error instanceof Error
            ? error.name === 'AbortError'
              ? 'Bake canceled'
              : error.message
            : 'Bake failed'
        );
    } finally {
      if (!disposed) setBusy(false);
    }
  };
  return (
    <section class="space-y-3 rounded-xl border border-edge-muted p-4">
      <h2 class="font-semibold">Bake & export</h2>
      <label class="flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={fit()}
          onChange={(e) => setFit(e.currentTarget.checked)}
        />
        Fit every pose with one camera zoom
      </label>
      <div class="flex gap-2">
        <Button variant="accent" disabled={busy()} onClick={() => void run()}>
          Bake PNG + WebP
        </Button>
        <Show when={busy()}>
          <Button variant="outline" onClick={() => controller?.abort()}>
            Cancel bake
          </Button>
        </Show>
      </div>
      <progress
        class="w-full"
        value={progress()}
        max={1}
        aria-label="Bake progress"
      />
      <p role="status" class="text-sm text-ink-muted">
        {status()}
      </p>
      <div class="flex flex-wrap gap-3">
        <For each={links()}>
          {(link) => (
            <a
              class="text-accent underline"
              href={link.url}
              download={link.name}
            >
              {link.name}
            </a>
          )}
        </For>
      </div>
      <Show when={result()}>
        {(baked) => (
          <>
            <p class="text-xs text-ink-muted">
              Inspect an exported frame. Downloads describe the project at bake
              time; rebake after editing.
            </p>
            <div class="grid grid-cols-8 border border-edge-muted">
              <For each={Array.from({ length: 56 }, (_, i) => i)}>
                {(i) => {
                  const frame = () =>
                    baked().plan.frames.find(
                      (f) => f.row === Math.floor(i / 8) && f.col === i % 8
                    );
                  return (
                    <button
                      type="button"
                      class="aspect-square border border-edge-muted bg-transparent"
                      disabled={!frame()}
                      title={
                        frame()
                          ? `${frame()!.id} cell ${i + 1}`
                          : 'Unused transparent cell'
                      }
                      aria-label={
                        frame()
                          ? `Inspect ${frame()!.id} cell ${i + 1}`
                          : `Unused cell ${i + 1}`
                      }
                      onClick={() => setInspected(frame()!)}
                      style={{
                        'background-image': `url(${links().find((l) => l.name === 'mascot.png')?.url})`,
                        'background-size': '800% 700%',
                        'background-position': `${((i % 8) / 7) * 100}% ${(Math.floor(i / 8) / 6) * 100}%`,
                      }}
                    />
                  );
                }}
              </For>
            </div>
          </>
        )}
      </Show>
      <Show when={inspected()}>
        {(frame) => (
          <div class="flex flex-wrap items-center gap-3">
            <div
              class="size-64 border border-edge-muted"
              role="img"
              aria-label={`Exported ${frame().id} frame`}
              style={{
                'background-image': `url(${links().find((link) => link.name === 'mascot.png')?.url})`,
                'background-size': '2048px 1792px',
                'background-position': `${-frame().col * 256}px ${-frame().row * 256}px`,
              }}
            />
            <p class="text-sm">
              {frame().id} · column {frame().col + 1}, row {frame().row + 1} ·{' '}
              {frame().duration.toFixed(1)} ms
            </p>
          </div>
        )}
      </Show>
    </section>
  );
}
