import {
  Card,
  CardBody,
  CardFooter,
  CardHeader,
} from '@app/features/agent-cards/components/kit/card';
import { DateTile, Tile } from '@app/features/agent-cards/components/kit/parts';
import {
  EmailDraft,
  EventDraft,
} from '@app/features/block-agent/component/parts/UserToolCall';
import { CalendarDraftComposer } from '@core/component/AI/component/tool/calendar/DraftComposer';
import { EmailDraftComposer } from '@core/component/AI/component/tool/email/DraftComposer';
import Envelope from '@phosphor/envelope-simple.svg';
import NotePencil from '@phosphor/note-pencil.svg';
import type {
  CreateCalendarEvent,
  EmailRecipient,
  SendEmail,
} from '@service-cognition/generated/tools/types';
import { Button } from '@ui';
import { createSignal, type JSX, Match, Show, Switch } from 'solid-js';
import type { DraftKeeper } from '../context/interaction';
import { createElicitationReviewSink } from '../state/elicitation-review-sink';
import {
  type DraftedTool,
  type ReviewInputs,
  UserToolComposer,
} from './LiveElicitation';

/** `Ana Ruiz`, or the address when the draft gave no name. */
function personName(recipient: EmailRecipient): string {
  return recipient.name?.trim() || recipient.email;
}

/** Who an email goes to, for its card's title: `Ana Ruiz and 2 others`. */
export function recipientsTitle(to: readonly EmailRecipient[]): string {
  const [first, ...rest] = to;
  if (!first) return 'New email';
  if (rest.length === 0) return personName(first);
  return `${personName(first)} and ${rest.length} ${rest.length === 1 ? 'other' : 'others'}`;
}

/** The day a drafted event starts, for its date tile. */
function eventDay(event: CreateCalendarEvent): Date | undefined {
  const time = event.time;
  if (time.kind === 'allDay') {
    const [year, month, day] = time.startDate.split('-').map(Number);
    return year ? new Date(year, (month ?? 1) - 1, day ?? 1) : undefined;
  }
  const start = new Date(time.startsAt);
  return Number.isNaN(start.getTime()) ? undefined : start;
}

/**
 * Something the agent wrote that goes out under the user's name, as one
 * card: what it is and who it goes to, the draft as it will read, then
 * Discard, Edit - the real composer, in place - and the one action that
 * sends it as it is. While editing, the composer's own button sends.
 */
function DraftShell(props: {
  tile: JSX.Element;
  title: string;
  subtitle: string;
  /** The draft, read-only. */
  preview: JSX.Element;
  /** The draft in its composer, for editing in place. */
  editor: JSX.Element;
  /** `Send`, `Create event`. */
  sendLabel: string;
  onSend: () => void;
  onDiscard: () => void;
  locked: boolean;
  /** Open in the composer: the user was editing when it last showed. */
  editing?: boolean;
  /** The user opened the composer. */
  onEdit?: () => void;
}) {
  const [editing, setEditing] = createSignal(props.editing ?? false);
  return (
    <Card width="standard" data-agent-card="draft">
      <section aria-label={props.title} class="flex min-h-0 flex-col">
        <CardHeader
          center
          tile={props.tile}
          title={props.title}
          subtitle={
            editing() ? 'Editing · the changes are yours' : props.subtitle
          }
        />
        <CardBody class={editing() ? undefined : 'max-h-72 overflow-y-auto'}>
          <Show when={editing()} fallback={props.preview}>
            {props.editor}
          </Show>
        </CardBody>
        <CardFooter line>
          <Button
            size="sm"
            variant="ghost"
            class="mr-auto"
            disabled={props.locked}
            onClick={() => props.onDiscard()}
          >
            Discard
          </Button>
          <Show when={!editing()}>
            <Button
              size="sm"
              variant="outline"
              disabled={props.locked}
              onClick={() => {
                setEditing(true);
                props.onEdit?.();
              }}
            >
              <NotePencil />
              Edit
            </Button>
            <Button
              size="sm"
              variant="cta"
              disabled={props.locked}
              onClick={() => props.onSend()}
            >
              {props.sendLabel}
            </Button>
          </Show>
        </CardFooter>
      </section>
    </Card>
  );
}

