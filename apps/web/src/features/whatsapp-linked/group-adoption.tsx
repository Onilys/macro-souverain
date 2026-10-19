import { useFeatureFlag } from '@app/lib/analytics/posthog';
import { enableWhatsappLinked } from '@core/constant/featureFlags';
import { useUserId } from '@core/context/user';
import { idToDisplayName } from '@core/user';
import { queryReadyGate } from '@queries/gate';
import { useCurrentTeamQuery } from '@queries/team/teams';
import { useLinkedActions, useLinkedGroups } from '@queries/whatsapp-linked';
import { Button, Checkbox, Dialog, Panel } from '@ui';
import { createSignal, For, Show, Suspense } from 'solid-js';
export function ConnectWhatsAppGroup(props: {
  onConnected: (channel: string) => void;
}) {
  const flag = useFeatureFlag(enableWhatsappLinked);
  const [open, setOpen] = createSignal(false);
  return (
    <Show when={flag().enabled}>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Connect WhatsApp group
      </Button>
      <Show when={open()}>
        <Suspense fallback={<p role="status">Loading your groups…</p>}>
          <GroupChoice
            onClose={() => setOpen(false)}
            onConnected={props.onConnected}
          />
        </Suspense>
      </Show>
    </Show>
  );
}
function GroupChoice(props: {
  onClose: () => void;
  onConnected: (channel: string) => void;
}) {
  const user = useUserId();
  const team = useCurrentTeamQuery();
  const groups = useLinkedGroups(
    () => user() ?? '',
    () => true
  );
  const actions = useLinkedActions();
  const [selected, setSelected] = createSignal('');
  const [error, setError] = createSignal('');
  const [audience, setAudience] = createSignal<string[]>([]);
  const currentTeam = () =>
    queryReadyGate(team) ? team.data?.team : undefined;
  async function adopt() {
    const target = currentTeam();
    if (!target || !user() || !selected()) return;
    setError('');
    try {
      const result = await actions.adopt.mutateAsync({
        team_id: target.id,
        group_jid: selected(),
        users: [user()!, ...audience()],
      });
      props.onConnected(result.channel_id);
      props.onClose();
    } catch {
      setError(
        'This group could not be connected. Check your WhatsApp membership and Macro access, then try again.'
      );
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(value) => {
        if (!value) props.onClose();
      }}
      class="w-120"
    >
      <Panel depth={2}>
        <Panel.Body>
          <div class="flex flex-col gap-4 p-6">
            <Dialog.Title class="text-lg font-semibold">
              Connect WhatsApp group
            </Dialog.Title>
            <p class="text-sm text-ink-muted">
              Choose an existing group for{' '}
              {currentTeam()?.name ?? 'this workspace'}. Select the teammates
              who should have Macro access. Each must connect their own WhatsApp
              account and belong to this group. Messages are shared from this
              connection onward.
            </p>
            <Show
              when={queryReadyGate(groups)}
              fallback={<p role="status">Loading groups…</p>}
            >
              <div class="max-h-64 overflow-auto flex flex-col gap-2">
                <For each={groups.data ?? []}>
                  {(group) => (
                    <Button
                      variant={selected() === group.jid ? 'accent' : 'ghost'}
                      class="justify-between"
                      onClick={() => setSelected(group.jid)}
                    >
                      <span class="truncate">{group.name}</span>
                      <span class="text-xs text-ink-muted">
                        {group.participants.length} people
                      </span>
                    </Button>
                  )}
                </For>
              </div>
            </Show>
            <fieldset class="flex flex-col gap-2">
              <legend class="text-sm font-medium">Macro access</legend>
              <p class="text-xs text-ink-muted">
                You and the selected teammates receive this group’s shared
                history in Macro.
              </p>
              <For
                each={
                  queryReadyGate(team)
                    ? (team.data?.members.filter(
                        (member) => member.user_id !== user()
                      ) ?? [])
                    : []
                }
              >
                {(member) => (
                  <Checkbox
                    checked={audience().includes(member.user_id)}
                    onChange={(checked) =>
                      setAudience((previous) =>
                        checked
                          ? [...previous, member.user_id]
                          : previous.filter((id) => id !== member.user_id)
                      )
                    }
                  >
                    <Checkbox.Control />
                    <Checkbox.Label>
                      {idToDisplayName(member.user_id)}
                    </Checkbox.Label>
                  </Checkbox>
                )}
              </For>
            </fieldset>
            <Show when={groups.isError}>
              <p role="alert" class="text-sm">
                Connect your WhatsApp account in Settings, then try again.
              </p>
            </Show>
            <Show when={error()}>
              <p role="alert" class="text-sm text-ink-muted">
                {error()}
              </p>
            </Show>
            <div class="flex justify-end gap-2">
              <Button variant="ghost" onClick={props.onClose}>
                Cancel
              </Button>
              <Button
                disabled={!selected() || actions.adopt.isPending}
                onClick={() => void adopt()}
              >
                Connect group
              </Button>
            </div>
          </div>
        </Panel.Body>
      </Panel>
    </Dialog>
  );
}
