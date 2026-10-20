import type {
  CalendarAttendeeInputBody,
  ConferenceChange,
  CreateCalendarEventRequest,
  EventReminders,
  EventTime,
  EventTransparency,
  EventVisibility,
  OutOfOfficeProperties,
  TeamCalendarSharing,
} from '../../../generated/calendar/types.gen';
import type {
  ListOccurrencesData,
  ListTeamCalendarData,
  ListTeamOutOfOfficeData,
} from '../../../generated/storage/types.gen';
import { paginate, unwrap } from '../../utils';
import type { MacroClient } from '../../utils/client';
import type { Link } from '../email/link';
import { User } from '../users/user';
import { Calendar } from './calendar';
import { CalendarEvent } from './event';
import { CalendarReplacement } from './replacement';

/** Fields for a new calendar event. */
export interface CreateEventOptions {
  /** Display title. */
  title: string;
  /** Timed or all-day shape. */
  time: EventTime;
  /** Optional event body. */
  description?: string;
  /** Optional location label. */
  location?: string;
  /** Invited attendees. */
  attendees?: CalendarAttendeeInputBody[];
  /** Raw RFC 5545 recurrence properties (`RRULE`, `RDATE`, `EXDATE`). */
  recurrenceLines?: string[];
  /** Event visibility. */
  visibility?: EventVisibility;
  /** Availability behavior. */
  transparency?: EventTransparency;
  /** Reminder configuration; omit to keep the calendar defaults. */
  reminders?: EventReminders;
  /** Conference to attach; omit to create the event without one. */
  conference?: ConferenceChange;
  /** Mint a Macro call with the event; its join link lands in the description
   * and location. Cannot be combined with `conference`. */
  macroCall?: boolean;
  /** Out-of-office properties; present to create an out-of-office event. */
  outOfOffice?: OutOfOfficeProperties;
  /** Exact calendar to create the event on; takes precedence over the inbox
   * default. */
  calendar?: Calendar;
  /** Connected inbox whose primary calendar receives the event; defaults to the
   * requester's primary inbox. */
  emailLink?: Link;
}

/**
 * The calendar surface: the caller's visible calendars, event creation, and
 * handles to individual events and calendars. Backed by calendar_service (the
 * SDK reaches it on the gateway's `/calendar` route).
 */
export class CalendarNamespace {
  /** Calendar availability settings, each referring to a typed calendar. */
  async availabilityCalendars() {
    return unwrap(
      await this.client.calendar.getAvailabilityCalendars(),
    ).calendars.map((record) => ({
      calendar: Calendar.byId(this.client, record.calendarId),
      name: record.name,
      isPrimary: record.isPrimary,
      contributesToAvailability: record.contributesToAvailability,
    }));
  }

  /** Current sharing preference for the team calendar. */
  async teamSharing(): Promise<TeamCalendarSharing> {
    return unwrap(await this.client.calendar.getTeamSharing()).sharing;
  }

  /** Replace the team calendar sharing preference. */
  async setTeamSharing(
    sharing: TeamCalendarSharing,
  ): Promise<TeamCalendarSharing> {
    return unwrap(
      await this.client.calendar.setTeamSharing({ body: { sharing } }),
    ).sharing;
  }

  /** Calendar occurrences in a viewport, automatically paginated. */
  occurrences(options: Omit<ListOccurrencesData['query'], 'cursor'>) {
    return paginate(async (cursor) => {
      const page = unwrap(
        await this.client.storage.listOccurrences({
          query: { ...options, cursor },
        }),
      );
      return {
        items: page.items.map((item) => ({
          event: CalendarEvent.fromRecord(this.client, item.event),
          occurrence: item.occurrence,
        })),
        nextCursor: page.nextCursor,
      };
    });
  }

  /** A page of team availability, including its roster and continuation cursor. */
  async teamPage(options: NonNullable<ListTeamCalendarData['query']>) {
    const page = unwrap(
      await this.client.storage.listTeamCalendar({ query: options }),
    );
    return {
      items: page.items.map(({ ownerId, ...item }) => ({
        ...item,
        owner: User.byId(this.client, ownerId),
      })),
      members: page.members.map((member) => ({
        user: User.byId(this.client, member.userId),
        sharing: member.sharing,
        coverage: member.coverage,
      })),
      nextCursor: page.nextCursor ?? undefined,
    };
  }

  /** Teammates' out-of-office occurrences in a bounded viewport. Check hasMore for truncation. */
  async teamOutOfOffice(
    options: NonNullable<ListTeamOutOfOfficeData['query']>,
  ) {
    const page = unwrap(
      await this.client.storage.listTeamOutOfOffice({ query: options }),
    );
    return {
      items: page.items.map((item) => ({
        event: CalendarEvent.byId(this.client, item.eventId),
        owner: User.byId(this.client, item.ownerId),
        occurrenceKey: item.occurrenceKey,
        time: item.time,
        title: item.title ?? undefined,
      })),
      hasMore: page.hasMore,
    };
  }

  constructor(private readonly client: MacroClient) {}

  /** The caller's visible calendars, primaries and writable first. */
  calendars(): Promise<Calendar[]> {
    return Calendar.list(this.client);
  }

  /** A handle to a calendar by id. Detail loads on first access. */
  calendar(id: string): Calendar {
    return Calendar.byId(this.client, id);
  }

  /** A handle to a calendar event by id, for driving mutations. */
  event(id: string): CalendarEvent {
    return CalendarEvent.byId(this.client, id);
  }

  /** Recover a saved replacement, including after its original event was retired. */
  replacement(operationId: string): CalendarReplacement {
    return new CalendarReplacement(this.client, operationId);
  }

  /** Create a calendar event and return a handle to its synced record. */
  async createEvent(options: CreateEventOptions): Promise<CalendarEvent> {
    const record = unwrap(
      await this.client.calendar.createCalendarEvent({
        body: toCreateBody(options),
      }),
    );
    return CalendarEvent.fromRecord(this.client, record);
  }
}

function toCreateBody(options: CreateEventOptions): CreateCalendarEventRequest {
  return {
    title: options.title,
    time: options.time,
    description: options.description,
    location: options.location,
    attendees: options.attendees,
    recurrenceLines: options.recurrenceLines,
    visibility: options.visibility,
    transparency: options.transparency,
    reminders: options.reminders,
    conference: options.conference,
    macroCall: options.macroCall,
    outOfOffice: options.outOfOffice,
    calendarId: options.calendar?.id,
    emailLinkId: options.emailLink?.id,
  };
}