/** An email the agent drafted, waiting on the user to send it. */
function EmailDraftCard(props: {
  email: SendEmail;
  toolCall: string;
  review: ReviewInputs;
  draft?: DraftKeeper<unknown>;
}) {
  // The user's edit from before the card last unmounted, which the
  // composer kept as the email it would send.
  const edited = props.draft?.saved as SendEmail | undefined;
  const email = edited ?? props.email;
  const sink = createElicitationReviewSink<SendEmail>({
    ...props.review,
    onEdit: (args) => props.draft?.save(args),
  });
  const subject = () => email.subject.trim();
  return (
    <DraftShell
      tile={
        <Tile size={32}>
          <Envelope />
        </Tile>
      }
      title={recipientsTitle(email.to)}
      subtitle={subject() ? `Draft email · ${subject()}` : 'Draft email'}
      preview={<EmailDraft email={email} inFlight={false} />}
      editor={
        <EmailDraftComposer
          initialData={email}
          sink={sink}
          debugName={`agent-review:${props.toolCall}`}
        />
      }
      sendLabel="Send"
      onSend={() => void sink.onExecute(email)}
      onDiscard={() => void sink.onReject()}
      locked={!props.review.canAnswer()}
      editing={edited !== undefined}
      onEdit={() => props.draft?.save(email)}
    />
  );
}

/** An event the agent drafted, waiting on the user to create it. */
function EventDraftCard(props: {
  event: CreateCalendarEvent;
  toolCall: string;
  review: ReviewInputs;
  draft?: DraftKeeper<unknown>;
}) {
  // The user's edit from before the card last unmounted.
  const edited = props.draft?.saved as CreateCalendarEvent | undefined;
  const event = edited ?? props.event;
  const sink = createElicitationReviewSink<CreateCalendarEvent>({
    ...props.review,
    onEdit: (args) => props.draft?.save(args),
  });
  const day = () => eventDay(event);
  return (
    <DraftShell
      tile={
        <Show
          when={day()}
          fallback={
            <Tile size={32}>
              <NotePencil />
            </Tile>
          }
        >
          {(start) => <DateTile date={start()} size={32} />}
        </Show>
      }
      title={event.title?.trim() || 'New event'}
      subtitle="Draft event"
      preview={<EventDraft event={event} />}
      editor={
        <CalendarDraftComposer
          initialData={event}
          sink={sink}
          previewKey={props.toolCall}
        />
      }
      sendLabel="Create event"
      onSend={() => void sink.onExecute(event)}
      onDiscard={() => void sink.onReject()}
      locked={!props.review.canAnswer()}
      editing={edited !== undefined}
      onEdit={() => props.draft?.save(event)}
    />
  );
}

/**
 * A user tool the agent drafted and is waiting on the user to finish: an
 * email to send or an event to create, as a draft card; any other tool in
 * its own composer, inside the same card.
 */
export function DraftCard(props: {
  tool: DraftedTool;
  toolCall: string;
  message: string;
  review: ReviewInputs;
  /** The flat form, for a tool this client has no composer for. */
  fallback: JSX.Element;
  /** Where the user's edit is kept, so it outlives the card. */
  draft?: DraftKeeper<unknown>;
}) {
  return (
    <Switch
      fallback={
        <Card width="standard" data-agent-card="draft">
          <CardHeader
            center
            padded
            tile={
              <Tile size={32}>
                <NotePencil />
              </Tile>
            }
            title={props.message}
          />
          <CardBody class="max-h-80 overflow-y-auto pt-0">
            <UserToolComposer
              tool={props.tool}
              toolCall={props.toolCall}
              cancel
              fallback={props.fallback}
              review={props.review}
            />
          </CardBody>
        </Card>
      }
    >
      <Match when={props.tool.name === 'SendEmail'}>
        <EmailDraftCard
          email={props.tool.data as SendEmail}
          toolCall={props.toolCall}
          review={props.review}
          draft={props.draft}
        />
      </Match>
      <Match when={props.tool.name === 'CreateCalendarEvent'}>
        <EventDraftCard
          event={props.tool.data as CreateCalendarEvent}
          toolCall={props.toolCall}
          review={props.review}
          draft={props.draft}
        />
      </Match>
    </Switch>
  );
}
