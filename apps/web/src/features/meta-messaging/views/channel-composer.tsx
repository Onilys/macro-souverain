import { Layout } from '@channel/Input/Layout';
import { useUserId } from '@core/context/user';
import { isTouchDevice } from '@core/mobile/isTouchDevice';
import { openFilePicker } from '@core/util/upload';
import PaperclipIcon from '@phosphor/paperclip.svg';
import TemplateIcon from '@phosphor/text-align-left.svg';
import {
  useMetaReply,
  useMetaTemplates,
  useMetaUpload,
} from '@queries/meta-messaging';
import type { MetaConversationView } from '@service-storage/generated/schemas/metaConversationView';
import type { MetaSendProgress } from '@service-storage/generated/schemas/metaSendProgress';
import type { MetaSendReply } from '@service-storage/generated/schemas/metaSendReply';
import { Button, ComposerSurface, SendButton } from '@ui';
import {
  createSignal,
  For,
  type JSX,
  onCleanup,
  onMount,
  Show,
  Suspense,
} from 'solid-js';
import { match } from 'ts-pattern';
import { accountHealthMessage } from '../core/account-health';
import { messagingError } from '../core/delivery';
import { createReplyDraft, emptyReplyDraft } from '../primitives/reply-draft';

type MessagingComposerProps = {
  channelId: string;
  children: JSX.Element;
  account?: MetaConversationView | null;
  unavailable: boolean;
  loading?: boolean;
  onRefresh: () => void;
  onRecoverReady: (recover: (send: MetaSendProgress) => void) => () => void;
};

/** Customer channels expose one external composer; ordinary Macro channels keep their native input. */
export function ChannelMessagingComposer(props: MessagingComposerProps) {
  const userId = useUserId();
  return (
    <Show
      when={props.channelId && JSON.stringify([userId(), props.channelId])}
      keyed
    >
      {(_identity) => {
        const channelId = props.channelId;
        const draftUserId = userId();
        return (
          <Suspense
            fallback={<div class="h-16" aria-label="Loading conversation" />}
          >
            <MessagingComposer
              {...props}
              channelId={channelId}
              draftUserId={draftUserId}
            >
              {props.children}
            </MessagingComposer>
          </Suspense>
        );
      }}
    </Show>
  );
}

function MessagingComposer(
  props: MessagingComposerProps & { draftUserId: string | undefined }
) {
  return (
    <Show
      when={!props.loading}
      fallback={<div class="h-16" aria-label="Loading conversation" />}
    >
      <Show
        when={props.account}
        fallback={
          <Show
            when={!props.unavailable}
            fallback={
              <p role="status" class="px-3 py-2 text-sm text-ink-muted">
                Conversation unavailable.{' '}
                <button class="underline" onClick={props.onRefresh}>
                  Try again
                </button>
              </p>
            }
          >
            {props.children}
          </Show>
        }
      >
        {(account) => (
          <ExternalReply
            channelId={props.channelId}
            userId={props.draftUserId}
            account={account()}
            available={!props.unavailable}
            onRecoverReady={props.onRecoverReady}
          />
        )}
      </Show>
    </Show>
  );
}

