import CaretLeft from '@phosphor/caret-left.svg';
import CaretRight from '@phosphor/caret-right.svg';
import type { SessionConfigOption } from '@service-agent-fold/generated/types';
import { Dropdown, Slider } from '@ui';
import { createSignal, For, type JSX, Show } from 'solid-js';
import { ModelIcon } from '../ProviderIcon';

export type ModelEffortConfig = Extract<
  SessionConfigOption,
  { type: 'select' }
>;

/** A compact model overview; browsing retains the complete model/agent catalog. */
export function ModelEffortMenu(props: {
  model?: string | null;
  label: string;
  config?: ModelEffortConfig;
  value?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
  children: JSX.Element;
}) {
  const [browsing, setBrowsing] = createSignal(false);
  let overview: HTMLElement | undefined;
  const choices = () => props.config?.options ?? [];
  const available = () => choices().length > 1 && !!props.onChange;
  const [dragIndex, setDragIndex] = createSignal<number>();
  let dragging = false;
  const index = () =>
    dragIndex() ??
    Math.max(
      0,
      choices().findIndex(
        (choice) => choice.value === (props.value ?? props.config?.currentValue)
      )
    );
  const label = () => choices()[index()]?.name;
  const commit = (next: number) => {
    const choice = choices()[next];
    if (choice && !props.disabled) props.onChange?.(choice.value);
  };

  return (
    <Show
      when={available() && !browsing()}
      fallback={
        <>
          <Show when={available()}>
            <Dropdown.Item
              closeOnSelect={false}
              onSelect={() => {
                setBrowsing(false);
                queueMicrotask(() => overview?.focus());
              }}
            >
              <CaretLeft class="size-4" />
              Model and effort
            </Dropdown.Item>
          </Show>
          {props.children}
        </>
      }
    >
      <div class="px-3 pb-3 pt-1">
        <Dropdown.Item
          ref={overview}
          closeOnSelect={false}
          aria-label="Choose model"
          class="mb-2 h-9 gap-2 rounded-xl px-0 hover:bg-transparent"
          onSelect={() => setBrowsing(true)}
        >
          <ModelIcon
            model={props.model}
            class="size-4 shrink-0 text-ink-muted"
          />
          <span class="flex min-w-0 flex-1 items-center justify-center gap-1">
            <span class="truncate text-base font-medium">{props.label}</span>
            <span class="shrink-0 text-base font-normal text-ink-muted">
              {label()}
            </span>
            <CaretRight class="size-3 shrink-0 text-ink-muted" />
          </span>
        </Dropdown.Item>
        <Slider
          class="px-3.5"
          aria-label="Reasoning effort"
          minValue={0}
          maxValue={Math.max(1, choices().length - 1)}
          step={1}
          value={[index()]}
          getValueLabel={() => label() ?? ''}
          disabled={props.disabled}
          onChange={([next]) => {
            if (dragging) setDragIndex(next);
            else commit(next);
          }}
          onChangeEnd={([next]) => {
            if (!dragging) return;
            dragging = false;
            commit(next);
            setDragIndex(undefined);
          }}
          onKeyDown={(event: KeyboardEvent) => {
            // Arrow keys belong to the slider, not the menu's roving focus.
            if (
              [
                'ArrowLeft',
                'ArrowRight',
                'ArrowUp',
                'ArrowDown',
                'Home',
                'End',
              ].includes(event.key)
            )
              event.stopPropagation();
          }}
        >
          <Slider.Track
            class="my-0 h-6 bg-transparent"
            onPointerDown={() => {
              dragging = true;
            }}
            onPointerCancel={() => {
              dragging = false;
              setDragIndex(undefined);
            }}
          >
            <div
              aria-hidden="true"
              class="pointer-events-none absolute -inset-x-3.5 inset-y-0 rounded-full bg-ink/10 shadow-[inset_0_0_0_0.5px_color-mix(in_srgb,var(--color-ink)_10%,transparent)]"
            />
            <Slider.Fill class="bg-blue" style={{ left: '-14px' }} />
            <div
              aria-hidden="true"
              class="pointer-events-none absolute inset-x-0 inset-y-0 flex items-center justify-between"
            >
              <For each={choices()}>
                {(_, i) => (
                  <span
                    class="size-1 rounded-full"
                    classList={{
                      'bg-panel/40': i() <= index(),
                      'bg-ink-muted/50': i() > index(),
                    }}
                  />
                )}
              </For>
            </div>
            <Slider.Thumb
              onPointerDown={() => {
                dragging = true;
              }}
              onPointerCancel={() => {
                dragging = false;
                setDragIndex(undefined);
              }}
              aria-label="Reasoning effort"
              aria-valuetext={label()}
              class="size-7 border-ink/15 bg-composer-action shadow-[0_0_2px_0_color-mix(in_srgb,var(--color-ink)_10%,transparent)] light-mode:bg-panel focus-visible:ring-blue focus-visible:ring-offset-0"
            >
              <Slider.Input />
            </Slider.Thumb>
          </Slider.Track>
        </Slider>
      </div>
    </Show>
  );
}
