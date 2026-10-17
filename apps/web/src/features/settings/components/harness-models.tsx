import { ModelCatalogPicker } from '@core/component/AI/component/input/ModelCatalogPicker';
import { isLargeModelCatalog } from '@core/component/AI/component/input/modelCatalog';
import { useAgentModelsQuery } from '@queries/agents/models';
import { Button } from '@ui';
import { Show } from 'solid-js';
import { SettingsSelect } from './settings-select';

/**
 * Live models for a paired macrod machine. Choosing one starts an agent on
 * that runtime from the Agents page, instead of a separate runtimes screen.
 */
export function HarnessModels(props: {
  harnessId: string;
  harnessName: string;
  connected: boolean;
  onChoose: (modelId: string) => void;
}) {
  const models = useAgentModelsQuery(
    () => ({ harness: 'macrod', harnessId: props.harnessId }),
    () => props.connected
  );
  const data = () => (models.isSuccess ? models.data : undefined);
  const options = () =>
    data()?.status === 'available' ? (data()?.models ?? []) : [];
  const catalog = () =>
    options().map((model) => ({
      id: model.id,
      label: model.name,
      description: model.description ?? undefined,
      group: model.group ?? undefined,
    }));

  return (
    <div class="flex min-w-0 flex-col gap-1.5">
      <span class="text-xs font-medium text-ink-muted">Model</span>
      <Show
        when={props.connected}
        fallback={
          <p class="text-xs text-ink-muted">
            Reconnect this machine to load models.
          </p>
        }
      >
        <Show
          when={!models.isPending}
          fallback={
            <SettingsSelect
              label={`Models for ${props.harnessName}`}
              options={[]}
              placeholder="Loading models…"
              onChange={props.onChoose}
              disabled
            />
          }
        >
          <Show
            when={!models.isError}
            fallback={
              <div class="flex items-center gap-2">
                <p class="min-w-0 flex-1 text-xs text-negative">
                  Could not load models for {props.harnessName}.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`Retry models for ${props.harnessName}`}
                  onClick={() => void models.refetch()}
                >
                  Retry
                </Button>
              </div>
            }
          >
            <Show
              when={data()?.status === 'available'}
              fallback={
                <p class="text-xs text-ink-muted">
                  Model selection is unsupported by this runtime.
                </p>
              }
            >
              <Show
                when={options().length > 0}
                fallback={
                  <p class="text-xs text-ink-muted">
                    This runtime did not return any models.
                  </p>
                }
              >
                <Show
                  when={isLargeModelCatalog(catalog())}
                  fallback={
                    <SettingsSelect
                      label={`Models for ${props.harnessName}`}
                      options={options()}
                      placeholder="Choose a model"
                      onChange={props.onChoose}
                    />
                  }
                >
                  <ModelCatalogPicker
                    value={null}
                    options={catalog()}
                    onSelect={props.onChoose}
                    ariaLabel={`Models for ${props.harnessName}`}
                    placeholder="Choose a model"
                    triggerClass="h-9 w-full justify-between text-base [&>span]:flex-1"
                    placement="bottom-start"
                  />
                </Show>
              </Show>
            </Show>
          </Show>
        </Show>
      </Show>
    </div>
  );
}
