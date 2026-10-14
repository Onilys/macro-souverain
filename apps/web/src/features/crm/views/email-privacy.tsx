import { Button, Dialog, Panel } from '@ui';
import { createSignal, For, Show } from 'solid-js';
import {
  SettingsCard,
  SettingsRow,
  SettingsSection,
} from '../../settings/primitives';
import { useCrmContext } from '../context/crm-context';
import type { EmailBlockScope } from '../core/email-privacy';

type PrivacySource = ReturnType<
  ReturnType<typeof useCrmContext>['createEmailPrivacy']
>;

function DomainBlocklist(props: {
  source: PrivacySource;
  scope: EmailBlockScope;
}) {
  const [domain, setDomain] = createSignal('');
  const settings = () =>
    props.source.query.isSuccess ? props.source.query.data : undefined;
  const domains = () =>
    props.scope === 'team'
      ? settings()?.teamDomains
      : settings()?.personalDomains;
  const canRemove = () =>
    props.scope === 'personal' || settings()?.canRemoveTeamDomains;
  const busy = () => props.source.update.isPending;
  const add = (event: SubmitEvent) => {
    event.preventDefault();
    if (!domain().trim() || busy()) return;
    props.source.update.mutate(
      { action: 'add_domain', scope: props.scope, domain: domain().trim() },
      {
        onSuccess: () => setDomain(''),
      }
    );
  };
  return (
    <SettingsSection
      title={props.scope === 'team' ? 'Team blacklist' : 'My blacklist'}
    >
      <p class="text-sm text-ink-muted">
        {props.scope === 'team'
          ? 'These domains are excluded from everyone’s CRM email contributions. Any member can add a domain; only admins can remove one.'
          : 'These domains are excluded from your contributions. Teammates can still contribute their copies of the same conversation.'}{' '}
        Subdomains are included. A blocked participant excludes the entire email
        thread. Existing companies stay visible.
      </p>
      <SettingsCard>
        <For
          each={domains()}
          fallback={
            <p class="px-6 py-3 text-sm text-ink-muted">No domains blocked.</p>
          }
        >
          {(item) => (
            <SettingsRow label={item}>
              <Button
                variant="ghost"
                size="sm"
                disabled={!canRemove() || busy()}
                onClick={() =>
                  props.source.update.mutate({
                    action: 'remove_domain',
                    scope: props.scope,
                    domain: item,
                  })
                }
              >
                Remove
              </Button>
            </SettingsRow>
          )}
        </For>
        <form onSubmit={add} class="flex gap-2 px-6 py-3">
          <input
            aria-label={
              props.scope === 'team'
                ? 'Domain to block for the team'
                : 'Domain to block for my emails'
            }
            class="settings-input min-w-0 flex-1"
            placeholder="example.com"
            value={domain()}
            onInput={(e) => setDomain(e.currentTarget.value)}
          />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={busy() || !domain().trim()}
          >
            Add domain
          </Button>
        </form>
      </SettingsCard>
    </SettingsSection>
  );
}

export function CrmEmailPrivacySettings(props: { onOptIn?: () => void }) {
  const source = useCrmContext().createEmailPrivacy();
  const settings = () =>
    source.query.isSuccess ? source.query.data : undefined;
  return (
    <Show
      when={settings()}
      fallback={
        <p class="text-sm text-ink-muted" role="status">
          {source.query.isError
            ? 'Email settings could not be loaded.'
            : 'Loading email settings…'}
          <Show when={source.query.isError}>
            <Button variant="ghost" onClick={() => void source.query.refetch()}>
              Retry
            </Button>
          </Show>
        </p>
      }
    >
      <SettingsSection title="Your email contribution">
        <p class="text-sm text-ink-muted">
          Everyone on your team can use CRM and manage companies without sharing
          their email.
        </p>
        <SettingsCard>
          <SettingsRow
            label={settings()?.mailboxEmail ?? 'Connect your email first'}
            description={
              settings()?.enabled
                ? 'Your eligible emails are shared with your team.'
                : 'Your emails are not contributing to CRM.'
            }
          >
            <span class="text-sm text-ink-muted">
              {settings()?.enabled ? 'Sharing on' : 'Sharing off'}
            </span>
          </SettingsRow>
        </SettingsCard>
        <p class="text-sm text-ink-muted">
          Opting in shares the full content of all available past and future
          emails from this mailbox with your team, except blocked threads.
          Review both blacklists below first. Blocking a domain also hides
          previously shared matching threads. Stopping sharing withdraws your
          email contributions; companies and contacts remain.
        </p>
      </SettingsSection>
      <DomainBlocklist source={source} scope="team" />
      <DomainBlocklist source={source} scope="personal" />
      <div class="flex justify-end">
        <Button
          variant={settings()?.enabled ? 'outline' : 'cta'}
          disabled={!settings()?.mailboxEmail || source.update.isPending}
          onClick={() =>
            source.update.mutate(
              { action: 'set_consent', enabled: !settings()?.enabled },
              { onSuccess: (data) => data.enabled && props.onOptIn?.() }
            )
          }
        >
          {settings()?.enabled
            ? 'Stop sharing my emails'
            : 'Share my emails with CRM'}
        </Button>
      </div>
    </Show>
  );
}

export function CrmEmailOptInBanner() {
  const source = useCrmContext().createEmailPrivacy();
  const [open, setOpen] = createSignal(false);
  return (
    <>
      <Show when={source.query.isSuccess && !source.query.data?.enabled}>
        <div class="h-5 shrink-0 flex items-center justify-center gap-2 bg-accent/10 text-xs text-ink">
          <span>Your emails aren’t contributing to CRM.</span>
          <button type="button" class="underline" onClick={() => setOpen(true)}>
            Review and opt in
          </button>
        </div>
      </Show>
      <CrmEmailPrivacyDialog open={open()} onOpenChange={setOpen} />
    </>
  );
}

export function CrmEmailPrivacyDialog(props: {
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      class="w-[min(640px,95vw)] max-h-[85vh]"
    >
      <Panel depth={2} class="max-h-[85vh] text-ink rounded-xl">
        <Panel.Header class="px-4 py-3 flex items-center justify-between gap-4">
          <Dialog.Title class="text-base font-medium">
            Contribute your emails to CRM
          </Dialog.Title>
          <Dialog.CloseButton as={Button} variant="ghost" size="sm">
            Close
          </Dialog.CloseButton>
        </Panel.Header>
        <Panel.Body scroll class="p-4 flex flex-col gap-4">
          <CrmEmailPrivacySettings onOptIn={() => props.onOpenChange(false)} />
        </Panel.Body>
      </Panel>
    </Dialog>
  );
}
