import { Button } from '@ui/components/Button';
import { Input } from '@ui/components/Input';
import { TabbedControl } from '@ui/components/TabbedControl';
import { createSignal, For, onCleanup, Show } from 'solid-js';
import { Compass } from '../components/compass';
import { PoseInspector } from '../components/pose-inspector';
import { previewPose, type Selection } from '../core/editor-selection';
import { clipInfo, clone, EXPRESSIONS, framePlan } from '../core/model.js';
import {
  MAX_PROJECT_BYTES,
  parseProject,
  validateProject,
} from '../core/project';
import type { ClipId, LookIndex } from '../core/types';
import currentProject from '../fixtures/project.json';
import { createPreview } from '../primitives/create-preview';
import { createProjectHistory } from '../primitives/create-project-history';
import { createTimeline } from '../primitives/create-timeline';
import { BakePanel } from './bake-panel';
export default function VariantDesigner() {
  let storage: Storage | undefined;
  try {
    storage = localStorage;
  } catch {
    /* Export works without storage. */
  }
  const history = createProjectHistory(
    validateProject(currentProject),
    storage
  );
  const [rawSelection, setSelection] = createSignal<Selection>({
      kind: 'neutral',
    }),
    [clip, setClip] = createSignal<ClipId>('intro'),
    [stepped, setStepped] = createSignal(false),
    [transparent, setTransparent] = createSignal(true);
  const selection = (): Selection => {
    const selected = rawSelection();
    return selected.kind === 'idle'
      ? {
          ...selected,
          index: Math.min(selected.index, history.project().idle.length - 1),
        }
      : selected;
  };
  let canvas!: HTMLCanvasElement, file!: HTMLInputElement;
  const timeline = createTimeline(
    () => clipInfo(history.project(), clip()).duration,
    () => clip() === 'idle'
  );
  const select = (value: Selection) => {
    history.finish();
    timeline.seek(0);
    setSelection(value);
    if (value.kind === 'preview') setClip(value.id);
  };
  const time = () => {
    if (!stepped()) return timeline.time();
    const plan = framePlan(clipInfo(history.project(), clip()));
    return plan[
      Math.min(plan.length - 1, Math.floor(timeline.time() * plan.length))
    ].t;
  };
  const preview = createPreview(
    () => canvas,
    history.project,
    () => previewPose(history.project(), selection(), time()),
    transparent
  );
  const exportUrls = new Set<string>();
  onCleanup(() => {
    for (const url of exportUrls) URL.revokeObjectURL(url);
  });
  const download = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    exportUrls.add(url);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
  };
  const open = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > MAX_PROJECT_BYTES)
        throw Error('Project must be smaller than 1 MB.');
      history.replace(parseProject(await file.text()));
      select({ kind: 'neutral' });
    } catch (error) {
      history.setError(
        error instanceof Error ? error.message : 'Import failed'
      );
    }
  };
  const traverse = (redo: boolean) => {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement) active.blur();
    timeline.pause();
    if (redo) history.redo();
    else history.undo();
  };
  const keydown = (event: KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.isComposing)
      return;
    const key = event.key.toLowerCase();
    if (key !== 'z' && !(key === 'y' && event.ctrlKey && !event.metaKey))
      return;
    event.preventDefault();
    event.stopPropagation();
    traverse(key === 'y' || event.shiftKey);
  };
  return (
    <main class="h-full overflow-auto bg-surface text-ink" onKeyDown={keydown}>
      <header class="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-edge-muted bg-surface p-3">
        <h1 class="mr-3 font-semibold">Variant designer</h1>
        <Input
          class="max-w-56"
          aria-label="Variant name"
          value={history.project().name}
          maxLength={80}
          onFocus={history.begin}
          onInput={(e) =>
            history.edit((p) => {
              p.name = e.currentTarget.value;
            })
          }
          onBlur={history.finish}
        />
        <Button
          variant="outline"
          disabled={!history.canUndo()}
          onClick={() => traverse(false)}
        >
          Undo
        </Button>
        <Button
          variant="outline"
          disabled={!history.canRedo()}
          onClick={() => traverse(true)}
        >
          Redo
        </Button>
        <Button variant="outline" onClick={() => file.click()}>
          Open JSON
        </Button>
        <Button
          variant="accent"
          onClick={() =>
            download(
              new Blob([JSON.stringify(history.project(), null, 2)], {
                type: 'application/json',
              }),
              'mascot-project.json'
            )
          }
        >
          Save JSON
        </Button>
        <span class="text-xs text-ink-muted">
          {history.saved() ? 'Saved locally' : 'Saving…'}
        </span>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          class="hidden"
          aria-label="Import project"
          onChange={(e) => {
            void open(e.currentTarget.files?.[0]);
            e.currentTarget.value = '';
          }}
        />
      </header>
      <Show when={history.error() || preview.error()}>
        <p
          role="alert"
          class="m-3 rounded border border-failure p-3 text-failure"
        >
          {history.error() || preview.error()}
        </p>
      </Show>
      <div class="grid items-start gap-4 p-4 xl:grid-cols-[220px_minmax(300px,1fr)_340px]">
        <nav class="space-y-3" aria-label="Variant poses">
          <Button variant="outline" onClick={() => select({ kind: 'neutral' })}>
            Neutral Variant
          </Button>
          <div class="flex flex-wrap gap-2">
            <For each={EXPRESSIONS}>
              {(id) => (
                <Button
                  variant="outline"
                  onClick={() => select({ kind: 'expression', id })}
                >
                  {id}
                </Button>
              )}
            </For>
          </div>
          <h2 class="text-sm font-semibold">
            Idle poses · {history.project().idle.length}/8
          </h2>
          <div class="flex flex-wrap gap-1">
            <For
              each={Array.from(
                { length: history.project().idle.length },
                (_, i) => i
              )}
            >
              {(index) => (
                <Button
                  variant="outline"
                  onClick={() => select({ kind: 'idle', index })}
                >
                  {index === 0 ? '1 · neutral' : index + 1}
                </Button>
              )}
            </For>
          </div>
          <div class="flex gap-1">
            <Button
              disabled={history.project().idle.length >= 8}
              onClick={() => {
                history.transaction((p) => {
                  p.idle.push(clone(p.idle.at(-1)!));
                });
                select({
                  kind: 'idle',
                  index: history.project().idle.length - 1,
                });
              }}
            >
              Add pose
            </Button>
            <Button
              disabled={
                selection().kind !== 'idle' ||
                (selection() as { index: number }).index === 0
              }
              onClick={() => {
                const selected = selection();
                if (selected.kind !== 'idle' || selected.index === 0) return;
                history.transaction((p) => {
                  p.idle.splice(Math.min(selected.index, p.idle.length - 1), 1);
                });
                select({ kind: 'idle', index: 0 });
              }}
            >
              Remove pose
            </Button>
          </div>
          <h2 class="text-sm font-semibold">Generated motion</h2>
          <For each={['intro', 'idle', 'blink', ...EXPRESSIONS] as ClipId[]}>
            {(id) => (
              <Button
                variant="ghost"
                onClick={() => select({ kind: 'preview', id })}
              >
                {id === 'intro' ? 'Logo ↔ neutral' : `${id} preview`}
              </Button>
            )}
          </For>
          <Button variant="outline" onClick={() => select({ kind: 'logo' })}>
            Design starting logo
          </Button>
          <h2 class="text-sm font-semibold">Look directions</h2>
          <Compass
            value={
              selection().kind === 'look'
                ? (selection() as { index: LookIndex | null }).index
                : null
            }
            onChange={(index) => select({ kind: 'look', index })}
          />
          <p class="text-xs text-ink-muted">
            Center is neutral. Eight compass looks are exported.
          </p>
        </nav>
        <section class="space-y-4">
          <div class="rounded-xl border border-edge-muted bg-panel p-4">
            <div class="mb-2 flex justify-between text-xs text-ink-muted">
              <span>{selection().kind}</span>
              <span>512 × 512 preview</span>
            </div>
            <canvas
              ref={canvas}
              width={512}
              height={512}
              class="mx-auto aspect-square w-full max-w-lg"
              aria-label="Variant preview"
            />
            <label class="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={transparent()}
                onChange={(e) => setTransparent(e.currentTarget.checked)}
              />
              Transparent background
            </label>
            <Button
              onClick={() => {
                timeline.pause();
                canvas.toBlob((blob) => {
                  if (blob) download(blob, 'mascot-frame.png');
                });
              }}
            >
              Save frame
            </Button>
          </div>
          <Show when={selection().kind === 'preview'}>
            <section class="space-y-2 rounded-xl border border-edge-muted p-3">
              <div class="flex gap-2">
                <Button variant="outline" onClick={timeline.toggle}>
                  {timeline.playing() ? 'Pause' : 'Play'}
                </Button>
                <Button variant="outline" onClick={timeline.flip}>
                  {timeline.reverse() ? 'Reverse' : 'Forward'}
                </Button>
                <Button
                  onClick={() => timeline.seek(timeline.reverse() ? 1 : 0)}
                >
                  Restart
                </Button>
              </div>
              <input
                class="w-full"
                type="range"
                aria-label="Timeline"
                min="0"
                max="1"
                step="0.001"
                value={timeline.time()}
                onInput={(e) => timeline.seek(Number(e.currentTarget.value))}
              />
              <div class="max-w-sm">
                <TabbedControl
                  list={[
                    { value: 'smooth', label: 'Smooth motion' },
                    { value: 'baked', label: 'Baked frames' },
                  ]}
                  value={stepped() ? 'baked' : 'smooth'}
                  onChange={(value) => setStepped(value === 'baked')}
                />
              </div>
              <Show when={stepped()}>
                <p class="text-xs text-ink-muted">
                  Stepped preview: {clipInfo(history.project(), clip()).frames}{' '}
                  baked frames. Choose Smooth motion to preview the animation
                  between frames.
                </p>
              </Show>
            </section>
          </Show>
          <BakePanel project={history.project()} />
        </section>
        <PoseInspector
          project={history.project()}
          selection={selection()}
          begin={() => {
            timeline.pause();
            history.begin();
          }}
          finish={history.finish}
          cancel={history.cancel}
          edit={history.edit}
        />
      </div>
    </main>
  );
}