function ExternalReply(props: {
  channelId: string;
  userId: string | undefined;
  account: MetaConversationView;
  available: boolean;
  onRecoverReady: (recover: (send: MetaSendProgress) => void) => () => void;
}) {
  const mutation = useMetaReply(() => props.channelId);
  const [draft, setDraft] = createReplyDraft(props.userId, props.channelId);
  const [checkedOriginalApp, setCheckedOriginalApp] = createSignal(false);
  const upload = useMetaUpload(() => props.channelId);
  let active = true;
  let closePicker: (() => void) | undefined;
  let textInput: HTMLTextAreaElement | undefined;
  const fitInput = () => {
    if (!textInput?.isConnected) return;
    textInput.style.height = 'auto';
    textInput.style.height = `${Math.min(textInput.scrollHeight, 225)}px`;
  };
  onCleanup(() => {
    active = false;
    closePicker?.();
  });
  onMount(() => onCleanup(props.onRecoverReady(restoreReply)));
  const [error, setError] = createSignal('');
  const [now, setNow] = createSignal(Date.now());
  onMount(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    onCleanup(() => window.clearInterval(timer));
  });
  const until = () =>
    props.account.conversation.standard_window_until
      ? Date.parse(props.account.conversation.standard_window_until)
      : 0;
  const open = () => until() > now();
  const whatsapp = () => props.account.provider === 'whatsapp';
  const needsTemplate = () => whatsapp() && (!open() || draft.templateMode);
  const connected = () => props.account.status === 'connected';
  const mediaCapability = () =>
    props.account.media.find((c) => c.kind === draft.attachment?.kind);
  const templates = useMetaTemplates(
    () => props.channelId,
    () =>
      props.available &&
      props.account.can_reply &&
      connected() &&
      needsTemplate()
  );
  const approved = () => (templates.isSuccess ? templates.data : []);
  const selected = () => approved().find((t) => t.id === draft.templateId);
  const parameterLabels = () => selected()?.parameter_labels ?? [];
  const withinHumanWindow = () =>
    props.account.human_agent_approved &&
    !!props.account.conversation.last_customer_message_at &&
    Date.parse(props.account.conversation.last_customer_message_at) +
      7 * 86400_000 >
      now();
  const allowed = () =>
    props.available &&
    connected() &&
    props.account.can_reply &&
    !upload.isPending &&
    (!draft.uncertainReply || checkedOriginalApp()) &&
    (needsTemplate()
      ? !!selected() &&
        !selected()?.unsupported_reason &&
        draft.parameters.length === parameterLabels().length &&
        draft.parameters.every((p) => p.trim())
      : (open() ||
          (!whatsapp() && draft.humanSupport && withinHumanWindow())) &&
        (!!draft.text.trim() || !!draft.attachment));
  const limit = () =>
    draft.attachment
      ? (mediaCapability()?.caption_limit ?? 0)
      : props.account.text_limit;
  const length = () =>
    draft.attachment || !props.account.text_limit_in_bytes
      ? [...draft.text].length
      : new TextEncoder().encode(draft.text).length;
  const changeText = (value: string) => {
    setDraft('text', value);
    fitInput();
    setDraft('intent', undefined);
    setError('');
  };

  function chooseAttachment() {
    closePicker?.();
    closePicker = openFilePicker(
      {
        multiple: false,
        acceptedMimeTypes: props.account.media.flatMap((c) => c.mime_types),
      },
      async (files) => {
        if (!active) return;
        const file = files[0];
        if (!file) return;
        const type =
          file.type === 'audio/x-m4a'
            ? 'audio/mp4'
            : file.type === 'audio/x-wav'
              ? 'audio/wav'
              : file.type;
        const capability = props.account.media.find((c) =>
          c.mime_types.includes(type)
        );
        if (!capability || file.size > capability.max_bytes) {
          setError(
            'This attachment type or size is unsupported for this account.'
          );
          return;
        }
        if (!capability.caption_limit && draft.text.trim()) {
          setError(
            'Send or clear your text first. This account sends this attachment separately from text.'
          );
          return;
        }
        setError('');
        try {
          const uploaded = await upload.mutateAsync(file);
          if (!active) return;
          setDraft('attachment', uploaded);
          setDraft('intent', undefined);
        } catch (e) {
          if (!active) return;
          setError(
            e instanceof Error &&
              /permission|not configured|reconnect|attachment/.test(e.message)
              ? messagingError(e.message, props.account.provider)
              : 'We couldn’t upload this file. Your draft is still here. Check your connection and attach the file again.'
          );
        }
      }
    );
  }

  function restoreReply(send: MetaSendProgress) {
    if (
      !active ||
      send.user_id !== props.userId ||
      send.channel_id !== props.channelId
    )
      return;
    if (draft.text.trim() || draft.attachment || draft.templateMode) {
      setError(
        'Your current draft is still here. Send or clear it before restoring another reply.'
      );
      queueMicrotask(() => textInput?.focus());
      return;
    }
    setDraft('intent', undefined);
    setError('');
    setDraft('attachment', undefined);
    setDraft('text', '');
    setDraft('templateMode', false);
    setDraft('uncertainReply', send.state === 'unknown');
    setCheckedOriginalApp(false);
    match(send.payload.message)
      .with({ type: 'text' }, (value) => setDraft('text', value.text))
      .with({ type: 'media' }, (value) => {
        setDraft('attachment', {
          document_id: value.document_id,
          kind: value.kind,
          filename: 'Previously attached file',
        });
        setDraft('text', value.caption ?? '');
      })
      .with({ type: 'template' }, (value) => {
        setDraft('templateMode', true);
        setDraft('templateId', value.template_id);
        setDraft('parameters', value.parameters);
      })
      .exhaustive();
    setDraft('humanSupport', send.payload.human_support ?? false);
    queueMicrotask(() => {
      fitInput();
      textInput?.focus();
    });
  }

  async function send() {
    if (!active || !allowed() || mutation.isPending || length() > limit())
      return;
    const focusAtSend = document.activeElement;
    const id = draft.intent ?? crypto.randomUUID();
    setDraft('intent', id);
    setError('');
    const template = selected();
    const request: MetaSendReply = {
      idempotency_key: id,
      human_support: !whatsapp() && draft.humanSupport,
      message:
        needsTemplate() && template
          ? {
              type: 'template',
              template_id: template.id,
              language: template.language,
              parameters: [...draft.parameters],
            }
          : draft.attachment
            ? {
                type: 'media',
                document_id: draft.attachment!.document_id,
                kind: draft.attachment!.kind,
                caption: draft.text.trim() || null,
              }
            : { type: 'text', text: draft.text },
    };
    try {
      await mutation.mutateAsync(request);
      if (!active) return;
      setDraft({
        ...emptyReplyDraft(),
        attachment: undefined,
        intent: undefined,
      });
      setCheckedOriginalApp(false);
    } catch (e) {
      if (!active) return;
      setError(
        e instanceof Error &&
          /network|failed to fetch|fetch failed|timed? ?out|timeout/i.test(
            e.message
          )
          ? 'We couldn’t confirm that your reply was queued. Your draft is still here. Check your connection and try again.'
          : messagingError(
              e instanceof Error ? e.message : undefined,
              props.account.provider
            )
      );
    } finally {
      queueMicrotask(() => {
        if (!active) return;
        fitInput();
        if (
          textInput?.isConnected &&
          (document.activeElement === focusAtSend ||
            document.activeElement === document.body)
        ) {
          textInput.focus();
        }
      });
    }
  }

  return (
    <ComposerSurface>
      <Layout
        oneLineInput={
          !draft.text.includes('\n') &&
          !needsTemplate() &&
          !draft.attachment &&
          !error() &&
          connected() &&
          props.available &&
          props.account.can_reply &&
          open() &&
          !draft.uncertainReply
        }
      >
        <Layout.Body>
          <Layout.Editor class="flex flex-col gap-2">
            <Show when={!props.available}>
              <p role="status" class="text-sm text-ink-muted">
                Connection unavailable. Your draft is saved here; sending will
                resume when the connection returns.
              </p>
            </Show>
            <Show when={draft.uncertainReply}>
              <label class="flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  disabled={mutation.isPending}
                  checked={checkedOriginalApp()}
                  onChange={(e) =>
                    setCheckedOriginalApp(e.currentTarget.checked)
                  }
                />
                I checked {whatsapp() ? 'WhatsApp' : 'Instagram'} and want to
                send this again. The previous reply may already have arrived.
              </label>
            </Show>
            <Show when={!connected()}>
              <p role="status" class="text-sm text-ink-muted">
                {props.account.status === 'connecting'
                  ? 'Finishing the account connection. You can write a draft while you wait.'
                  : (accountHealthMessage(
                      props.account.status,
                      props.account.health_error,
                      props.account.provider
                    ) ??
                    'This account needs attention. Ask a team admin to reconnect it in Settings before sending.')}
              </p>
            </Show>
            <Show when={!props.account.can_reply}>
              <p class="text-sm text-ink-muted">
                Only channel participants who belong to the connected account’s
                team can reply externally.
              </p>
            </Show>
            <Show
              when={needsTemplate()}
              fallback={
                <>
                  <Show
                    when={!draft.attachment || mediaCapability()?.caption_limit}
                  >
                    <textarea
                      ref={(element) => {
                        textInput = element;
                        queueMicrotask(fitInput);
                      }}
                      rows={1}
                      class="block w-full resize-none min-h-6 bg-transparent p-0 text-base leading-6 text-composer-ink placeholder:text-ink-placeholder outline-none"
                      aria-label="External customer reply"
                      placeholder={`Message ${props.account.conversation.customer_display_name ?? props.account.conversation.customer_handle ?? props.account.conversation.customer_phone ?? props.account.conversation.customer_id}…`}
                      value={draft.text}
                      onInput={(e) => changeText(e.currentTarget.value)}
                      onKeyDown={(event) => {
                        if (
                          event.key === 'Enter' &&
                          !event.shiftKey &&
                          !event.altKey &&
                          !event.isComposing &&
                          event.keyCode !== 229 &&
                          !isTouchDevice()
                        ) {
                          event.preventDefault();
                          void send();
                        }
                      }}
                      disabled={mutation.isPending}
                    />
                  </Show>
                  <Show when={draft.attachment}>
                    {(file) => (
                      <div class="flex items-center justify-between gap-2 text-sm">
                        <span class="truncate" title={file().filename}>
                          {file().filename}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={mutation.isPending}
                          onClick={() => {
                            setDraft('attachment', undefined);
                            setDraft('intent', undefined);
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    )}
                  </Show>

                  <Show when={!open() && !whatsapp()}>
                    <Show
                      when={withinHumanWindow()}
                      fallback={
                        <p class="text-xs text-ink-muted">
                          Instagram’s reply window is closed. Wait for a new
                          customer message.
                        </p>
                      }
                    >
                      <label class="flex items-start gap-2 text-xs">
                        <input
                          type="checkbox"
                          disabled={mutation.isPending}
                          checked={draft.humanSupport}
                          onChange={(e) => {
                            setDraft('humanSupport', e.currentTarget.checked);
                            setDraft('intent', undefined);
                          }}
                        />
                        This is a human-authored reply to an unresolved support
                        request. It is not automated or promotional.
                      </label>
                    </Show>
                  </Show>
                  <Show
                    when={
                      limit() > 0 && length() > 0 && length() > limit() * 0.8
                    }
                  >
                    <p class="text-xs text-ink-muted" aria-live="polite">
                      {length() > limit()
                        ? 'This reply is too long. Shorten it before sending.'
                        : whatsapp()
                          ? `${length()}/${limit()}`
                          : length() > limit() * 0.8
                            ? 'You’re close to Instagram’s message limit.'
                            : ''}
                    </p>
                  </Show>
                </>
              }
            >
              <p class="text-sm text-ink-muted">
                {open()
                  ? 'Select an approved template for this account.'
                  : 'WhatsApp’s free-form reply window is closed. Select an approved template for this account.'}
              </p>
              <label class="text-xs">
                Approved template
                <select
                  class="mt-1 w-full bg-input border border-edge-muted rounded p-2 text-sm"
                  aria-label="Approved WhatsApp template"
                  disabled={mutation.isPending}
                  value={draft.templateId}
                  onChange={(e) => {
                    setDraft('templateId', e.currentTarget.value);
                    setDraft('parameters', []);
                    setDraft('intent', undefined);
                  }}
                >
                  <option value="">Choose a template and language</option>
                  <For each={approved()}>
                    {(t) => (
                      <option value={t.id} disabled={!!t.unsupported_reason}>
                        {t.name} · {t.language}
                        {t.unsupported_reason ? ' · Unsupported format' : ''}
                      </option>
                    )}
                  </For>
                </select>
              </label>
              <Show when={selected()}>
                {(t) => (
                  <pre class="whitespace-pre-wrap break-words text-xs text-ink-muted max-h-32 overflow-auto">
                    {templatePreview(t().components)}
                  </pre>
                )}
              </Show>
              <For each={parameterLabels()}>
                {(label, index) => (
                  <label class="text-xs capitalize">
                    {label}
                    <input
                      disabled={mutation.isPending}
                      class="mt-1 w-full bg-input border border-edge-muted rounded p-2 text-sm"
                      value={draft.parameters[index()] ?? ''}
                      onInput={(e) => {
                        const next = [...draft.parameters];
                        next[index()] = e.currentTarget.value;
                        setDraft('parameters', next);
                        setDraft('intent', undefined);
                      }}
                    />
                  </label>
                )}
              </For>
              <Show when={templates.isSuccess && approved().length === 0}>
                <p class="text-xs text-ink-muted">
                  No approved templates are available for this account.
                </p>
              </Show>
              <Show when={templates.isError}>
                <p role="alert" class="text-xs text-ink-muted">
                  Templates could not load.{' '}
                  <button
                    class="underline"
                    onClick={() => void templates.refetch()}
                  >
                    Retry
                  </button>
                </p>
              </Show>
            </Show>

            <Show when={error()}>
              <p role="alert" class="text-sm text-ink-muted">
                {error()}
              </p>
            </Show>
          </Layout.Editor>
        </Layout.Body>
        <Layout.ActionsLeft>
          <Show when={!needsTemplate()}>
            <Button
              variant="ghost"
              size="icon-composer"
              aria-label={
                upload.isPending ? 'Uploading attachment' : 'Attach file'
              }
              title="Attach file"
              disabled={
                !connected() ||
                !props.account.can_reply ||
                upload.isPending ||
                mutation.isPending
              }
              onClick={chooseAttachment}
            >
              <PaperclipIcon class="size-4" aria-hidden="true" />
            </Button>
          </Show>
          <Show when={whatsapp() && open()}>
            <Button
              variant="ghost"
              size="icon-composer"
              label={
                draft.templateMode ? 'Use text reply' : 'Use approved template'
              }
              title={
                draft.templateMode ? 'Use text reply' : 'Use approved template'
              }
              disabled={mutation.isPending}
              onClick={() => {
                setDraft('templateMode', !draft.templateMode);
                setDraft('intent', undefined);
              }}
            >
              <TemplateIcon class="size-4" aria-hidden="true" />
            </Button>
          </Show>
        </Layout.ActionsLeft>
        <Layout.ActionsRight>
          <SendButton
            appearance="composer"
            class="touch:rounded-full"
            aria-label={
              mutation.isPending
                ? 'Sending reply'
                : `Send reply via ${whatsapp() ? 'WhatsApp' : 'Instagram'}`
            }
            tooltip="Send message"
            shortcut="enter"
            aria-keyshortcuts="Enter Control+Enter Meta+Enter"
            disabled={!allowed() || mutation.isPending || length() > limit()}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => void send()}
          />
        </Layout.ActionsRight>
      </Layout>
    </ComposerSurface>
  );
}

function templatePreview(components: unknown): string {
  if (!Array.isArray(components)) return '';
  return components
    .flatMap((part: unknown) =>
      part &&
      typeof part === 'object' &&
      'text' in part &&
      typeof part.text === 'string'
        ? [part.text]
        : []
    )
    .join('\n');
}
