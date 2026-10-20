import {
  AgentModelSelector,
  type AgentModelSelectorProps,
} from '@app/features/block-agent/ui/AgentModelSelector';
import {
  ModelCatalogPicker,
  type ModelRowProps,
} from '@core/component/AI/component/input/ModelCatalogPicker';
import {
  type ModelEffortConfig,
  ModelEffortMenu,
} from '@core/component/AI/component/input/ModelEffortMenu';
import { modelLabel } from '@core/component/AI/constant/model-label';
import { isTouchDevice } from '@core/mobile/isTouchDevice';
import type { Component, JSX } from 'solid-js';
import { Show } from 'solid-js';

export type ModelChoice = {
  id: string;
  name: string;
  description?: string;
  group?: string;
};

/** The settings catalog with a compact trigger for new and running sessions. */
export function ModelSelector(props: {
  model?: string;
  label: JSX.Element;
  options: ModelChoice[];
  disabled?: boolean;
  modelRow?: Component<ModelRowProps>;
  pending?: boolean;
  effort?: ModelEffortConfig;
  effortValue?: string;
  onEffortChange?: (value: string) => void;
  onSelect: (id: string) => void;
  onCloseAutoFocus?: (event: Event) => void;
  children?: JSX.Element;
  emptyMessage?: string;
}) {
  return (
    <ModelCatalogPicker
      onCloseAutoFocus={props.onCloseAutoFocus}
      value={props.model ?? null}
      options={props.options.map((option) => ({
        id: option.id,
        label: modelLabel(option.id, option.name),
        description: option.description,
        group: option.group,
      }))}
      triggerLabel={props.label}
      placeholder={modelLabel(props.model)}
      triggerClass="h-9 min-w-0 max-w-full gap-1 rounded-full border-0 bg-transparent hover:bg-ink/5 data-expanded:bg-ink/5 px-2 text-base font-normal text-ink [&_svg]:size-4"
      contentClass="w-70 rounded-2xl border-0 after:hidden shadow-[0_0_0_1px_var(--color-drop-shadow),0_2px_8px_0_var(--color-drop-shadow),0_4px_80px_8px_var(--color-drop-shadow)]"
      menu={(catalog) => (
        <ModelEffortMenu
          model={props.model}
          label={modelLabel(
            props.model,
            props.options.find((option) => option.id === props.model)?.name
          )}
          config={props.effort}
          value={props.effortValue}
          disabled={props.disabled || props.pending}
          onChange={props.onEffortChange}
        >
          {catalog}
        </ModelEffortMenu>
      )}
      ariaLabel="Model"
      placement="bottom-end"
      disabled={props.disabled}
      pending={props.pending}
      onSelect={props.onSelect}
      modelRow={props.modelRow}
      emptyMessage={
        props.emptyMessage ?? 'Waiting for the agent to report its models.'
      }
    >
      {props.children}
    </ModelCatalogPicker>
  );
}

/** Use the session's advertised catalog and existing model-change action. */
export function SessionModelSelector(props: AgentModelSelectorProps) {
  const shown = () => props.changingTo ?? props.model ?? undefined;
  return (
    <Show when={!isTouchDevice()} fallback={<AgentModelSelector {...props} />}>
      <ModelSelector
        onCloseAutoFocus={props.onCloseAutoFocus}
        model={shown()}
        effort={props.effort}
        effortValue={props.effortValue}
        onEffortChange={props.onEffortChange}
        label={
          <>
            {modelLabel(
              shown(),
              props.options.find((option) => option.id === shown())?.name
            )}
            <Show when={props.effortLabel}>
              {' '}
              <span class="text-ink-muted">{props.effortLabel}</span>
            </Show>
          </>
        }
        modelRow={props.modelRow}
        options={props.options.map((option) => ({
          id: option.id,
          name: option.name,
          group: option.group ?? undefined,
          description: option.description ?? undefined,
        }))}
        disabled={props.disabled}
        pending={props.changingTo !== undefined}
        onSelect={(id) => {
          if (id !== props.model) props.onSelect(id);
        }}
      />
    </Show>
  );
}
