import { createSignal, For, Show } from 'solid-js';
import {
  DESMOS_COLORS,
  type Expression,
  type PlotScene,
} from '../core/document';

export function ExpressionList(props: {
  expressions: Expression[];
  scene: PlotScene | undefined;
  canEdit: boolean;
  onChange: (id: string, latex: string) => void;
  onToggle: (id: string, hidden: boolean) => void;
  onColor: (id: string, color: string) => void;
  onSlider: (id: string, value: number) => void;
  onAddSlider: (name: string) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}) {
  const [selected, setSelected] = createSignal<string | undefined>();
  const errorFor = (id: string) => {
    const item = props.scene?.items.find((entry) => entry.id === id);
    return item?.kind === 'error' ? item : undefined;
  };

  return (
    <div
      class="flex h-full min-h-0 w-[324px] shrink-0 flex-col border-r border-edge bg-surface"
      data-testid="desmos-expressions"
    >
      <div class="flex h-9 items-center px-1.5">
        <Show when={props.canEdit}>
          <button
            type="button"
            class="grid size-7 place-items-center text-[22px] leading-none text-ink-muted hover:text-accent"
            title="Add expression"
            onClick={() => props.onAdd()}
          >
            +
          </button>
        </Show>
      </div>
      <div class="min-h-0 flex-1 overflow-auto">
        <For each={props.expressions}>
          {(expr, index) => {
            const value = () => assignmentValue(expr.latex);
            return (
              <div
                class="group border-b border-edge px-1.5 py-1.5"
                classList={{ 'bg-ink-extra-muted/10': selected() === expr.id }}
                data-testid={`desmos-expression-${expr.id}`}
                onMouseDown={() => setSelected(expr.id)}
              >
                <div class="flex items-start gap-1.5">
                  <div class="flex w-7 shrink-0 flex-col items-center gap-1 pt-0.5">
                    <span class="text-[11px] text-ink-extra-muted">
                      {index() + 1}
                    </span>
                    <button
                      type="button"
                      class="size-3.5 rounded-full border-2"
                      style={{
                        'background-color': expr.hidden
                          ? 'transparent'
                          : expr.color,
                        'border-color': expr.color,
                      }}
                      title={expr.hidden ? 'Show' : 'Hide'}
                      onClick={() => props.onToggle(expr.id, !expr.hidden)}
                    />
                  </div>
                  <div class="min-w-0 flex-1">
                    <input
                      class="w-full bg-transparent text-[16.5px] text-ink outline-none"
                      style={{
                        'font-family':
                          '"Times New Roman", "STIX Two Math", ui-serif, serif',
                      }}
                      value={expr.latex}
                      placeholder="y=x^2"
                      disabled={!props.canEdit}
                      spellcheck={false}
                      onInput={(event) =>
                        props.onChange(expr.id, event.currentTarget.value)
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && props.canEdit) {
                          event.preventDefault();
                          props.onAdd();
                        }
                        if (
                          event.key === 'Backspace' &&
                          expr.latex === '' &&
                          props.canEdit &&
                          props.expressions.length > 1
                        ) {
                          event.preventDefault();
                          props.onRemove(expr.id);
                        }
                      }}
                    />
                    <Show when={errorFor(expr.id)}>
                      {(error) => (
                        <div class="pt-0.5 text-[11px] text-negative">
                          {error().message}
                        </div>
                      )}
                    </Show>
                    <Show when={expr.slider && value() != null}>
                      <div class="mt-1 flex items-center gap-2">
                        <input
                          type="range"
                          class="min-w-0 flex-1 accent-[var(--slider-color)]"
                          style={{ '--slider-color': expr.color }}
                          min={expr.slider?.min ?? -10}
                          max={expr.slider?.max ?? 10}
                          step={expr.slider?.step ?? 0.01}
                          value={value() ?? 0}
                          disabled={!props.canEdit}
                          onInput={(event) =>
                            props.onSlider(
                              expr.id,
                              Number(event.currentTarget.value)
                            )
                          }
                        />
                        <span
                          class="w-10 text-right text-[12px] text-ink-muted"
                          style={{
                            'font-family': '"Times New Roman", ui-serif, serif',
                          }}
                        >
                          {formatSlider(value() ?? 0)}
                        </span>
                      </div>
                    </Show>
                    <Show when={selected() === expr.id && props.canEdit}>
                      <div class="mt-1.5 flex gap-1">
                        <For each={DESMOS_COLORS}>
                          {(color) => (
                            <button
                              type="button"
                              class="size-3.5 rounded-full border"
                              classList={{
                                'ring-1 ring-[#222] ring-offset-1':
                                  expr.color === color,
                              }}
                              style={{
                                'background-color': color,
                                'border-color': color,
                              }}
                              title={color}
                              onClick={() => props.onColor(expr.id, color)}
                            />
                          )}
                        </For>
                      </div>
                    </Show>
                  </div>
                  <Show when={props.canEdit && props.expressions.length > 1}>
                    <button
                      type="button"
                      class="mt-0.5 hidden px-1 text-[16px] text-ink-extra-muted group-hover:block hover:text-negative"
                      title="Remove"
                      onClick={() => props.onRemove(expr.id)}
                    >
                      ×
                    </button>
                  </Show>
                </div>
              </div>
            );
          }}
        </For>
        <Show
          when={(props.scene?.neededSliders?.length ?? 0) > 0 && props.canEdit}
        >
          <div class="flex flex-wrap gap-1 px-3 py-2 text-[12px]">
            <For each={props.scene?.neededSliders ?? []}>
              {(name) => (
                <button
                  type="button"
                  class="rounded-full bg-accent-bg px-2 py-0.5 text-accent"
                  onClick={() => props.onAddSlider(name)}
                >
                  add slider: {name}
                </button>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}

function assignmentValue(latex: string): number | null {
  const match = latex.match(/^[A-Za-z]\w*\s*=\s*(-?\d+(?:\.\d+)?)\s*$/);
  return match ? Number(match[1]) : null;
}

function formatSlider(value: number): string {
  return String(Number(value.toPrecision(4)));
}
