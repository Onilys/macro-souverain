import { toast } from '@core/component/Toast/Toast';
import { ThrownResultError } from '@core/util/result';
import PlusIcon from '@phosphor/plus.svg';
import {
  useDeleteHarnessMutation,
  useHarnessesQuery,
} from '@queries/harnesses/harnesses';
import type { Harness as RegisteredHarness } from '@service-storage/client';
import { Button, Dialog, Panel } from '@ui';
import { createSignal, For, Show } from 'solid-js';
import { HarnessModels } from './components/harness-models';
import { ConnectAction, StatusDot } from './integration-ui';
import { SettingsCard, SettingsPage } from './primitives';
import { RuntimePairingPage } from './RuntimePairingPage';

function failureMessage(error: unknown, fallback: string): string {
  return (error instanceof ThrownResultError && error.message) || fallback;
}

function lastConnectedText(harness: RegisteredHarness): string {
  return harness.last_connected_at
    ? `Last connected ${new Date(harness.last_connected_at).toLocaleString()}`
    : 'Never connected';
}

/** Paired macrod machines, opened from Agents rather than a Runtimes tab. */
export function Harness(props: {
  onBack: () => void;
  onChooseModel: (harness: { id: string; modelId: string }) => void;
}) {
  const harnessesQuery = useHarnessesQuery();
  const deleteHarnessMutation = useDeleteHarnessMutation();
  const [pairing, setPairing] = createSignal(false);
  const [removingHarness, setRemovingHarness] =
    createSignal<RegisteredHarness>();

  const removeHarness = async () => {
    const current = removingHarness();
    if (!current) return;

    try {
      await deleteHarnessMutation.mutateAsync({ harnessId: current.id });
      setRemovingHarness(undefined);
      toast.success('Runtime removed');
    } catch (error) {
      toast.failure(failureMessage(error, 'Failed to remove runtime'));
    }
  };

  return (
    <>
      <Show when={!pairing()}>
        <SettingsPage
          title="Your harness"
          description="Machines your agents can run on. Choose a model to create an agent."
          onBack={props.onBack}
          backLabel="Agents"
          actions={
            <Button variant="cta" size="sm" onClick={() => setPairing(true)}>
              <PlusIcon />
              New runtime
            </Button>
          }
        >
          <Show
            when={harnessesQuery.isSuccess && harnessesQuery.data.length === 0}
          >
            <SettingsCard>
              <div class="flex flex-col items-center py-8 text-center">
                <p class="text-sm text-ink">No paired machines yet</p>
                <p class="mt-1 text-xs text-ink-muted">
                  Pair macrod to run an agent on your own computer.
                </p>
              </div>
            </SettingsCard>
          </Show>
          <Show
            when={!harnessesQuery.isSuccess || harnessesQuery.data.length > 0}
          >
            <SettingsCard>
              <For
                each={harnessesQuery.isSuccess ? harnessesQuery.data : []}
                fallback={
                  <div class="flex flex-col items-center py-6 text-center">
                    <p class="text-sm text-ink">
                      {harnessesQuery.isError
                        ? 'Could not load runtimes.'
                        : 'Loading runtimes…'}
                    </p>
                  </div>
                }
              >
                {(harness) => (
                  <div class="flex flex-col gap-3 px-4 py-3">
                    <div class="flex items-center justify-between gap-4">
                      <div class="min-w-0 flex-1">
                        <div class="flex min-w-0 items-center gap-2">
                          <p class="min-w-0 flex-1 truncate text-sm text-ink">
                            {harness.name}
                          </p>
                          <span class="inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-md border border-edge-muted px-2 text-xxs/none font-medium uppercase text-ink-extra-muted">
                            {harness.owner.type === 'team' ? 'Team' : 'Private'}
                          </span>
                          <StatusDot
                            state={
                              harness.connected ? 'connected' : 'disconnected'
                            }
                            label={
                              harness.connected ? 'Connected' : 'Disconnected'
                            }
                          />
                        </div>
                        <p class="mt-0.5 truncate text-xs text-ink-extra-muted">
                          {lastConnectedText(harness)}
                        </p>
                      </div>
                      <div class="shrink-0">
                        <ConnectAction
                          label="Remove"
                          variant="danger"
                          onClick={() => setRemovingHarness(harness)}
                        />
                      </div>
                    </div>
                    <HarnessModels
                      harnessId={harness.id}
                      harnessName={harness.name}
                      connected={harness.connected}
                      onChoose={(modelId) =>
                        props.onChooseModel({ id: harness.id, modelId })
                      }
                    />
                  </div>
                )}
              </For>
              <Show when={harnessesQuery.isError}>
                <p class="px-4 py-3 text-xs text-negative">
                  Could not load your runtimes. Try refreshing this page.
                </p>
              </Show>
            </SettingsCard>
          </Show>
        </SettingsPage>
      </Show>

      <Show when={pairing()}>
        <RuntimePairingPage onClose={() => setPairing(false)} />
      </Show>
      <Show when={removingHarness()} keyed>
        {(harness) => (
          <HarnessRemoveDialog
            harnessName={harness.name}
            pending={deleteHarnessMutation.isPending}
            onClose={() => setRemovingHarness(undefined)}
            onConfirm={() => void removeHarness()}
          />
        )}
      </Show>
    </>
  );
}

function HarnessRemoveDialog(props: {
  harnessName: string;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && !props.pending && props.onClose()}
      position="center"
      visibleScrim
      class="w-[min(480px,calc(100vw-16px))]"
    >
      <Panel depth={2} class="rounded-xl text-ink">
        <Panel.Header class="px-5 py-3">
          <Dialog.Title class="text-sm font-semibold">
            Remove {props.harnessName}?
          </Dialog.Title>
        </Panel.Header>
        <Panel.Body class="p-5">
          <Dialog.Description class="text-sm leading-5 text-ink-muted">
            Agents using this runtime will stop running until it's reconnected.
            macrod on that machine will need to pair again.
          </Dialog.Description>
        </Panel.Body>
        <Panel.Footer class="justify-end gap-2 px-5 py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={props.pending}
            onClick={props.onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="strong"
            size="sm"
            disabled={props.pending}
            onClick={props.onConfirm}
          >
            {props.pending ? 'Removing…' : 'Remove runtime'}
          </Button>
        </Panel.Footer>
      </Panel>
    </Dialog>
  );
}
