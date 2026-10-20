import CaretLeft from '@phosphor/caret-left.svg';
import CaretRight from '@phosphor/caret-right.svg';
import type { SessionConfigOption } from '@service-agent-fold/generated/types';
import { Dropdown, RadioGroup } from '@ui';
import { createSignal, For, type JSX, Show } from 'solid-js';
import { ModelIcon } from '../ProviderIcon';

export type ModelEffortConfig = Extract<
  SessionConfigOption,
  { type: 'select' }
>;

const depthDescriptions: Partial<Record<string, string>> = {
  default: 'Let the model choose how much to think.',
  auto: 'Let the model choose how much to think.',
  none: 'Keep thinking to a minimum.',
  minimal: 'Keep thinking to a minimum.',
  low: 'A little thought for straightforward tasks.',
  light: 'A little thought for straightforward tasks.',
  medium: 'More time to work through the details.',
  high: 'Take extra care with harder problems.',
  xhigh: 'Spend more time on complex problems.',
  max: 'Spend more time on complex problems.',
  ultra: 'Spend more time on complex problems.',
};

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
  const [previewValue, setPreviewValue] = createSignal<string>();
  const selectedValue = () => props.value ?? props.config?.currentValue;
  const selected = () =>
    choices().find((choice) => choice.value === selectedValue()) ??
    choices()[0];
  const preview = () =>
    choices().find((choice) => choice.value === previewValue()) ?? selected();
  const description = () =>
    preview()?.description ??
    depthDescriptions[preview()?.value.toLowerCase() ?? ''] ??
    'Set how deeply the model works through your request.';

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
          class="mb-3 h-10 gap-2 rounded-lg px-1"
          onSelect={() => setBrowsing(true)}
        >
          <ModelIcon
            model={props.model}
            class="size-4 shrink-0 text-ink-muted"
          />
          <span class="flex min-w-0 flex-1 items-center gap-2">
            <span class="truncate text-base font-medium">{props.label}</span>
            <CaretRight class="ml-auto size-3 shrink-0 text-ink-muted" />
          </span>
        </Dropdown.Item>
        <RadioGroup
          orientation="horizontal"
          value={selected()?.value}
          disabled={props.disabled}
          onChange={(value) => {
            if (!props.disabled) props.onChange?.(value);
            setPreviewValue(undefined);
          }}
          onPointerLeave={() => setPreviewValue(undefined)}
          on:keydown={(event: KeyboardEvent) => {
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
          class="gap-1 border-t border-edge-muted pt-3"
        >
          <RadioGroup.Label class="px-1 text-xs text-ink-muted">
            Thinking depth
          </RadioGroup.Label>
          <div class="flex items-end gap-1">
            <For each={choices()}>
              {(choice, i) => (
                <RadioGroup.Item
                  value={choice.value}
                  class="group/depth min-w-0 flex-1"
                  onPointerEnter={() => {
                    if (!props.disabled) setPreviewValue(choice.value);
                  }}
                >
                  <RadioGroup.ItemControl class="h-11 w-full items-end rounded-md border-0 bg-transparent pb-2 hover:bg-ink/4 data-checked:border-0 data-disabled:cursor-default peer-focus-visible:ring-offset-2">
                    <span
                      aria-hidden="true"
                      class="w-3 rounded-sm transition-colors motion-reduce:transition-none"
                      classList={{
                        'bg-accent': choice.value === selected()?.value,
                        'bg-ink/20 group-hover/depth:bg-ink/40':
                          choice.value !== selected()?.value,
                      }}
                      style={{
                        height: `${8 + (24 * i()) / Math.max(1, choices().length - 1)}px`,
                      }}
                    />
                  </RadioGroup.ItemControl>
                  <RadioGroup.ItemLabel class="sr-only">
                    {choice.name}
                  </RadioGroup.ItemLabel>
                </RadioGroup.Item>
              )}
            </For>
          </div>
          <div class="min-h-16 px-1 pt-1 text-sm leading-5">
            <span class="font-medium text-ink">{preview()?.name}</span>
            <span class="text-ink-muted"> · {description()}</span>
          </div>
        </RadioGroup>
      </div>
    </Show>
  );
}
